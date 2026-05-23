// inngest/functions/baseline-capture-trigger.ts
// 베이스라인 인사이트 캡처 트리거 (Plan §AC-11 / RI-5)
//
// 매시간 cron 으로 baseline_insight_windows 에 row 가 없는
// 온보딩 완료 store 를 찾아 captureBaseline 을 실행한다.
//
// TODO(Step 2 연계): 온보딩 완료 시점에 inngest.send('onboarding/completed', { store_id })
//                     이벤트를 emit 하면 cron 대신 즉시 캡처할 수 있다.
//                     현재는 cron 만으로도 30일 윈도우 특성상 충분히 적시.

import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/server'
import {
  captureBaseline,
  upsertBaselineResult,
  type BaselineStoreInput,
} from '@/lib/insights/baseline-capture'

const BATCH_LIMIT = 50 // 한 번의 cron 실행에서 처리할 최대 매장 수

export const baselineCaptureTrigger = inngest.createFunction(
  {
    id: 'baseline-capture-trigger',
    name: '베이스라인 캡처 트리거 (1h cron)',
    retries: 1,
    // 1시간 간격 — 온보딩 완료 직후 늦어도 1시간 안에 캡처 시도
    triggers: [{ cron: '0 * * * *' }],
  },
  async ({ step }) => {
    // -------------------------------------------------------
    // 1) 베이스라인이 아직 없는 온보딩 완료 매장 후보 추출
    // -------------------------------------------------------
    const candidates = await step.run('find-baseline-candidates', async () => {
      const supabase = createAdminClient()

      // 이미 캡처된 store_id 집합
      const { data: existingRows, error: existingErr } = await supabase
        .from('baseline_insight_windows')
        .select('store_id')

      if (existingErr) {
        throw new Error(`기존 baseline 조회 실패: ${existingErr.message}`)
      }
      const existingIds = new Set(
        (existingRows ?? []).map((r) => r.store_id as string),
      )

      // 온보딩 완료 매장 전체 (배치 단위)
      const { data: stores, error: storesErr } = await supabase
        .from('store_profiles')
        .select(
          'id, ig_user_id, ig_account_type, ig_access_token, created_at',
        )
        .not('onboarding_completed_at', 'is', null)
        .limit(BATCH_LIMIT * 4) // 필터 후 BATCH_LIMIT 만큼 남도록 여유 확보

      if (storesErr) {
        throw new Error(`store 조회 실패: ${storesErr.message}`)
      }

      const filtered = (stores ?? [])
        .filter((s) => !existingIds.has(s.id))
        .slice(0, BATCH_LIMIT)
        .map<BaselineStoreInput>((s) => ({
          store_id: s.id,
          ig_user_id: s.ig_user_id,
          ig_account_type: s.ig_account_type,
          ig_access_token: s.ig_access_token,
          store_created_at: s.created_at,
        }))

      return filtered
    })

    if (candidates.length === 0) {
      return { processed: 0 }
    }

    // -------------------------------------------------------
    // 2) 매장별 captureBaseline + upsert
    //    (Graph API 호출은 store 단위로 직렬 — 토큰 별 rate-limit 고려)
    // -------------------------------------------------------
    const processed = await step.run('capture-and-upsert', async () => {
      const supabase = createAdminClient()
      let ok = 0

      for (const store of candidates) {
        try {
          const result = await captureBaseline({ admin: supabase, store })
          await upsertBaselineResult({
            admin: supabase,
            store_id: store.store_id,
            result,
          })
          ok += 1
        } catch (err) {
          // 한 매장 실패가 배치 전체를 막지 않도록 로그만 남긴다
          console.warn(
            `[baseline-capture-trigger] store=${store.store_id} 실패 err=${
              err instanceof Error ? err.message : String(err)
            }`,
          )
        }
      }

      return ok
    })

    return { processed, total: candidates.length }
  },
)
