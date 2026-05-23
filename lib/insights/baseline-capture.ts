// lib/insights/baseline-capture.ts
// 베이스라인 인사이트 캡처 — 가입 직후 30일 IG 데이터 4분기 처리 (Plan §AC-11 / RI-5)
//
// 분기 규칙:
//   - not_applicable : IG 비즈/크리에이터가 아니거나 토큰이 없음
//   - new_account    : IG 계정 연령이 30일 미만
//   - insufficient   : 최근 30일 게시 수 < 10
//   - captured       : 최근 30일 게시 수 >= 10 → likes/reach/saves 평균 계산
//
// 결과는 baseline_insight_windows 테이블에 upsert (store_id UNIQUE).
// service-role 클라이언트로만 호출한다.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

// ---------------------------------------------------------------
// 타입
// ---------------------------------------------------------------
export type BaselineStatus =
  | 'captured'
  | 'insufficient'
  | 'new_account'
  | 'not_applicable'

export interface BaselineResult {
  status: BaselineStatus
  baseline_likes_avg?: number
  baseline_reach_avg?: number
  baseline_saves_avg?: number
  posts_sampled?: number
  ig_account_age_days?: number
  sample_window_start?: string
  sample_window_end?: string
  // 한국어 UX 메시지 — 대시보드 BaselineStatusCard 가 직접 노출
  status_reason: string
}

// store_profiles 에서 캡처에 필요한 최소 필드
export interface BaselineStoreInput {
  store_id: string
  ig_user_id: string | null
  ig_account_type: string | null
  ig_access_token: string | null
  // ig_user_id 의 created_time 을 못 얻을 때 폴백으로 쓰는 매장 가입일
  store_created_at: string
}

// ---------------------------------------------------------------
// Graph API 응답 — 부분 타입
// ---------------------------------------------------------------
interface IgAccountMeta {
  id: string
  created_time?: string // ⚠ Meta 가 노출하지 않을 수 있음 — 폴백으로 store_created_at 사용
  error?: { message: string; code: number }
}

interface IgMediaInsightValue {
  value: number
}
interface IgMediaInsightEntry {
  name: 'likes' | 'reach' | 'saved' | string
  values?: IgMediaInsightValue[]
}
interface IgMediaItem {
  id: string
  timestamp?: string
  insights?: { data?: IgMediaInsightEntry[] }
}
interface IgMediaListResponse {
  data?: IgMediaItem[]
  paging?: { next?: string }
  error?: { message: string; code: number }
}

// ---------------------------------------------------------------
// 상수
// ---------------------------------------------------------------
const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0'
const BASELINE_WINDOW_DAYS = 30
const MIN_POSTS_FOR_CAPTURE = 10
const MAX_MEDIA_PAGES = 5 // 페이지네이션 안전장치 (한 페이지 25개 × 5 = 최대 125)

// ---------------------------------------------------------------
// 메인 진입점
// ---------------------------------------------------------------
export async function captureBaseline(args: {
  admin: SupabaseClient<Database>
  store: BaselineStoreInput
}): Promise<BaselineResult> {
  const { store } = args

  // 1) 토큰·계정 유형 사전 점검 → not_applicable
  if (
    !store.ig_user_id ||
    !store.ig_access_token ||
    (store.ig_account_type !== 'BUSINESS' &&
      store.ig_account_type !== 'CREATOR')
  ) {
    return {
      status: 'not_applicable',
      status_reason: '비즈니스 계정 전환 후 측정 시작',
    }
  }

  const now = new Date()
  const windowStart = new Date(
    now.getTime() - BASELINE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  )

  // 2) IG 계정 연령 확인 → new_account 판단
  const accountAgeDays = await resolveAccountAgeDays({
    igUserId: store.ig_user_id,
    accessToken: store.ig_access_token,
    fallbackCreatedAt: store.store_created_at,
  })

  if (accountAgeDays !== null && accountAgeDays < BASELINE_WINDOW_DAYS) {
    return {
      status: 'new_account',
      ig_account_age_days: accountAgeDays,
      sample_window_start: windowStart.toISOString(),
      sample_window_end: now.toISOString(),
      status_reason: '사용 시작 30일 후 측정 가능',
    }
  }

  // 3) 최근 30일 미디어 + 인사이트 수집
  const mediaItems = await fetchRecentMediaWithInsights({
    igUserId: store.ig_user_id,
    accessToken: store.ig_access_token,
    since: windowStart,
    until: now,
  })

  const postsSampled = mediaItems.length

  // 4) 표본 부족 → insufficient
  if (postsSampled < MIN_POSTS_FOR_CAPTURE) {
    return {
      status: 'insufficient',
      posts_sampled: postsSampled,
      ig_account_age_days: accountAgeDays ?? undefined,
      sample_window_start: windowStart.toISOString(),
      sample_window_end: now.toISOString(),
      status_reason: '30일 데이터가 누적되면 측정을 시작해요',
    }
  }

  // 5) 평균 계산 → captured
  const averages = computeAverages(mediaItems)

  return {
    status: 'captured',
    baseline_likes_avg: averages.likes,
    baseline_reach_avg: averages.reach,
    baseline_saves_avg: averages.saves,
    posts_sampled: postsSampled,
    ig_account_age_days: accountAgeDays ?? undefined,
    sample_window_start: windowStart.toISOString(),
    sample_window_end: now.toISOString(),
    status_reason: '베이스라인 캡처 완료',
  }
}

// ---------------------------------------------------------------
// upsert 헬퍼 — Inngest 트리거에서 사용
// ---------------------------------------------------------------
export async function upsertBaselineResult(args: {
  admin: SupabaseClient<Database>
  store_id: string
  result: BaselineResult
}): Promise<void> {
  const { admin, store_id, result } = args
  const nowIso = new Date().toISOString()

  const { error } = await admin.from('baseline_insight_windows').upsert(
    {
      store_id,
      status: result.status,
      baseline_likes_avg: result.baseline_likes_avg ?? null,
      baseline_reach_avg: result.baseline_reach_avg ?? null,
      baseline_saves_avg: result.baseline_saves_avg ?? null,
      posts_sampled: result.posts_sampled ?? null,
      sample_window_start: result.sample_window_start ?? null,
      sample_window_end: result.sample_window_end ?? null,
      ig_account_age_days: result.ig_account_age_days ?? null,
      status_reason: result.status_reason,
      captured_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: 'store_id' },
  )

  if (error) {
    throw new Error(`baseline upsert 실패: ${error.message}`)
  }
}

// ---------------------------------------------------------------
// 내부: IG 계정 연령 계산
//   - 1차: Graph API GET /{ig_user_id}?fields=created_time
//   - 폴백: store_profiles.created_at (Meta 가 created_time 미노출 가능)
// ---------------------------------------------------------------
async function resolveAccountAgeDays(args: {
  igUserId: string
  accessToken: string
  fallbackCreatedAt: string
}): Promise<number | null> {
  const url = new URL(`${GRAPH_API_BASE}/${args.igUserId}`)
  url.searchParams.set('fields', 'id,created_time')
  url.searchParams.set('access_token', args.accessToken)

  let createdIso: string | null = null
  try {
    const res = await globalThis.fetch(url.toString())
    const data = (await res.json()) as IgAccountMeta
    if (!data.error && data.created_time) {
      createdIso = data.created_time
    }
  } catch {
    // 네트워크 실패는 폴백으로 진행
  }

  // Meta 가 created_time 을 미노출하는 경우가 잦다 → 매장 가입일을 폴백으로 사용
  const baseIso = createdIso ?? args.fallbackCreatedAt
  if (!baseIso) return null

  const created = new Date(baseIso).getTime()
  if (Number.isNaN(created)) return null

  const diffMs = Date.now() - created
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)))
}

// ---------------------------------------------------------------
// 내부: 최근 30일 게시물 + 인사이트 수집
// ---------------------------------------------------------------
async function fetchRecentMediaWithInsights(args: {
  igUserId: string
  accessToken: string
  since: Date
  until: Date
}): Promise<IgMediaItem[]> {
  const sinceUnix = Math.floor(args.since.getTime() / 1000)
  const untilUnix = Math.floor(args.until.getTime() / 1000)

  // since/until 은 unix(초) — Graph API 사양
  const firstUrl = new URL(`${GRAPH_API_BASE}/${args.igUserId}/media`)
  firstUrl.searchParams.set(
    'fields',
    'id,timestamp,insights.metric(likes,reach,saved)',
  )
  firstUrl.searchParams.set('since', String(sinceUnix))
  firstUrl.searchParams.set('until', String(untilUnix))
  firstUrl.searchParams.set('limit', '25')
  firstUrl.searchParams.set('access_token', args.accessToken)

  const collected: IgMediaItem[] = []
  let nextUrl: string | undefined = firstUrl.toString()
  let pages = 0

  while (nextUrl && pages < MAX_MEDIA_PAGES) {
    try {
      const res = await globalThis.fetch(nextUrl)
      const data = (await res.json()) as IgMediaListResponse
      if (data.error) break
      if (data.data?.length) collected.push(...data.data)
      nextUrl = data.paging?.next
    } catch {
      break
    }
    pages += 1
  }

  return collected
}

// ---------------------------------------------------------------
// 내부: 평균 계산 (소수 셋째 자리에서 반올림)
// ---------------------------------------------------------------
function computeAverages(items: IgMediaItem[]): {
  likes: number
  reach: number
  saves: number
} {
  let likesSum = 0
  let reachSum = 0
  let savesSum = 0
  let count = 0

  for (const item of items) {
    const entries = item.insights?.data ?? []
    let likes = 0
    let reach = 0
    let saves = 0
    for (const entry of entries) {
      const value = entry.values?.[0]?.value ?? 0
      if (entry.name === 'likes') likes = value
      else if (entry.name === 'reach') reach = value
      else if (entry.name === 'saved') saves = value
    }
    likesSum += likes
    reachSum += reach
    savesSum += saves
    count += 1
  }

  if (count === 0) return { likes: 0, reach: 0, saves: 0 }

  return {
    likes: round3(likesSum / count),
    reach: round3(reachSum / count),
    saves: round3(savesSum / count),
  }
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
