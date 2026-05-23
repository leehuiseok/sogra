// inngest/functions/ig-media-id-matcher.ts
// Mock 모드 게시물의 ig_media_id 사후 매칭 (Plan §Step 5 / Lane 5)
//
// 트리거:
//   1) cron: 0 */2 * * * — 2시간 간격 자동 실행
//   2) event: instagram/match.requested — 개별 요청 즉시 실행
//
// 흐름:
//   1. match_status='pending' AND posted_at < now()-5min 인 row 조회
//   2. store_id별 grouping
//   3. 각 store의 IG 자격 정보로 최근 50개 게시물 조회
//   4. posted_at ±10분 윈도우 내 후보 필터
//   5. 매칭 점수 = timestamp_score*0.4 + caption_jaccard*0.6
//      score >= 0.7 → 매칭 확정, 복수 후보 → 최고 점수+가장 가까운 timestamp 선택
//   6. posted_at 기준 24h 경과 후에도 후보 없음 → match_status='unmatched'

import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/server'
import { listRecentMedia } from '@/lib/instagram/list-recent-media'
import { matchCaption } from '@/lib/insights/match-caption'

const MATCH_SCORE_THRESHOLD = 0.7
const PENDING_GRACE_MS = 5 * 60 * 1000      // 5분 — 게시 직후 인덱싱 대기
const MATCH_WINDOW_MS = 10 * 60 * 1000       // ±10분 timestamp 윈도우
const UNMATCHED_AFTER_MS = 24 * 60 * 60 * 1000 // 24h 이후 unmatched 처리

// timestamp 거리 점수: 윈도우 내 거리가 가까울수록 1에 가까운 0..1 값
function timestampScore(postMs: number, igMs: number): number {
  const diff = Math.abs(postMs - igMs)
  if (diff > MATCH_WINDOW_MS) return 0
  return 1 - diff / MATCH_WINDOW_MS
}

type PendingPost = {
  id: string
  store_id: string
  caption_used: string
  posted_at: string
}

type StoreCredentials = {
  ig_user_id: string | null
  ig_access_token: string | null
}

export const igMediaIdMatcher = inngest.createFunction(
  {
    id: 'ig-media-id-matcher',
    name: 'IG Media ID 사후 매처 (2h cron)',
    retries: 2,
    triggers: [
      { cron: '0 */2 * * *' },
      { event: 'instagram/match.requested' },
    ],
  },
  async ({ step }) => {
    // -------------------------------------------------------
    // 1) 매칭 대기 게시물 조회 — 5분 grace 경과분만
    // -------------------------------------------------------
    const pendingPosts = await step.run('fetch-pending-posts', async () => {
      const supabase = createAdminClient()
      const cutoff = new Date(Date.now() - PENDING_GRACE_MS).toISOString()

      const { data, error } = await supabase
        .from('instagram_posts')
        .select('id, store_id, caption_used, posted_at')
        .eq('match_status', 'pending')
        .lt('posted_at', cutoff)
        .limit(200)

      if (error) throw new Error(`pending 게시물 조회 실패: ${error.message}`)
      return (data ?? []) as PendingPost[]
    })

    if (pendingPosts.length === 0) {
      return { matched: 0, unmatched: 0, skipped: 0 }
    }

    // -------------------------------------------------------
    // 2) store_id별 grouping
    // -------------------------------------------------------
    const byStore = new Map<string, PendingPost[]>()
    for (const post of pendingPosts) {
      const group = byStore.get(post.store_id) ?? []
      group.push(post)
      byStore.set(post.store_id, group)
    }

    let totalMatched = 0
    let totalUnmatched = 0
    let totalSkipped = 0

    // -------------------------------------------------------
    // 3) 각 store별 처리
    // -------------------------------------------------------
    for (const [storeId, posts] of byStore) {
      const result = await step.run(`process-store-${storeId}`, async () => {
        const supabase = createAdminClient()

        // store IG 자격 정보 조회
        const { data: store, error: storeErr } = await supabase
          .from('store_profiles')
          .select('ig_user_id, ig_access_token')
          .eq('id', storeId)
          .maybeSingle()

        if (storeErr || !store) {
          // store 조회 실패 — 이 batch skip
          return { matched: 0, unmatched: 0, skipped: posts.length }
        }

        const creds = store as StoreCredentials

        if (!creds.ig_user_id || !creds.ig_access_token) {
          // IG 자격 없음 — 24h 초과분은 unmatched 처리
          let unmatched = 0
          const now = Date.now()
          for (const post of posts) {
            const age = now - new Date(post.posted_at).getTime()
            if (age > UNMATCHED_AFTER_MS) {
              await supabase
                .from('instagram_posts')
                .update({
                  match_status: 'unmatched',
                  match_attempted_at: new Date().toISOString(),
                })
                .eq('id', post.id)
              unmatched += 1
            }
          }
          return { matched: 0, unmatched, skipped: posts.length - unmatched }
        }

        // Meta Graph API — 최근 50개 조회
        const igMedia = await listRecentMedia(creds.ig_user_id, creds.ig_access_token)

        let matched = 0
        let unmatched = 0
        let skipped = 0
        const now = Date.now()

        for (const post of posts) {
          const postMs = new Date(post.posted_at).getTime()
          const age = now - postMs

          // posted_at ±10분 윈도우 내 후보 필터
          const candidates = igMedia.filter((m) => {
            const igMs = new Date(m.timestamp).getTime()
            return Math.abs(postMs - igMs) <= MATCH_WINDOW_MS
          })

          if (candidates.length === 0) {
            if (age > UNMATCHED_AFTER_MS) {
              // 24h 초과 — 후보 없음 → unmatched
              await supabase
                .from('instagram_posts')
                .update({
                  match_status: 'unmatched',
                  match_attempted_at: new Date().toISOString(),
                })
                .eq('id', post.id)
              unmatched += 1
            } else {
              // 아직 24h 미경과 — 다음 cron에서 재시도
              skipped += 1
            }
            continue
          }

          // 각 후보 점수 계산
          // 점수 = timestamp_score*0.4 + caption_jaccard*0.6
          const scored = candidates.map((m) => {
            const igMs = new Date(m.timestamp).getTime()
            const tsScore = timestampScore(postMs, igMs)
            // caption 앞 60자만 비교 (spec: caption_used 첫 60자 substring)
            const needle = post.caption_used.slice(0, 60)
            const haystack = (m.caption ?? '').slice(0, 60)
            const capScore = matchCaption(needle, haystack)
            const score = tsScore * 0.4 + capScore * 0.6
            return { media: m, score, igMs }
          })

          // score >= 0.7 후보만 추림
          const qualifying = scored.filter((s) => s.score >= MATCH_SCORE_THRESHOLD)

          if (qualifying.length === 0) {
            if (age > UNMATCHED_AFTER_MS) {
              await supabase
                .from('instagram_posts')
                .update({
                  match_status: 'unmatched',
                  match_attempted_at: new Date().toISOString(),
                })
                .eq('id', post.id)
              unmatched += 1
            } else {
              skipped += 1
            }
            continue
          }

          // tie-breaker: 최고 점수 → 동점이면 postMs에 가장 가까운 timestamp
          qualifying.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score
            return (
              Math.abs(a.igMs - postMs) - Math.abs(b.igMs - postMs)
            )
          })

          const best = qualifying[0]

          await supabase
            .from('instagram_posts')
            .update({
              ig_media_id: best.media.id,
              ig_permalink: best.media.permalink,
              match_status: 'matched',
              match_attempted_at: new Date().toISOString(),
            })
            .eq('id', post.id)

          matched += 1
        }

        return { matched, unmatched, skipped }
      })

      totalMatched += result.matched
      totalUnmatched += result.unmatched
      totalSkipped += result.skipped
    }

    return {
      matched: totalMatched,
      unmatched: totalUnmatched,
      skipped: totalSkipped,
    }
  },
)
