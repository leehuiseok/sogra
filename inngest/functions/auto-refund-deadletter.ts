// inngest/functions/auto-refund-deadletter.ts
// Step 4 Decision 4 — dead_letter 진입 시 자동 환불 + 콘텐츠 실패 처리 + 사장님 알림
// 트리거: 'content/video.deadletter' (generate-video onFailure 에서 emit)

import { inngest } from '../client'
import { refundQuota } from '@/lib/quota/check-and-decrement'
import { createAdminClient } from '@/lib/supabase/server'
import type { VideoDeadletterEventData } from './generate-video'

export const autoRefundDeadletter = inngest.createFunction(
  {
    id: 'auto-refund-deadletter',
    name: '자동 환불 + 실패 알림 (dead_letter)',
    retries: 2,
    triggers: [{ event: 'content/video.deadletter' }],
  },
  async ({ event, step }) => {
    const data = event.data as VideoDeadletterEventData
    const { store_id, content_id, reason } = data

    // -----------------------------------------------------
    // 1) 한도 환불 — refundQuota (reels 만 차감되므로 reels 환불)
    //    poster/caption 도 동일 흐름이지만 v1 영상 잡은 reels 전용
    // -----------------------------------------------------
    await step.run('refund', async () => {
      await refundQuota(store_id, 'reels')
    })

    // -----------------------------------------------------
    // 2) marketing_contents.status='failed' 마킹
    // -----------------------------------------------------
    await step.run('mark-content-failed', async () => {
      const supabase = createAdminClient()
      const { error } = await supabase
        .from('marketing_contents')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', content_id)
      if (error) {
        throw new Error(`marketing_contents failed 마킹 실패: ${error.message}`)
      }
    })

    // -----------------------------------------------------
    // 3) 사장님 in-app 알림 — v1 에서는 console.log,
    //    TODO: notifications 테이블 도입 후 insert 로 전환
    // -----------------------------------------------------
    await step.run('notify-store-owner', async () => {
      const message = '릴스 생성에 실패했어요. 한도를 복구해 드렸습니다.'
      // TODO: notifications 테이블 도입 후 아래로 교체
      //   await supabase.from('notifications').insert({
      //     store_id, kind: 'content_failed', body: message, severity: 'warning'
      //   })
      console.warn(
        `[auto-refund-deadletter] store=${store_id} content=${content_id} reason=${reason} message=${message}`,
      )
    })

    return { refunded: true, store_id, content_id }
  },
)
