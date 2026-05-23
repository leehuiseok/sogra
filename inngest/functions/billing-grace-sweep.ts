// inngest/functions/billing-grace-sweep.ts
// Step 6 §7 #9 — suspended 상태 + grace_period_until 만료된 구독을 cancelled 로 정리.
// cron 주기: 6시간마다 (`0 */6 * * *`). 사장님이 7일 내 결제 수단을 변경하지 않으면 자동 해지.

import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/server'

export const billingGraceSweep = inngest.createFunction(
  {
    id: 'billing-grace-sweep',
    name: '결제 dunning grace 만료 sweep',
    retries: 1,
    triggers: [{ cron: '0 */6 * * *' }],
  },
  async ({ step }) => {
    const result = await step.run('cancel-expired-suspensions', async () => {
      const admin = createAdminClient()
      const nowIso = new Date().toISOString()

      // suspended + grace_period_until 경과인 구독 조회
      const { data: rows, error } = await admin
        .from('subscriptions')
        .select('id, owner_id')
        .eq('status', 'suspended')
        .not('grace_period_until', 'is', null)
        .lte('grace_period_until', nowIso)

      if (error) {
        throw new Error(`grace 만료 구독 조회 실패: ${error.message}`)
      }

      const targets = rows ?? []
      if (targets.length === 0) {
        return { cancelled: 0 }
      }

      let cancelled = 0
      for (const row of targets) {
        const { error: updErr } = await admin
          .from('subscriptions')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancel_reason: 'dunning_grace_expired',
          })
          .eq('id', row.id)
        if (updErr) {
          console.warn(
            `[billing-grace-sweep] subscription=${row.id} cancel 실패: ${updErr.message}`,
          )
          continue
        }
        cancelled += 1

        // TODO: notifications 테이블 도입 후 insert 로 교체.
        console.warn(
          `[billing-grace-sweep] subscription=${row.id} owner=${row.owner_id} 결제 미해결로 자동 해지되었습니다.`,
        )
      }

      return { cancelled }
    })

    return result
  },
)
