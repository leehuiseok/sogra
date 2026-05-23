// app/api/billing/checkout/route.ts
// 빌링 체크아웃 시작 — subscription row upsert + Toss 인증 URL 반환.
// Plan §AC-13 / Step 6 part A.

import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { issueBillingAuthUrl } from '@/lib/toss/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  // 매장 프로필이 있어야 결제 가능 (온보딩 완료 전제)
  const { data: store } = await supabase
    .from('store_profiles')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!store) {
    return NextResponse.json(
      { error: '매장 프로필이 없습니다. 온보딩을 먼저 완료해 주세요.' },
      { status: 404 },
    )
  }

  // service_role client — subscriptions 테이블은 service만 INSERT/UPDATE
  const admin = createAdminClient()
  const customerKey = `cust_${user.id}`

  // 기존 row 조회 (있으면 status pending으로 reset, 없으면 생성)
  const { data: existing } = await admin
    .from('subscriptions')
    .select('id, status')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (existing) {
    // cancelled 상태였다면 pending 으로 되돌림 (재구독 시나리오)
    if (existing.status === 'cancelled' || existing.status === 'suspended') {
      const { error: updateError } = await admin
        .from('subscriptions')
        .update({
          status: 'pending',
          cancelled_at: null,
          cancel_reason: null,
        })
        .eq('id', existing.id)

      if (updateError) {
        return NextResponse.json(
          { error: `구독 갱신 실패: ${updateError.message}` },
          { status: 500 },
        )
      }
    }
  } else {
    const { error: insertError } = await admin.from('subscriptions').insert({
      owner_id: user.id,
      store_id: store.id,
      toss_customer_key: customerKey,
      plan: 'sogra-v1-monthly',
      amount_krw: 49000,
      status: 'pending',
    })

    if (insertError) {
      return NextResponse.json(
        { error: `구독 생성 실패: ${insertError.message}` },
        { status: 500 },
      )
    }
  }

  // success/fail URL — Toss UI가 콜백할 절대 URL
  const origin = req.headers.get('origin') ?? new URL(req.url).origin
  const successUrl = `${origin}/api/billing/billing-success`
  const failUrl = `${origin}/billing?status=fail`

  let authUrl: string
  try {
    authUrl = issueBillingAuthUrl({
      customer_key: customerKey,
      success_url: successUrl,
      fail_url: failUrl,
    })
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? '결제 URL 생성에 실패했습니다.' },
      { status: 500 },
    )
  }

  return NextResponse.json({ auth_url: authUrl })
}
