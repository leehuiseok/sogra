// inngest/functions/generate-video.ts
// Step 4 CB-2 / Decision 4 — 영상 생성 비동기 잡
// 흐름:
//   1) media_generation_jobs insert (status='running', idempotency_key via PG helper)
//   2) Runway 호출 → external_job_id 수신
//   3) 15s 대기 후 최대 12회 폴링 (15s 간격) — succeeded 시 break
//   4) persistAsset 으로 자체 Storage 복제
//   5) marketing_contents.status='ready' 업데이트
//   6) media_generation_jobs.status='succeeded' 마감
//   * 실패 3회 시 onFailure → status='dead_letter', 'content/video.deadletter' emit
//
// 모든 외부 호출은 Lane 2 의 provider 어댑터 / persistAsset 를 통해서만.

import { inngest } from '../client'
import { runwayGen3VideoProvider } from '@/lib/ai/video-provider'
import {
  ContentBriefSchema,
  type ContentBrief,
} from '@/lib/prompts/content-brief'
import { createAdminClient } from '@/lib/supabase/server'

// =========================================================
// 이벤트 페이로드
// =========================================================
// content/video.generate payload — Lane 5 API 가 emit
export interface VideoGenerateEventData {
  store_id: string
  trigger_id: string
  content_id: string
  brief: ContentBrief
}

// dead_letter 이벤트 — auto-refund-deadletter 가 구독
export interface VideoDeadletterEventData {
  store_id: string
  trigger_id: string
  content_id: string
  job_id: string
  reason: string
}

// =========================================================
// 폴링 설정 — Runway 비동기 잡 (예상 30s ~ 2min)
// =========================================================
const POLL_MAX_ATTEMPTS = 12
const POLL_INTERVAL_SEC = 15
const INITIAL_WAIT_SEC = 15

// Runway Gen-3 추정 가격 (5s clip): per-second $0.05 → $0.25
const RUNWAY_VIDEO_COST_USD = 0.25

// =========================================================
// 메인 함수
// =========================================================
export const generateVideo = inngest.createFunction(
  {
    id: 'generate-video',
    name: '영상 생성 잡 (Runway Gen-3)',
    retries: 3,
    triggers: [{ event: 'content/video.generate' }],
    // 3회 실패 시 호출: dead_letter 마킹 + 환불 이벤트 emit
    onFailure: async ({ event, error }) => {
      const supabase = createAdminClient()
      // event.data.event 는 원본 이벤트
      const original = event.data.event as {
        data: VideoGenerateEventData
      }
      const payload = original.data
      const reason = error?.message ?? 'unknown'

      // idempotency_key 로 job row 찾기 (현재 월 KST 기준)
      const { data: keyData } = await supabase.rpc('generate_idempotency_key', {
        p_store_id: payload.store_id,
        p_trigger_id: payload.trigger_id,
        p_kind: payload.brief.target_format,
        p_period: currentMonthKstOnClient(),
      })
      const idemKey = typeof keyData === 'string' ? keyData : null

      // dead_letter 마킹 (있는 경우)
      if (idemKey) {
        await supabase
          .from('media_generation_jobs')
          .update({
            status: 'dead_letter',
            last_error: reason,
            updated_at: new Date().toISOString(),
          })
          .eq('idempotency_key', idemKey)
      }

      // 환불 + 알림 이벤트 emit
      await inngest.send({
        name: 'content/video.deadletter',
        data: {
          store_id: payload.store_id,
          trigger_id: payload.trigger_id,
          content_id: payload.content_id,
          job_id: idemKey ?? 'unknown',
          reason,
        } satisfies VideoDeadletterEventData,
      })
    },
  },
  async ({ event, step }) => {
    const raw = event.data as VideoGenerateEventData
    const brief = ContentBriefSchema.parse(raw.brief)
    const { store_id, trigger_id, content_id } = raw

    // -----------------------------------------------------
    // 1) media_generation_jobs insert — 멱등 key 로 중복 차단
    // -----------------------------------------------------
    const jobId = await step.run('insert-job', async () => {
      const supabase = createAdminClient()
      // PG helper 로 idempotency key 산출 (현재 월 KST)
      const { data: monthData, error: monthErr } = await supabase.rpc(
        'current_month_kst',
      )
      if (monthErr) {
        throw new Error(`current_month_kst RPC 실패: ${monthErr.message}`)
      }
      const period = (monthData as unknown as string) ?? currentMonthKstOnClient()

      const { data: keyData, error: keyErr } = await supabase.rpc(
        'generate_idempotency_key',
        {
          p_store_id: store_id,
          p_trigger_id: trigger_id,
          p_kind: brief.target_format,
          p_period: period,
        },
      )
      if (keyErr || typeof keyData !== 'string') {
        throw new Error(
          `generate_idempotency_key 실패: ${keyErr?.message ?? 'no key'}`,
        )
      }
      const idemKey = keyData

      // upsert 패턴: 동일 key 가 있으면 retry_count 증가, 없으면 insert
      const { data: existing } = await supabase
        .from('media_generation_jobs')
        .select('id, status, retry_count')
        .eq('idempotency_key', idemKey)
        .maybeSingle()

      if (existing) {
        // 이미 succeeded 면 단락 — 잡 자체를 멱등 종료
        if (existing.status === 'succeeded') {
          return { id: existing.id, idemKey, alreadyDone: true }
        }
        await supabase
          .from('media_generation_jobs')
          .update({
            status: 'running',
            retry_count: (existing.retry_count ?? 0) + 1,
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
        return { id: existing.id, idemKey, alreadyDone: false }
      }

      const { data: inserted, error: insErr } = await supabase
        .from('media_generation_jobs')
        .insert({
          store_id,
          trigger_id,
          content_id,
          content_kind: brief.target_format,
          idempotency_key: idemKey,
          status: 'running',
        })
        .select('id')
        .single()
      if (insErr || !inserted) {
        throw new Error(`media_generation_jobs insert 실패: ${insErr?.message}`)
      }
      return { id: inserted.id, idemKey, alreadyDone: false }
    })

    if (jobId.alreadyDone) {
      // 멱등 단락 — 같은 키로 이미 성공한 잡이 있음
      return { skipped: true, job_id: jobId.id }
    }

    // marketing_contents.status='generating' 으로 진입
    await step.run('mark-content-generating', async () => {
      const supabase = createAdminClient()
      await supabase
        .from('marketing_contents')
        .update({
          status: 'generating',
          updated_at: new Date().toISOString(),
        })
        .eq('id', content_id)
    })

    // -----------------------------------------------------
    // 2) Runway 호출 — external_job_id 수신
    // -----------------------------------------------------
    const started = await step.run('call-runway', async () => {
      const result = await runwayGen3VideoProvider.startGeneration(brief)
      return result
    })

    // -----------------------------------------------------
    // 3) 초기 대기 + 폴링 (최대 12회 × 15s = 3분)
    // -----------------------------------------------------
    await step.sleep('initial-wait', `${INITIAL_WAIT_SEC}s`)

    let externalUrl: string | null = null
    for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt += 1) {
      const polled = await step.run(`poll-runway-${attempt}`, async () => {
        return runwayGen3VideoProvider.pollStatus(started.external_job_id)
      })

      if (polled.status === 'succeeded' && polled.external_url) {
        externalUrl = polled.external_url
        break
      }
      if (polled.status === 'failed') {
        throw new Error(`Runway 잡 실패: ${polled.error ?? 'unknown'}`)
      }

      // processing → 다음 폴까지 대기 (마지막 attempt 면 sleep 생략)
      if (attempt < POLL_MAX_ATTEMPTS) {
        await step.sleep(`poll-wait-${attempt}`, `${POLL_INTERVAL_SEC}s`)
      }
    }

    if (!externalUrl) {
      throw new Error('Runway 폴링 시간 초과 (3분)')
    }

    // -----------------------------------------------------
    // 4) persistAsset — 자체 Storage 로 영상 복제
    // -----------------------------------------------------
    const persisted = await step.run('persist-asset', async () => {
      return runwayGen3VideoProvider.persistToStorage({
        external_url: externalUrl!,
        store_id,
        content_id,
        kind: 'video',
      })
    })

    // -----------------------------------------------------
    // 5) marketing_contents → ready 마킹
    // -----------------------------------------------------
    await step.run('update-content', async () => {
      const supabase = createAdminClient()
      const { error } = await supabase
        .from('marketing_contents')
        .update({
          status: 'ready',
          storage_url: persisted.storage_url,
          storage_path: persisted.storage_path,
          external_url: externalUrl,
          model_used: started.modelUsed,
          cost_usd: RUNWAY_VIDEO_COST_USD,
          updated_at: new Date().toISOString(),
        })
        .eq('id', content_id)
      if (error) {
        throw new Error(`marketing_contents update 실패: ${error.message}`)
      }
    })

    // -----------------------------------------------------
    // 6) media_generation_jobs → succeeded 마감
    // -----------------------------------------------------
    await step.run('finalize-job', async () => {
      const supabase = createAdminClient()
      // signed URL TTL 7일 → expires_at 추적
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      const { error } = await supabase
        .from('media_generation_jobs')
        .update({
          status: 'succeeded',
          external_url: externalUrl,
          storage_url: persisted.storage_url,
          expires_at: expires,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId.id)
      if (error) {
        throw new Error(`media_generation_jobs finalize 실패: ${error.message}`)
      }
    })

    return {
      job_id: jobId.id,
      content_id,
      storage_url: persisted.storage_url,
    }
  },
)

// =========================================================
// 클라이언트측 fallback: current_month_kst (Asia/Seoul YYYY-MM)
// 가능하면 RPC 결과를 사용하지만, onFailure 핸들러에서 단독 호출이 어려울 때 사용.
// =========================================================
function currentMonthKstOnClient(): string {
  const now = new Date()
  // KST = UTC + 9h
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const y = kst.getUTCFullYear()
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}
