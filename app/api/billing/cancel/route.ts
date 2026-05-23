// app/api/billing/cancel/route.ts
// 구독 취소 — 본인 구독만 cancelled 처리.
// 이미 결제된 current_period_end 까지 서비스 유지 (다운그레이드는 v2).

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  reason: z.string().min(1).max(500).optional(),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  let rawBody: unknown = {}
  try {
    const text = await req.text()
    rawBody = text ? JSON.parse(text) : {}
  } catch {
    return NextResponse.json({ error: '잘못된 JSON 입력입니다.' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: '입력 검증 실패', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  // RLS는 service_role 이지만 본인 owner_id 강제 (안전망)
  const { data: sub, error: fetchError } = await admin
    .from('subscriptions')
    .select('id, status')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (fetchError) {
    return NextResponse.json(
      { error: `구독 조회 실패: ${fetchError.message}` },
      { status: 500 },
    )
  }

  if (!sub) {
    return NextResponse.json({ error: '구독 정보가 없습니다.' }, { status: 404 })
  }

  if (sub.status === 'cancelled') {
    return NextResponse.json({ error: '이미 취소된 구독입니다.' }, { status: 409 })
  }

  const { error: updateError } = await admin
    .from('subscriptions')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: parsed.data.reason ?? null,
      next_billing_at: null,
    })
    .eq('id', sub.id)
    .eq('owner_id', user.id)

  if (updateError) {
    return NextResponse.json(
      { error: `구독 취소 실패: ${updateError.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true })
}
