// inngest/functions/asset-rehost-refresh.ts
// Step 4 CB-2 — Signed URL 만료 임박분을 6시간 마다 재발급
// cron: '0 */6 * * *' (매 6시간 정각)
//
// 대상: marketing_contents 중 storage_path 가 있고 status='ready' 이며
//        대응 media_generation_jobs.expires_at 이 now() + 24h 이내인 row.
//
// 액션:
//   - Supabase Storage createSignedUrl(path, 7*24*3600) 호출 (7일)
//   - marketing_contents.storage_url 갱신
//   - media_generation_jobs.storage_url + expires_at 갱신

import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/server'

const BUCKET_ID = 'media'
const SIGNED_URL_TTL_SEC = 7 * 24 * 60 * 60 // 7일

export const assetRehostRefresh = inngest.createFunction(
  {
    id: 'asset-rehost-refresh',
    name: 'Signed URL 자동 갱신 (6h cron)',
    retries: 1,
    triggers: [{ cron: '0 */6 * * *' }],
  },
  async ({ step }) => {
    // -----------------------------------------------------
    // 1) 만료 임박 잡 조회 — expires_at < now() + 24h
    // -----------------------------------------------------
    const expiringJobs = await step.run('find-expiring-jobs', async () => {
      const supabase = createAdminClient()
      const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('media_generation_jobs')
        .select('id, store_id, content_id, expires_at')
        .eq('status', 'succeeded')
        .not('storage_url', 'is', null)
        .not('expires_at', 'is', null)
        .lt('expires_at', cutoff)
        .limit(200)
      if (error) {
        throw new Error(`만료 잡 조회 실패: ${error.message}`)
      }
      return data ?? []
    })

    if (expiringJobs.length === 0) {
      return { refreshed: 0 }
    }

    // -----------------------------------------------------
    // 2) 각 잡의 marketing_contents 에서 storage_path 가져와 재발급
    //    - content_id 가 null 인 잡은 skip (cascade 로 떨어진 case)
    // -----------------------------------------------------
    const refreshed = await step.run('refresh-signed-urls', async () => {
      const supabase = createAdminClient()
      let okCount = 0

      for (const job of expiringJobs) {
        if (!job.content_id) continue

        const { data: content, error: contentErr } = await supabase
          .from('marketing_contents')
          .select('id, storage_path')
          .eq('id', job.content_id)
          .maybeSingle()

        if (contentErr || !content?.storage_path) continue

        const { data: signed, error: signErr } = await supabase.storage
          .from(BUCKET_ID)
          .createSignedUrl(content.storage_path, SIGNED_URL_TTL_SEC)

        if (signErr || !signed?.signedUrl) {
          console.warn(
            `[asset-rehost-refresh] sign 실패 content=${content.id} err=${signErr?.message}`,
          )
          continue
        }

        const newExpires = new Date(
          Date.now() + SIGNED_URL_TTL_SEC * 1000,
        ).toISOString()
        const nowIso = new Date().toISOString()

        await supabase
          .from('marketing_contents')
          .update({
            storage_url: signed.signedUrl,
            updated_at: nowIso,
          })
          .eq('id', content.id)

        await supabase
          .from('media_generation_jobs')
          .update({
            storage_url: signed.signedUrl,
            expires_at: newExpires,
            updated_at: nowIso,
          })
          .eq('id', job.id)

        okCount += 1
      }

      return okCount
    })

    return { refreshed }
  },
)
