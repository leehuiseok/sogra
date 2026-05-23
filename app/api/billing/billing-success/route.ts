// app/api/billing/billing-success/route.ts
// Toss 빌링 인증 콜백 — authKey + customerKey 받아서 billingKey 발급 후 첫 결제까지 수행.
// 흐름: confirmBillingKey → subscriptions 업데이트 → chargeBilling → next_billing_at 갱신.
// payment_events insert는 Lane 2가 담당하므로 여기서는 subscriptions 컬럼만 갱신.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import {
  TossApiError,
  chargeBilling,
  confirmBillingKey,
} from '@/lib/toss/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000 // 30일 (v1 단순화)

export async function GET(req: Request) {
  const url = new URL(req.url)
  const authKey = url.searchParams.get('authKey')
  const customerKey = url.searchParams.get('customerKey')
  const origin = url.origin

  if (!authKey || !customerKey) {
    return NextResponse.redirect(
      `${origin}/billing?status=fail&reason=missing_params`,
      303,
    )
  }

  const admin = createAdminClient()

  // 사전 검증: customerKey 로 subscriptions row 조회
  const { data: sub, error: fetchError } = await admin
    .from('subscriptions')
    .select('id, owner_id, store_id, amount_krw, status')
    .eq('toss_customer_key', customerKey)
    .maybeSingle()

  if (fetchError || !sub) {
    return NextResponse.redirect(
      `${origin}/billing?status=fail&reason=subscription_not_found`,
      303,
    )
  }

  // 1) 빌링키 확정
  let billingKey: string
  try {
    const result = await confirmBillingKey({
      auth_key: authKey,
      customer_key: customerKey,
    })
    billingKey = result.billingKey
  } catch (err) {
    const reason =
      err instanceof TossApiError ? err.code : 'billing_key_confirm_failed'
    await admin
      .from('subscriptions')
      .update({ status: 'pending' })
      .eq('id', sub.id)
    return NextResponse.redirect(
      `${origin}/billing?status=fail&reason=${encodeURIComponent(reason)}`,
      303,
    )
  }

  // 2) 첫 결제 시도 — orderId 는 매장+timestamp 기반 고유값
  const orderId = `sogra_${sub.id}_${Date.now()}`
  const orderName = '소그라 월 정기결제 (v1)'

  try {
    await chargeBilling({
      billing_key: billingKey,
      customer_key: customerKey,
      amount: sub.amount_krw,
      order_id: orderId,
      order_name: orderName,
    })
  } catch (err) {
    const reason =
      err instanceof TossApiError ? err.code : 'first_charge_failed'
    // billingKey 는 발급되었으나 첫 결제 실패 → past_due 로 표시
    await admin
      .from('subscriptions')
      .update({
        toss_billing_key: billingKey,
        status: 'past_due',
      })
      .eq('id', sub.id)
    return NextResponse.redirect(
      `${origin}/billing?status=fail&reason=${encodeURIComponent(reason)}`,
      303,
    )
  }

  // 3) 성공 — 구독 활성화 + next_billing_at = +1 month
  const now = new Date()
  const periodEnd = new Date(now.getTime() + ONE_MONTH_MS)

  const { error: updateError } = await admin
    .from('subscriptions')
    .update({
      toss_billing_key: billingKey,
      status: 'active',
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      next_billing_at: periodEnd.toISOString(),
      grace_period_until: null,
      cancelled_at: null,
      cancel_reason: null,
    })
    .eq('id', sub.id)

  if (updateError) {
    return NextResponse.redirect(
      `${origin}/billing?status=fail&reason=db_update_failed`,
      303,
    )
  }

  return NextResponse.redirect(`${origin}/billing?status=success`, 303)
}
