// lib/security/billing-event-validator.ts
// Toss webhook 서명 검증 + customerKey → owner_id 매핑 검증 (Plan §RI-6 / R12).
// 두 검증 결과를 모두 caller 에게 반환하여 audit log (payment_events) 에 기록할 수 있도록 한다.
// 검증 실패가 비즈니스 분기에 영향을 줄 뿐, 응답 자체는 webhook poisoning 방지를 위해 200 으로 통일한다.

import { createHmac, timingSafeEqual } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

// =========================================================
// 입력 / 출력 타입
// =========================================================
export type BillingEventPayload = {
  // Toss webhook payload — 표준 필드만 명시, 그 외는 raw_payload 로 보존
  eventId?: string
  eventType?: string
  customerKey?: string
  paymentKey?: string
  orderId?: string
  status?: string
  totalAmount?: number
  [key: string]: unknown
}

export type ValidateBillingEventArgs = {
  raw_body: string                                // signature 비교에 사용하는 원본 문자열
  signature: string | null                        // X-Toss-Signature 헤더 등
  parsed_payload: BillingEventPayload
  admin_client: SupabaseClient<Database>
}

export type ValidateBillingEventResult = {
  ok: boolean
  owner_id: string | null
  subscription_id: string | null
  signature_valid: boolean
  customer_key_match: boolean
  reason?:
    | 'missing_secret'
    | 'missing_signature'
    | 'malformed_signature'
    | 'signature_mismatch'
    | 'missing_customer_key'
    | 'customer_key_mismatch'
    | 'db_error'
}

// =========================================================
// 서명 검증 — HMAC-SHA256(secret, raw_body) === signature
// =========================================================
// TODO(R12): Toss 정기결제(webhook v2) 정식 헤더 명세 확정 후 본 구현 점검 필요.
//   - 일부 Toss webhook 은 별도 `secretKey` 헤더로 정적 비밀값을 전달함.
//   - 우리는 표준 HMAC-SHA256 패턴(`sha256=<hex>` 또는 raw hex) 을 가정한다.
//   - 운영 진입 전 Toss 콘솔의 webhook 서명 방식을 확인하고, 필요 시
//     parseSignatureHeader 의 prefix/encoding 규칙을 조정한다.
function parseSignatureHeader(header: string): { hex: string } | null {
  const trimmed = header.trim()
  if (trimmed.length === 0) return null
  const hex = trimmed.startsWith('sha256=') ? trimmed.slice('sha256='.length) : trimmed
  if (!/^[0-9a-f]+$/i.test(hex)) return null
  return { hex: hex.toLowerCase() }
}

function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | null | undefined,
): { valid: boolean; reason?: ValidateBillingEventResult['reason'] } {
  if (!secret) {
    return { valid: false, reason: 'missing_secret' }
  }
  if (!signatureHeader) {
    return { valid: false, reason: 'missing_signature' }
  }
  const parsed = parseSignatureHeader(signatureHeader)
  if (!parsed) {
    return { valid: false, reason: 'malformed_signature' }
  }
  const expectedHex = createHmac('sha256', secret)
    .update(Buffer.from(rawBody, 'utf8'))
    .digest('hex')

  const expected = Buffer.from(expectedHex, 'hex')
  const received = Buffer.from(parsed.hex, 'hex')

  if (expected.length !== received.length) {
    return { valid: false, reason: 'signature_mismatch' }
  }
  if (!timingSafeEqual(expected, received)) {
    return { valid: false, reason: 'signature_mismatch' }
  }
  return { valid: true }
}

// =========================================================
// validateBillingEvent — 통합 검증 진입점
// =========================================================
export async function validateBillingEvent(
  args: ValidateBillingEventArgs,
): Promise<ValidateBillingEventResult> {
  const secret = process.env.TOSS_WEBHOOK_SECRET ?? null

  // 1) 서명 검증
  const sig = verifySignature(args.raw_body, args.signature, secret)

  // 2) customerKey → owner_id 매핑 검증 (서명 결과와 무관하게 항상 시도 — audit 정보 수집)
  const customerKey = args.parsed_payload.customerKey
  if (typeof customerKey !== 'string' || customerKey.length === 0) {
    return {
      ok: false,
      owner_id: null,
      subscription_id: null,
      signature_valid: sig.valid,
      customer_key_match: false,
      reason: sig.valid ? 'missing_customer_key' : sig.reason,
    }
  }

  const { data: subRow, error } = await args.admin_client
    .from('subscriptions')
    .select('id, owner_id')
    .eq('toss_customer_key', customerKey)
    .maybeSingle()

  if (error) {
    return {
      ok: false,
      owner_id: null,
      subscription_id: null,
      signature_valid: sig.valid,
      customer_key_match: false,
      reason: 'db_error',
    }
  }

  if (!subRow) {
    return {
      ok: false,
      owner_id: null,
      subscription_id: null,
      signature_valid: sig.valid,
      customer_key_match: false,
      reason: sig.valid ? 'customer_key_mismatch' : sig.reason,
    }
  }

  if (!sig.valid) {
    // 서명은 실패했지만 customerKey 자체는 매핑됨 — audit 용으로 owner_id 도 기록
    return {
      ok: false,
      owner_id: subRow.owner_id,
      subscription_id: subRow.id,
      signature_valid: false,
      customer_key_match: true,
      reason: sig.reason,
    }
  }

  return {
    ok: true,
    owner_id: subRow.owner_id,
    subscription_id: subRow.id,
    signature_valid: true,
    customer_key_match: true,
  }
}
