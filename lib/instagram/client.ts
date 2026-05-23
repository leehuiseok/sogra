// lib/instagram/client.ts
// 인스타그램 게시 클라이언트 — Mock/Real 분기 (Plan §Step 5 / CB-1)
// MOCK_INSTAGRAM_PUBLISH=true → mockPublish (App Review 통과 전 기본값)
// MOCK_INSTAGRAM_PUBLISH=false → realPublish (Graph API v21.0 / feed 전용)
// reels/stories는 하이브리드 흐름(다운로드 → 사장님 수동 업로드) — realPublish 대상이 아님

import { createAdminClient } from '@/lib/supabase/server'

export type PublishKind = 'feed' | 'reels' | 'stories'

export type PublishMode = 'mock' | 'real'

export type PublishInput = {
  store_id: string
  content_id: string
  caption: string
  media_storage_url: string | null
  kind: PublishKind
}

export type PublishResult = {
  mode: PublishMode
  ig_media_id: string | null
  ig_permalink: string | null
}

export class InstagramPublishError extends Error {
  code:
    | 'reels_hybrid_only'
    | 'missing_token'
    | 'missing_ig_user_id'
    | 'graph_api_error'
    | 'graph_api_rate_limit'
    | 'graph_api_server_error'
    | 'invalid_media_url'

  status?: number

  constructor(
    code: InstagramPublishError['code'],
    message: string,
    status?: number,
  ) {
    super(message)
    this.code = code
    this.status = status
  }
}

// Mock 모드: 실제 게시 없이 mode='mock'만 반환.
// 사장님이 별도 다운로드 → 수동 업로드 흐름을 따른 뒤, 사후 매처(Lane 5)가
// ig_media_id/ig_permalink를 webhook insights 응답에서 매칭으로 채움.
async function mockPublish(_input: PublishInput): Promise<PublishResult> {
  return {
    mode: 'mock',
    ig_media_id: null,
    ig_permalink: null,
  }
}

type GraphCreateMediaResponse = {
  id?: string
  error?: { message: string; type: string; code: number }
}

type GraphPublishResponse = {
  id?: string
  error?: { message: string; type: string; code: number }
}

type GraphMediaInfoResponse = {
  id?: string
  permalink?: string
  error?: { message: string; type: string; code: number }
}

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0'

// 지수 백오프 — 1초, 2초, 4초 (Plan §Step 5: max 3 retries on 5xx / rate limit)
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Graph API 호출 — 5xx / rate limit (HTTP 429, error.code 4/17/32/613)에 한해 재시도
async function callGraphWithRetry<T>(
  url: string,
  init: RequestInit,
): Promise<T> {
  let lastErr: InstagramPublishError | null = null

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    let response: Response
    try {
      response = await globalThis.fetch(url, init)
    } catch {
      // 네트워크 실패 — 재시도 대상
      lastErr = new InstagramPublishError(
        'graph_api_server_error',
        '인스타그램 API 호출 실패 (네트워크 오류).',
      )
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt])
        continue
      }
      throw lastErr
    }

    const json = (await response.json().catch(() => ({}))) as {
      error?: { message: string; type: string; code: number }
    }

    if (response.ok && !json.error) {
      return json as T
    }

    const isRateLimit =
      response.status === 429 ||
      json.error?.code === 4 ||
      json.error?.code === 17 ||
      json.error?.code === 32 ||
      json.error?.code === 613
    const isServerError = response.status >= 500

    if ((isRateLimit || isServerError) && attempt < RETRY_DELAYS_MS.length) {
      lastErr = new InstagramPublishError(
        isRateLimit ? 'graph_api_rate_limit' : 'graph_api_server_error',
        isRateLimit
          ? '인스타그램 API 호출 한도 초과 — 잠시 후 재시도합니다.'
          : '인스타그램 API 서버 오류 — 잠시 후 재시도합니다.',
        response.status,
      )
      await sleep(RETRY_DELAYS_MS[attempt])
      continue
    }

    throw new InstagramPublishError(
      'graph_api_error',
      json.error?.message ?? `인스타그램 API 호출 실패 (HTTP ${response.status}).`,
      response.status,
    )
  }

  throw lastErr ?? new InstagramPublishError('graph_api_error', '인스타그램 API 호출 실패.')
}

// Real 모드: feed(이미지) 전용. Graph API 2단계 — create container → publish.
async function realPublish(input: PublishInput): Promise<PublishResult> {
  if (input.kind !== 'feed') {
    // reels/stories는 하이브리드 흐름만 — App Review에서 video upload 권한 미보유.
    throw new InstagramPublishError(
      'reels_hybrid_only',
      'reels/stories는 자동 게시를 지원하지 않습니다 — 다운로드 후 사장님이 수동 업로드해 주세요.',
    )
  }

  if (!input.media_storage_url) {
    throw new InstagramPublishError(
      'invalid_media_url',
      '게시할 이미지 URL이 없습니다.',
    )
  }

  // service_role로 store_profiles에서 IG 자격 정보 조회
  const admin = createAdminClient()
  const { data: store, error: storeErr } = await admin
    .from('store_profiles')
    .select('ig_user_id, ig_access_token')
    .eq('id', input.store_id)
    .maybeSingle()

  if (storeErr || !store) {
    throw new InstagramPublishError(
      'missing_token',
      '매장 IG 자격 정보를 조회할 수 없습니다.',
    )
  }

  if (!store.ig_access_token) {
    throw new InstagramPublishError(
      'missing_token',
      '인스타그램 액세스 토큰이 없습니다 — 온보딩에서 IG 계정을 다시 연결해 주세요.',
    )
  }

  if (!store.ig_user_id) {
    throw new InstagramPublishError(
      'missing_ig_user_id',
      '인스타그램 비즈니스 계정이 연결되어 있지 않습니다.',
    )
  }

  const igUserId = store.ig_user_id
  const accessToken = store.ig_access_token

  // 1단계: 미디어 컨테이너 생성
  const createUrl = new URL(`${GRAPH_API_BASE}/${igUserId}/media`)
  createUrl.searchParams.set('image_url', input.media_storage_url)
  createUrl.searchParams.set('caption', input.caption)
  createUrl.searchParams.set('access_token', accessToken)

  const created = await callGraphWithRetry<GraphCreateMediaResponse>(
    createUrl.toString(),
    { method: 'POST' },
  )

  if (!created.id) {
    throw new InstagramPublishError(
      'graph_api_error',
      '인스타그램 미디어 컨테이너 생성에 실패했습니다.',
    )
  }

  // 2단계: 컨테이너 게시
  const publishUrl = new URL(`${GRAPH_API_BASE}/${igUserId}/media_publish`)
  publishUrl.searchParams.set('creation_id', created.id)
  publishUrl.searchParams.set('access_token', accessToken)

  const published = await callGraphWithRetry<GraphPublishResponse>(
    publishUrl.toString(),
    { method: 'POST' },
  )

  if (!published.id) {
    throw new InstagramPublishError(
      'graph_api_error',
      '인스타그램 게시에 실패했습니다.',
    )
  }

  // 3단계 (부가): permalink 조회 — 실패해도 게시 자체는 성공으로 간주
  let permalink: string | null = null
  try {
    const infoUrl = new URL(`${GRAPH_API_BASE}/${published.id}`)
    infoUrl.searchParams.set('fields', 'id,permalink')
    infoUrl.searchParams.set('access_token', accessToken)
    const info = await callGraphWithRetry<GraphMediaInfoResponse>(
      infoUrl.toString(),
      { method: 'GET' },
    )
    permalink = info.permalink ?? null
  } catch {
    permalink = null
  }

  return {
    mode: 'real',
    ig_media_id: published.id,
    ig_permalink: permalink,
  }
}

// 공개 진입점 — env 토글로 Mock/Real 분기
export async function publishToInstagram(input: PublishInput): Promise<PublishResult> {
  const useMock = process.env.MOCK_INSTAGRAM_PUBLISH === 'true'

  if (useMock) {
    return mockPublish(input)
  }

  return realPublish(input)
}
