// lib/toss/client.ts
// Toss Payments v1 API 래퍼 — fetch only, SDK 없음.
// MOCK_TOSS=true 환경에서는 외부 호출 없이 deterministic mock 반환 (개발/테스트용).
// Plan §AC-13 / Step 6 정기결제 (월 49,000원 단일 플랜).

const TOSS_BASE_URL = 'https://api.tosspayments.com'

const MOCK_ENABLED = (): boolean => process.env.MOCK_TOSS === 'true'

const requireSecretKey = (): string => {
  const key = process.env.TOSS_SECRET_KEY
  if (!key) {
    throw new TossApiError(
      'CONFIG_MISSING',
      'TOSS_SECRET_KEY 환경 변수가 설정되어 있지 않습니다.',
      500,
    )
  }
  return key
}

const requireClientKey = (): string => {
  const key = process.env.TOSS_CLIENT_KEY
  if (!key) {
    throw new TossApiError(
      'CONFIG_MISSING',
      'TOSS_CLIENT_KEY 환경 변수가 설정되어 있지 않습니다.',
      500,
    )
  }
  return key
}

// =========================================================
// 에러 타입 — Toss API 호출 실패 시 throw
// =========================================================
export class TossApiError extends Error {
  readonly code: string
  readonly httpStatus: number

  constructor(code: string, message: string, httpStatus: number) {
    super(message)
    this.name = 'TossApiError'
    this.code = code
    this.httpStatus = httpStatus
  }
}

// =========================================================
// 공통 인증 헤더 — Basic base64(secretKey:)
// =========================================================
const buildAuthHeader = (): string => {
  const secret = requireSecretKey()
  // base64(secret + ':') — Toss 규약상 콜론까지 포함
  const encoded = Buffer.from(`${secret}:`).toString('base64')
  return `Basic ${encoded}`
}

// =========================================================
// 1) 빌링 인증 URL 생성
//    클라이언트가 이 URL로 redirect → Toss UI에서 카드 등록 → success_url 콜백
//    Toss 빌링 인증 페이지는 공식 위젯 또는 인증 URL 양식 사용.
// =========================================================
export function issueBillingAuthUrl(params: {
  customer_key: string
  success_url: string
  fail_url: string
}): string {
  const clientKey = requireClientKey()
  const qs = new URLSearchParams({
    clientKey,
    customerKey: params.customer_key,
    successUrl: params.success_url,
    failUrl: params.fail_url,
  })
  // Toss 빌링 인증 GET 페이지 — UI redirect 진입점
  return `https://api.tosspayments.com/v1/billing/authorizations/issue?${qs.toString()}`
}

// =========================================================
// 2) 빌링키 확정 — POST /v1/billing/authorizations/{authKey}
//    Toss 인증 후 받은 authKey + customerKey 로 영구 billingKey 발급.
// =========================================================
export type TossBillingKeyResult = {
  billingKey: string
  card: {
    company: string
    number: string
    cardType: string
    ownerType: string
  } | null
}

export async function confirmBillingKey(params: {
  auth_key: string
  customer_key: string
}): Promise<TossBillingKeyResult> {
  if (MOCK_ENABLED()) {
    // 결정론적 mock — auth_key 를 기반으로 안정적 billingKey 반환
    return {
      billingKey: `mock_billing_${params.customer_key}_${params.auth_key.slice(0, 8)}`,
      card: {
        company: '신한',
        number: '12341234****1234',
        cardType: '신용',
        ownerType: '개인',
      },
    }
  }

  const url = `${TOSS_BASE_URL}/v1/billing/authorizations/${encodeURIComponent(params.auth_key)}`

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: buildAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ customerKey: params.customer_key }),
    })
  } catch (err) {
    throw new TossApiError(
      'NETWORK_ERROR',
      `Toss 빌링키 확정 네트워크 오류: ${(err as Error).message}`,
      502,
    )
  }

  const payload = await safeJson(res)

  if (!res.ok) {
    throw new TossApiError(
      payload?.code ?? 'UNKNOWN',
      payload?.message ?? 'Toss 빌링키 확정에 실패했습니다.',
      res.status,
    )
  }

  return {
    billingKey: String(payload.billingKey),
    card: (payload.card as TossBillingKeyResult['card']) ?? null,
  }
}

// =========================================================
// 3) 빌링 결제 실행 — POST /v1/billing/{billingKey}
//    정기 결제 청구 (매월 1회 호출).
// =========================================================
export type TossChargeResult = {
  paymentKey: string
  orderId: string
  status: string // 'DONE' | 'CANCELED' | ...
  totalAmount: number
  approvedAt: string | null
  method: string | null
  receipt: { url: string | null } | null
  rawPayload: Record<string, unknown>
}

export async function chargeBilling(params: {
  billing_key: string
  customer_key: string
  amount: number
  order_id: string
  order_name: string
}): Promise<TossChargeResult> {
  if (MOCK_ENABLED()) {
    const now = new Date().toISOString()
    return {
      paymentKey: `mock_payment_${params.order_id}`,
      orderId: params.order_id,
      status: 'DONE',
      totalAmount: params.amount,
      approvedAt: now,
      method: '카드',
      receipt: { url: null },
      rawPayload: {
        mock: true,
        billingKey: params.billing_key,
        customerKey: params.customer_key,
        orderName: params.order_name,
      },
    }
  }

  const url = `${TOSS_BASE_URL}/v1/billing/${encodeURIComponent(params.billing_key)}`

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: buildAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerKey: params.customer_key,
        amount: params.amount,
        orderId: params.order_id,
        orderName: params.order_name,
      }),
    })
  } catch (err) {
    throw new TossApiError(
      'NETWORK_ERROR',
      `Toss 결제 네트워크 오류: ${(err as Error).message}`,
      502,
    )
  }

  const payload = await safeJson(res)

  if (!res.ok) {
    throw new TossApiError(
      payload?.code ?? 'UNKNOWN',
      payload?.message ?? 'Toss 결제에 실패했습니다.',
      res.status,
    )
  }

  return {
    paymentKey: String(payload.paymentKey),
    orderId: String(payload.orderId),
    status: String(payload.status),
    totalAmount: Number(payload.totalAmount ?? params.amount),
    approvedAt: (payload.approvedAt as string | null | undefined) ?? null,
    method: (payload.method as string | null | undefined) ?? null,
    receipt: (payload.receipt as TossChargeResult['receipt']) ?? null,
    rawPayload: payload,
  }
}

// =========================================================
// 4) 결제 취소 — POST /v1/payments/{paymentKey}/cancel
//    환불 / 결제 무효화 시 사용.
// =========================================================
export async function cancelPayment(params: {
  payment_key: string
  reason: string
}): Promise<void> {
  if (MOCK_ENABLED()) {
    return
  }

  const url = `${TOSS_BASE_URL}/v1/payments/${encodeURIComponent(params.payment_key)}/cancel`

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: buildAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cancelReason: params.reason }),
    })
  } catch (err) {
    throw new TossApiError(
      'NETWORK_ERROR',
      `Toss 결제 취소 네트워크 오류: ${(err as Error).message}`,
      502,
    )
  }

  if (!res.ok) {
    const payload = await safeJson(res)
    throw new TossApiError(
      payload?.code ?? 'UNKNOWN',
      payload?.message ?? 'Toss 결제 취소에 실패했습니다.',
      res.status,
    )
  }
}

// =========================================================
// 내부 유틸 — 응답 JSON 파싱 (실패 시 null)
// =========================================================
async function safeJson(res: Response): Promise<{
  code?: string
  message?: string
  [key: string]: unknown
}> {
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}
