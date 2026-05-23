// inngest/functions/billing-dunning.ts
// Step 6 §7 #9 — 결제 실패 3-strike dunning.
//
// 흐름:
//   0회차 (즉시 진입): chargeBilling 재시도 → 성공 시 active, 실패 시 attempts=1
//   1회차 대기 24h     → chargeBilling 재시도 → 성공 시 active, 실패 시 attempts=2
//   2회차 대기 48h(+24)→ chargeBilling 재시도 → 성공 시 active, 실패 시 attempts=3 → suspended
//   suspended 진입 시 grace_period_until = now + 7d. grace 만료 후에도 미해결이면
//   billing-grace-sweep 이 'cancelled' 로 정리.
//
// 멱등 키: source_event_id — 같은 webhook 이벤트가 두 번 진입해도 step.run id 로 중복 회피.

import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/server'
import { TossApiError, chargeBilling } from '@/lib/toss/client'

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export type BillingDunningEventData = {
  subscription_id: string | null
  owner_id: string | null
  customer_key: string
  source_event_id: string
}

// 결제 재시도 결과
type ChargeAttempt =
  | { ok: true; payment_key: string; order_id: string }
  | { ok: false; reason: string }

export const billingDunning = inngest.createFunction(
  {
    id: 'billing-dunning',
    name: '결제 실패 3-strike dunning',
    retries: 1,
    triggers: [{ event: 'billing/dunning.tick' }],
  },
  async ({ event, step }) => {
    const data = event.data as BillingDunningEventData
    const subscriptionId = data.subscription_id
    if (!subscriptionId) {
      return { skipped: true, reason: 'missing_subscription_id' }
    }

    // -----------------------------------------------------
    // 0차 시도 (즉시)
    // -----------------------------------------------------
    const a0 = await step.run('attempt-0-charge', () =>
      tryChargeAndMark(subscriptionId, 1),
    )
    if (a0.ok) {
      return { resolved_at: 0, attempts: 0 }
    }

    // -----------------------------------------------------
    // 1차 — 24h 대기 후 재시도
    // -----------------------------------------------------
    await step.sleep('wait-24h', '24h')
    const a1 = await step.run('attempt-1-charge', () =>
      tryChargeAndMark(subscriptionId, 2),
    )
    if (a1.ok) {
      return { resolved_at: 1, attempts: 1 }
    }

    // -----------------------------------------------------
    // 2차 — 추가 48h 대기 후 재시도 (총 72h 경과)
    // -----------------------------------------------------
    await step.sleep('wait-48h', '48h')
    const a2 = await step.run('attempt-2-charge', () =>
      tryChargeAndMark(subscriptionId, 3),
    )
    if (a2.ok) {
      return { resolved_at: 2, attempts: 2 }
    }

    // -----------------------------------------------------
    // 3차 실패 → suspended + grace 7일
    // -----------------------------------------------------
    await step.run('suspend-and-notify', async () => {
      const admin = createAdminClient()
      const graceUntil = new Date(Date.now() + SEVEN_DAYS_MS).toISOString()
      const { error } = await admin
        .from('subscriptions')
        .update({
          status: 'suspended',
          grace_period_until: graceUntil,
        })
        .eq('id', subscriptionId)
      if (error) {
        throw new Error(`subscriptions suspended 갱신 실패: ${error.message}`)
      }

      // TODO: notifications 테이블 도입 후 insert 로 교체.
      const message =
        '결제에 3회 실패했어요. 7일 안에 결제 수단을 변경해 주세요.'
      console.warn(
        `[billing-dunning] suspended subscription=${subscriptionId} message=${message}`,
      )
    })

    return { resolved_at: null, attempts: 3, suspended: true }
  },
)

// =========================================================
// 재시도 코어 — chargeBilling 호출 + 결과에 따른 subscriptions 갱신
// nextAttemptCountOnFail: 이번 시도가 실패할 경우 기록할 누적 시도 횟수
// =========================================================
async function tryChargeAndMark(
  subscriptionId: string,
  nextAttemptCountOnFail: number,
): Promise<ChargeAttempt> {
  const admin = createAdminClient()

  // 구독 + 빌링키 로드
  const { data: sub, error: fetchErr } = await admin
    .from('subscriptions')
    .select(
      'id, toss_billing_key, toss_customer_key, amount_krw, status, current_period_end',
    )
    .eq('id', subscriptionId)
    .maybeSingle()

  if (fetchErr || !sub) {
    return { ok: false, reason: 'subscription_not_found' }
  }

  // 이미 active 로 회복된 경우(외부에서 사장님이 수동 결제 완료 등) — 즉시 종료.
  if (sub.status === 'active') {
    return { ok: true, payment_key: 'already_active', order_id: 'noop' }
  }

  if (!sub.toss_billing_key) {
    return { ok: false, reason: 'missing_billing_key' }
  }

  const orderId = `sogra_dunning_${sub.id}_${Date.now()}`

  try {
    const result = await chargeBilling({
      billing_key: sub.toss_billing_key,
      customer_key: sub.toss_customer_key,
      amount: sub.amount_krw,
      order_id: orderId,
      order_name: '소그라 월 정기결제 (재시도)',
    })

    if (result.status !== 'DONE') {
      await markFailure(admin, sub.id, nextAttemptCountOnFail)
      return { ok: false, reason: `charge_status_${result.status}` }
    }

    // 성공 — active 로 복귀
    const now = new Date()
    const periodEnd = new Date(now.getTime() + ONE_MONTH_MS)
    await admin
      .from('subscriptions')
      .update({
        status: 'active',
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        next_billing_at: periodEnd.toISOString(),
        grace_period_until: null,
      })
      .eq('id', sub.id)

    return { ok: true, payment_key: result.paymentKey, order_id: result.orderId }
  } catch (err) {
    await markFailure(admin, sub.id, nextAttemptCountOnFail)
    const reason =
      err instanceof TossApiError ? err.code : (err as Error).message ?? 'unknown'
    return { ok: false, reason }
  }
}

// 실패 시 subscriptions.status='past_due' + 최신 payment_events.dunning_attempts 증가
async function markFailure(
  admin: ReturnType<typeof createAdminClient>,
  subscriptionId: string,
  attempts: number,
): Promise<void> {
  await admin
    .from('subscriptions')
    .update({ status: 'past_due' })
    .eq('id', subscriptionId)

  // 최신 payment_events row 의 dunning_attempts 증가 (audit 추적용)
  const { data: latest } = await admin
    .from('payment_events')
    .select('id')
    .eq('subscription_id', subscriptionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latest?.id) {
    await admin
      .from('payment_events')
      .update({ dunning_attempts: attempts })
      .eq('id', latest.id)
  }
}
