// inngest/functions/insights-poller.ts
// Step 5 AC-11 — Meta Insights 폴러.
//
// 동작:
//   1) 매 1시간 cron 으로 기동 ('0 * * * *').
//   2) instagram_posts 중 ig_media_id NOT NULL & posted_at + {24h | 7d} 도래 &
//      해당 window_label 의 instagram_post_insights row 가 아직 없는 것을 골라 폴링.
//   3) 성공: instagram_post_insights upsert + insights_poll_attempts.succeeded=true.
//   4) 실패: insights_poll_attempts upsert with attempt_count+1, exponential backoff.
//      (1h → 2h → 4h → 8h → 12h max, 5회 실패 시 permanent fail)
//   5) 1 회 실행에 최대 50건 처리, 5분 안에 완료.
//   6) per-store 토큰 분산: 단일 store 가 batch 를 독점하지 않도록 store_id 별 1건 우선.
//
// 윈도우 차이 메모:
//   Meta Graph Insights API 는 likes/reach/impressions/saves/comments 메트릭에 대해
//   "lifetime" period (누적값) 만 반환한다. 따라서 우리가 "24h 윈도우" 와 "7d 윈도우" 를
//   구분하는 것은 Meta period 가 아니라 captured_at timestamp 다 — 같은 누적값을
//   posted_at + 24h 시점과 posted_at + 7d 시점에 각각 스냅샷으로 저장한다.

import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/server'
import { pollMetaInsights, InsightsPollError } from '@/lib/insights/poll-meta'

// =========================================================
// 상수
// =========================================================
const BATCH_LIMIT = 50
const MAX_ATTEMPTS = 5

// 지수 백오프: index = 다음 시도 횟수 - 1
// 1h → 2h → 4h → 8h → 12h(상한)
const BACKOFF_HOURS = [1, 2, 4, 8, 12]

const H24_MS = 24 * 60 * 60 * 1000
const D7_MS = 7 * 24 * 60 * 60 * 1000

type WindowLabel = 'h24' | 'd7'

type PostRow = {
  id: string
  store_id: string
  ig_media_id: string
  posted_at: string
}

type StoreToken = {
  ig_access_token: string | null
}

// 다음 재시도 시각 계산. nextAttemptCount 는 "이번 실패 후" 누적 횟수.
function computeNextRetryAt(nextAttemptCount: number): string {
  const idx = Math.min(nextAttemptCount - 1, BACKOFF_HOURS.length - 1)
  const hours = BACKOFF_HOURS[Math.max(idx, 0)]
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

// 어떤 윈도우가 도래했는지 판정. posted_at 이후 24h/7d 가 지났고 아직 캡쳐가 없으면 대상.
function isWindowDue(postedAt: string, label: WindowLabel, now: number): boolean {
  const posted = new Date(postedAt).getTime()
  if (Number.isNaN(posted)) return false
  const elapsed = now - posted
  return label === 'h24' ? elapsed >= H24_MS : elapsed >= D7_MS
}

// store_id 별로 1건씩 라운드로빈하도록 정렬 — rate limit 분산.
function distributeByStore<T extends { store_id: string }>(rows: T[]): T[] {
  const buckets = new Map<string, T[]>()
  for (const r of rows) {
    const arr = buckets.get(r.store_id) ?? []
    arr.push(r)
    buckets.set(r.store_id, arr)
  }
  const result: T[] = []
  let added = true
  while (added) {
    added = false
    for (const arr of buckets.values()) {
      const next = arr.shift()
      if (next) {
        result.push(next)
        added = true
      }
    }
  }
  return result
}

// =========================================================
// 메인 함수
// =========================================================
export const insightsPoller = inngest.createFunction(
  {
    id: 'insights-poller',
    name: 'Instagram Insights 폴러 (1h cron, 24h + 7d 윈도우)',
    retries: 1,
    triggers: [{ cron: '0 * * * *' }],
  },
  async ({ step }) => {
    // -----------------------------------------------------
    // 1) 폴링 후보 수집 — h24, d7 각각 별도 추출 후 합치고 store 라운드로빈.
    // -----------------------------------------------------
    const candidates = await step.run('collect-candidates', async () => {
      const supabase = createAdminClient()
      const now = Date.now()

      // ig_media_id 가 있고 posted_at 기준 cutoff 를 지난 posts.
      // 일부러 넉넉히 (BATCH_LIMIT * 4) 가져온 뒤 어플리케이션 측에서 필터·분배.
      const cutoffH24 = new Date(now - H24_MS).toISOString()
      const cutoffD7 = new Date(now - D7_MS).toISOString()

      // h24 후보 — posted_at <= now - 24h
      const { data: h24Rows, error: h24Err } = await supabase
        .from('instagram_posts')
        .select('id, store_id, ig_media_id, posted_at')
        .not('ig_media_id', 'is', null)
        .lte('posted_at', cutoffH24)
        .order('posted_at', { ascending: true })
        .limit(BATCH_LIMIT * 4)
      if (h24Err) {
        throw new Error(`h24 후보 조회 실패: ${h24Err.message}`)
      }

      // d7 후보 — posted_at <= now - 7d
      const { data: d7Rows, error: d7Err } = await supabase
        .from('instagram_posts')
        .select('id, store_id, ig_media_id, posted_at')
        .not('ig_media_id', 'is', null)
        .lte('posted_at', cutoffD7)
        .order('posted_at', { ascending: true })
        .limit(BATCH_LIMIT * 4)
      if (d7Err) {
        throw new Error(`d7 후보 조회 실패: ${d7Err.message}`)
      }

      type Pair = { post: PostRow; window: WindowLabel }
      const pairs: Pair[] = []

      for (const row of (h24Rows ?? []) as PostRow[]) {
        if (row.ig_media_id && isWindowDue(row.posted_at, 'h24', now)) {
          pairs.push({ post: row, window: 'h24' })
        }
      }
      for (const row of (d7Rows ?? []) as PostRow[]) {
        if (row.ig_media_id && isWindowDue(row.posted_at, 'd7', now)) {
          pairs.push({ post: row, window: 'd7' })
        }
      }

      if (pairs.length === 0) {
        return [] as Pair[]
      }

      // 이미 캡쳐된 (post_id, window) 제외.
      const postIds = Array.from(new Set(pairs.map((p) => p.post.id)))
      const { data: capturedRows, error: capErr } = await supabase
        .from('instagram_post_insights')
        .select('post_id, window_label')
        .in('post_id', postIds)
      if (capErr) {
        throw new Error(`기존 insights 조회 실패: ${capErr.message}`)
      }
      const capturedSet = new Set(
        (capturedRows ?? []).map((r) => `${r.post_id}:${r.window_label}`),
      )

      // permanent fail (succeeded=false AND attempt_count >= MAX) 제외 +
      // 백오프 next_retry_at 미도래분 제외.
      const { data: attemptRows, error: attErr } = await supabase
        .from('insights_poll_attempts')
        .select('post_id, window_label, attempt_count, next_retry_at, succeeded')
        .in('post_id', postIds)
      if (attErr) {
        throw new Error(`poll attempts 조회 실패: ${attErr.message}`)
      }
      const attemptMap = new Map<
        string,
        {
          attempt_count: number
          next_retry_at: string | null
          succeeded: boolean
        }
      >()
      for (const a of attemptRows ?? []) {
        attemptMap.set(`${a.post_id}:${a.window_label}`, {
          attempt_count: a.attempt_count,
          next_retry_at: a.next_retry_at,
          succeeded: a.succeeded,
        })
      }

      const nowMs = now
      const eligible: Pair[] = []
      for (const p of pairs) {
        const key = `${p.post.id}:${p.window}`
        if (capturedSet.has(key)) continue
        const att = attemptMap.get(key)
        if (att) {
          if (att.succeeded) continue
          if (att.attempt_count >= MAX_ATTEMPTS) continue
          if (att.next_retry_at && new Date(att.next_retry_at).getTime() > nowMs) {
            continue
          }
        }
        eligible.push(p)
      }

      // store 별 라운드로빈 분산 후 BATCH_LIMIT 까지 자른다.
      const distributed = distributeByStore(
        eligible.map((p) => ({ ...p, store_id: p.post.store_id })),
      ).slice(0, BATCH_LIMIT)

      return distributed.map((p) => ({ post: p.post, window: p.window }))
    })

    if (candidates.length === 0) {
      return { polled: 0, succeeded: 0, failed: 0 }
    }

    // -----------------------------------------------------
    // 2) store_id → access_token 매핑 prefetch.
    // -----------------------------------------------------
    const tokens = await step.run('load-tokens', async () => {
      const supabase = createAdminClient()
      const storeIds = Array.from(new Set(candidates.map((c) => c.post.store_id)))
      const { data, error } = await supabase
        .from('store_profiles')
        .select('id, ig_access_token')
        .in('id', storeIds)
      if (error) {
        throw new Error(`store_profiles 조회 실패: ${error.message}`)
      }
      const map: Record<string, StoreToken> = {}
      for (const row of data ?? []) {
        map[row.id] = { ig_access_token: row.ig_access_token }
      }
      return map
    })

    // -----------------------------------------------------
    // 3) 각 (post, window) 폴링 — 한 단계 안에서 순차 처리.
    //    Inngest 의 5분 step 한도와 일치하도록 BATCH_LIMIT=50, 호출 평균 <6s 가정.
    // -----------------------------------------------------
    const result = await step.run('poll-and-persist', async () => {
      const supabase = createAdminClient()
      const startedAt = Date.now()
      const SOFT_DEADLINE_MS = 5 * 60 * 1000 // 5분
      let succeeded = 0
      let failed = 0
      let processed = 0

      for (const { post, window } of candidates) {
        if (Date.now() - startedAt > SOFT_DEADLINE_MS) {
          // soft deadline — 남은 작업은 다음 cron 으로 미룬다.
          break
        }
        processed += 1

        const token = tokens[post.store_id]?.ig_access_token
        if (!token) {
          // 토큰 없음 — permanent fail 로 마킹.
          await upsertAttempt(supabase, post.id, window, {
            errMsg: 'missing ig_access_token',
            permanent: true,
          })
          failed += 1
          continue
        }

        try {
          const metrics = await pollMetaInsights({
            ig_media_id: post.ig_media_id,
            access_token: token,
          })

          // insights upsert
          const { error: upErr } = await supabase
            .from('instagram_post_insights')
            .upsert(
              {
                store_id: post.store_id,
                post_id: post.id,
                window_label: window,
                likes: metrics.likes,
                reach: metrics.reach,
                impressions: metrics.impressions,
                saves: metrics.saves,
                comments: metrics.comments,
                raw_payload: metrics.raw as never,
                captured_at: new Date().toISOString(),
              },
              { onConflict: 'post_id,window_label' },
            )
          if (upErr) {
            throw new Error(`insights upsert 실패: ${upErr.message}`)
          }

          await upsertAttempt(supabase, post.id, window, {
            errMsg: null,
            permanent: false,
            success: true,
          })
          succeeded += 1
        } catch (err) {
          const e = err as InsightsPollError | Error
          const isPermanent =
            e instanceof InsightsPollError && e.code === 'permanent'
          await upsertAttempt(supabase, post.id, window, {
            errMsg: e.message,
            permanent: isPermanent,
          })
          failed += 1
        }
      }

      return { polled: processed, succeeded, failed }
    })

    return result
  },
)

// =========================================================
// helper: insights_poll_attempts upsert
// =========================================================
type AttemptUpdate = {
  errMsg: string | null
  permanent: boolean
  success?: boolean
}

async function upsertAttempt(
  supabase: ReturnType<typeof createAdminClient>,
  postId: string,
  window: WindowLabel,
  upd: AttemptUpdate,
): Promise<void> {
  // 현재 attempt_count 조회.
  const { data: existing } = await supabase
    .from('insights_poll_attempts')
    .select('id, attempt_count')
    .eq('post_id', postId)
    .eq('window_label', window)
    .maybeSingle()

  const prevCount = existing?.attempt_count ?? 0
  const nextCount = upd.success ? prevCount : prevCount + 1

  // next_retry_at 결정.
  //   success: null (재시도 불필요)
  //   permanent OR attempt_count >= MAX: null (영구 실패)
  //   else: 지수 백오프 시각
  let nextRetryAt: string | null = null
  if (!upd.success) {
    if (!upd.permanent && nextCount < MAX_ATTEMPTS) {
      nextRetryAt = computeNextRetryAt(nextCount)
    }
  }

  const nowIso = new Date().toISOString()
  const payload = {
    post_id: postId,
    window_label: window,
    attempt_count: nextCount,
    last_error: upd.errMsg,
    next_retry_at: nextRetryAt,
    succeeded: upd.success === true,
    updated_at: nowIso,
  }

  await supabase
    .from('insights_poll_attempts')
    .upsert(payload, { onConflict: 'post_id,window_label' })
}
