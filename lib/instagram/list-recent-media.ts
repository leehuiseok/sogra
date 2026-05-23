// lib/instagram/list-recent-media.ts
// Meta Graph API /{ig_user_id}/media wrapper — 최근 게시물 목록 조회 (Lane 5)
// fetch만 사용, 외부 SDK 없음.

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0'

export type IgMediaItem = {
  id: string
  caption: string | null
  permalink: string | null
  timestamp: string // ISO 8601
}

type GraphMediaListResponse = {
  data?: Array<{
    id: string
    caption?: string
    permalink?: string
    timestamp?: string
  }>
  error?: { message: string; code: number }
}

// 최근 게시물 최대 50개 조회. 토큰/id 오류 시 빈 배열 반환.
export async function listRecentMedia(
  igUserId: string,
  accessToken: string,
  limit = 50,
): Promise<IgMediaItem[]> {
  const url = new URL(`${GRAPH_API_BASE}/${igUserId}/media`)
  url.searchParams.set('fields', 'id,caption,permalink,timestamp')
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('access_token', accessToken)

  let res: Response
  try {
    res = await globalThis.fetch(url.toString())
  } catch {
    // 네트워크 오류 — 매처가 이 store를 skip하도록 빈 배열 반환
    return []
  }

  const json = (await res.json().catch(() => ({}))) as GraphMediaListResponse

  if (!res.ok || json.error || !json.data) {
    return []
  }

  return json.data.map((item) => ({
    id: item.id,
    caption: item.caption ?? null,
    permalink: item.permalink ?? null,
    timestamp: item.timestamp ?? new Date(0).toISOString(),
  }))
}
