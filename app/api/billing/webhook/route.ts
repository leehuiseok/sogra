// app/api/billing/webhook/route.ts
// Toss Payments webhook 수신 엔드포인트 (Plan §AC-13 / RI-6 / §7 #9).
//
// 동작 순서:
//   1) 원본 body 보존 (서명 검증용) → 파싱.
//   2) signature 검증 + customerKey 매핑 검증 (validateBillingEvent).
//   3) payment_events insert. event_id UNIQUE 충돌 시 멱등 처리 — 즉시 200 반환.
//   4) ok=true 인 경우 status 에 따라:
//      - DONE  : subscriptions active 갱신 + dunning_attempts reset.
//      - FAILED: Inngest 'billing/dunning.tick' emit (재시도 큐 진입).
//   5) 응답은 항상 200 — webhook poisoning 방지 (실패 사실은 audit log 에만 남김).

import { NextResponse } from 'next/server'
import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/server'
import {
  validateBillingEvent,
  type BillingEventPayload,
} from '@/lib/security/billing-event-validator'
import { metricIncrement } from '@/lib/observability/metrics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000 // 30일 (v1 단순화 — Lane 1 첫 결제 흐름과 동일)

// 항상 200 으로 응답 — 본문 메시지는 로그 추적용
function ack(body: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ ok: true, ...body }, { status: 200 })
}

export async function POST(req: Request) {
  // -----------------------------------------------------
  // 1) raw body — 서명 검증을 위해 텍스트로 한 번만 읽는다.
  //    Next.js Node runtime 에서는 Request.text() 가 동기처럼 동작.
  // -----------------------------------------------------
  let rawBody: string
  try {
    rawBody = await req.text()
  } catch (err) {
    console.warn('[billing-webhook] raw body 읽기 실패', err)
    return ack({ note: 'body_read_failed' })
  }

  // -----------------------------------------------------
  // 2) signature 헤더 추출.
  //    TODO(R12): Toss 정기결제 webhook 의 실제 헤더 명세 확정 후 우선순위 재정렬 필요.
  //      - `X-Toss-Signature` 가 명세상 표준 후보.
  //      - 일부 webhook 유형은 `secret-key` 정적 헤더(검증 키 자체)를 사용.
  //    우리는 표준 HMAC 패턴을 가정하고 `X-Toss-Signature` 우선 사용.
  // -----------------------------------------------------
  const signatureHeader =
    req.headers.get('x-toss-signature') ??
    req.headers.get('toss-signature') ??
    req.headers.get('secret-key') ??
    null

  // -----------------------------------------------------
  // 3) payload 파싱
  // -----------------------------------------------------
  let payload: BillingEventPayload
  try {
    payload = rawBody.length > 0 ? (JSON.parse(rawBody) as BillingEventPayload) : {}
  } catch (err) {
    console.warn('[billing-webhook] JSON 파싱 실패', err)
    await metricIncrement('webhook_signature_fail_count', {
      source: 'toss_billing',
      reason: 'invalid_json',
    })
    return ack({ note: 'invalid_json' })
  }

  const admin = createAdminClient()

  // -----------------------------------------------------
  // 4) 서명 + 매핑 검증
  // -----------------------------------------------------
  const validation = await validateBillingEvent({
    raw_body: rawBody,
    signature: signatureHeader,
    parsed_payload: payload,
    admin_client: admin,
  })

  if (!validation.signature_valid) {
    await metricIncrement('webhook_signature_fail_count', {
      source: 'toss_billing',
      reason: validation.reason ?? 'unknown',
    })
  }
  if (!validation.customer_key_match) {
    await metricIncrement('customer_key_mismatch_count', {
      source: 'toss_billing',
      reason: validation.reason ?? 'unknown',
    })
  }

  // 검증 단계에서 owner_id 를 못 얻은 경우 — audit log 도 owner_id NOT NULL 제약 때문에 저장 불가.
  // (이 경우는 서명 실패 + 매핑 실패가 동시 발생한 케이스로, 사실상 외부 공격성 트래픽일 가능성 높음.)
  if (!validation.owner_id) {
    console.warn('[billing-webhook] audit log 생략 — owner_id 매핑 실패', {
      reason: validation.reason,
      signature_valid: validation.signature_valid,
      customer_key_match: validation.customer_key_match,
    })
    return ack({ note: 'no_owner_mapping' })
  }

  // -----------------------------------------------------
  // 5) payment_events insert — UNIQUE(event_id) 충돌 시 멱등 처리
  // -----------------------------------------------------
  const eventId =
    typeof payload.eventId === 'string' && payload.eventId.length > 0
      ? payload.eventId
      // eventId 가 없으면 paymentKey+status 조합으로 fallback id 합성 (멱등 키 확보)
      : `derived_${payload.paymentKey ?? 'unknown'}_${payload.status ?? 'unknown'}_${Date.now()}`
  const eventType =
    typeof payload.eventType === 'string' ? payload.eventType : 'PAYMENT_STATUS_CHANGED'
  const status =
    typeof payload.status === 'string' ? payload.status : 'UNKNOWN'
  const customerKey =
    typeof payload.customerKey === 'string' ? payload.customerKey : ''
  const paymentKey =
    typeof payload.paymentKey === 'string' ? payload.paymentKey : null
  const orderId =
    typeof payload.orderId === 'string' ? payload.orderId : null
  const amount =
    typeof payload.totalAmount === 'number' ? payload.totalAmount : null

  const processingError = validation.ok
    ? null
    : `validation_failed:${validation.reason ?? 'unknown'}`

  const { data: inserted, error: insertErr } = await admin
    .from('payment_events')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      event_id: eventId,
      event_type: eventType,
      owner_id: validation.owner_id,
      subscription_id: validation.subscription_id,
      toss_payment_key: paymentKey,
      toss_customer_key: customerKey,
      toss_order_id: orderId,
      amount_krw: amount,
      status,
      raw_payload: payload as never,
      signature_valid: validation.signature_valid,
      customer_key_match: validation.customer_key_match,
      processing_error: processingError,
    } as never)
    .select('id')
    .maybeSingle()

  if (insertErr) {
    // UNIQUE(event_id) 충돌 — 이전에 처리된 이벤트, 멱등 응답.
    // Postgres 23505 또는 supabase 측 'duplicate key' 메시지로 식별.
    const msg = insertErr.message ?? ''
    if (
      insertErr.code === '23505' ||
      msg.includes('duplicate key') ||
      msg.includes('unique')
    ) {
      return ack({ note: 'duplicate_event', event_id: eventId })
    }
    console.warn('[billing-webhook] payment_events insert 실패', insertErr)
    return ack({ note: 'insert_failed' })
  }

  // 검증 실패한 케이스는 여기서 종료 — 비즈니스 분기 없이 audit log 만 남김.
  if (!validation.ok) {
    return ack({ note: 'validation_failed', reason: validation.reason })
  }

  // -----------------------------------------------------
  // 6) 비즈니스 분기 — DONE / FAILED
  // -----------------------------------------------------
  if (eventType === 'PAYMENT_STATUS_CHANGED' && status === 'DONE') {
    const now = new Date()
    const periodEnd = new Date(now.getTime() + ONE_MONTH_MS)
    const { error: updErr } = await admin
      .from('subscriptions')
      .update({
        status: 'active',
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        next_billing_at: periodEnd.toISOString(),
        grace_period_until: null,
      })
      .eq('id', validation.subscription_id!)

    if (updErr) {
      console.warn('[billing-webhook] subscriptions DONE 갱신 실패', updErr)
      return ack({ note: 'subscription_update_failed' })
    }

    await admin
      .from('payment_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('id', inserted?.id ?? '')

    return ack({ note: 'subscription_renewed' })
  }

  if (eventType === 'PAYMENT_STATUS_CHANGED' && status === 'FAILED') {
    // dunning queue 진입 — 직접 chargeBilling 재시도는 dunning 함수가 담당.
    try {
      await inngest.send({
        name: 'billing/dunning.tick',
        data: {
          subscription_id: validation.subscription_id,
          owner_id: validation.owner_id,
          customer_key: customerKey,
          source_event_id: eventId,
        },
      })
    } catch (err) {
      console.warn('[billing-webhook] inngest dunning.tick emit 실패', err)
    }

    await admin
      .from('subscriptions')
      .update({ status: 'past_due' })
      .eq('id', validation.subscription_id!)

    await admin
      .from('payment_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('id', inserted?.id ?? '')

    return ack({ note: 'dunning_scheduled' })
  }

  // 그 외 이벤트는 audit log 만 남기고 종료.
  await admin
    .from('payment_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('id', inserted?.id ?? '')

  return ack({ note: 'event_recorded', event_type: eventType, status })
}
