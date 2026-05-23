import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

export type QuotaKind = 'poster' | 'reels' | 'caption'

export interface QuotaResult {
  allowed: boolean
  remaining?: number
  used_boost?: boolean
  boost_left?: number
  reason?: string
  limit?: number
  used?: number
}

/**
 * 월간 한도 확인 + 차감 RPC 래퍼.
 * service_role 클라이언트만 허용 — 사용자 컨텍스트에서 직접 호출 금지.
 */
export async function checkAndDecrementQuota(
  storeId: string,
  kind: QuotaKind,
  client?: SupabaseClient<Database>,
): Promise<QuotaResult> {
  // 외부에서 클라이언트를 주입하지 않으면 service_role admin 클라이언트 사용
  const supabase = client ?? createAdminClient()

  const { data, error } = await supabase.rpc('check_and_decrement_quota', {
    p_store_id: storeId,
    p_kind: kind,
  })

  if (error) {
    // DB 오류 시 안전하게 차단 (한도 초과 취급)
    console.error('[checkAndDecrementQuota] RPC 오류:', error.message)
    return { allowed: false, reason: 'rpc_error' }
  }

  return data as unknown as QuotaResult
}

/**
 * 한도 환불 RPC 래퍼.
 * Inngest dead_letter 핸들러에서 호출하여 실패한 잡의 차감분 복구.
 */
export async function refundQuota(
  storeId: string,
  kind: QuotaKind,
  client?: SupabaseClient<Database>,
): Promise<void> {
  const supabase = client ?? createAdminClient()

  const { error } = await supabase.rpc('refund_quota', {
    p_store_id: storeId,
    p_kind: kind,
  })

  if (error) {
    console.error('[refundQuota] RPC 오류:', error.message)
  }
}
