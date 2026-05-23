// lib/observability/cost-per-user.ts
// 사용자 단위 비용 계산 (Plan §2.5 cost_per_user_kr_won)
// - AI 단가(USD) 상수 + 환율 → KRW 환산
// - 스토리지 egress 단가도 별도 산정
// - env USD_KRW_RATE로 환율 오버라이드 가능

/**
 * USD→KRW 기본 환율. 운영에서는 env USD_KRW_RATE로 덮어쓴다.
 */
export const DEFAULT_USD_KRW_RATE = 1380

export function getUsdKrwRate(): number {
  const raw = process.env.USD_KRW_RATE
  if (!raw) return DEFAULT_USD_KRW_RATE
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_USD_KRW_RATE
  return parsed
}

/**
 * 모델별 단가 (USD). 입력/출력 토큰 단가 (per 1K tokens).
 * 보수적 카탈로그 값 — 실제 비용 계산은 model_used + tokens_in/out 메타로 보정.
 */
export const MODEL_PRICING_USD_PER_1K = {
  // Anthropic
  'claude-opus-4-7':    { input: 0.015, output: 0.075 },
  'claude-sonnet-4-6':  { input: 0.003, output: 0.015 },
  'claude-haiku-4-5':   { input: 0.0008, output: 0.004 },
  // OpenAI (이미지/텍스트는 별도 산정, 여기서는 텍스트 기준)
  'gpt-4o':             { input: 0.0025, output: 0.01 },
  'gpt-4o-mini':        { input: 0.00015, output: 0.0006 },
  // Runway (영상 — per second 기준이지만 토큰 0으로 처리하고 별도 fixed 비용 사용)
} as const

export type ModelKey = keyof typeof MODEL_PRICING_USD_PER_1K

/**
 * 단일 AI 호출 비용 이벤트.
 * - 텍스트: model + tokens_in/out
 * - 영상/이미지: fixed_cost_usd 만 사용 (model은 라벨 용도)
 */
export type AiCostEvent = {
  model: ModelKey | string
  tokens_in?: number
  tokens_out?: number
  fixed_cost_usd?: number
}

/**
 * 스토리지 egress 이벤트 (Supabase Storage 등).
 * KRW로 직접 받는다 — 환율 변동에 둔감하게.
 */
export type StorageEgressEvent = {
  egress_krw: number
}

export type CostInputs = {
  ai: AiCostEvent[]
  storage: StorageEgressEvent[]
}

export type CostBreakdown = {
  ai_cost_krw: number
  storage_egress_krw: number
  total_krw: number
}

/**
 * 한 AI 호출의 USD 비용 계산.
 */
function aiCostUsd(ev: AiCostEvent): number {
  let usd = 0
  if (ev.fixed_cost_usd && Number.isFinite(ev.fixed_cost_usd)) {
    usd += ev.fixed_cost_usd
  }
  const pricing = MODEL_PRICING_USD_PER_1K[ev.model as ModelKey]
  if (pricing) {
    if (ev.tokens_in && ev.tokens_in > 0) {
      usd += (ev.tokens_in / 1000) * pricing.input
    }
    if (ev.tokens_out && ev.tokens_out > 0) {
      usd += (ev.tokens_out / 1000) * pricing.output
    }
  }
  return usd
}

/**
 * 사용자 단위 비용 합산 → KRW.
 */
export function computeCostPerUserKrw(events: CostInputs): CostBreakdown {
  const rate = getUsdKrwRate()
  const ai_cost_usd = events.ai.reduce((acc, ev) => acc + aiCostUsd(ev), 0)
  const ai_cost_krw = Math.round(ai_cost_usd * rate)
  const storage_egress_krw = events.storage.reduce(
    (acc, ev) => acc + (Number.isFinite(ev.egress_krw) ? ev.egress_krw : 0),
    0,
  )
  return {
    ai_cost_krw,
    storage_egress_krw,
    total_krw: ai_cost_krw + storage_egress_krw,
  }
}
