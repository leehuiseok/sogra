// RI-4 PoC 완료 전 임시. Step 0 NLU Calibration (data/nlu-calibration/golden-set-200.jsonl) 실행 후 ECE/precision 기반 재조정 필요.
export const DEFAULT_NLU_CONFIDENCE_THRESHOLD = 0.6

export function getNluConfidenceThreshold(): number {
  const fromEnv = process.env.NLU_CONFIDENCE_THRESHOLD
  const parsed = fromEnv ? Number(fromEnv) : NaN
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? parsed
    : DEFAULT_NLU_CONFIDENCE_THRESHOLD
}

export function shouldRequestConfirmation(confidence: number): boolean {
  return confidence < getNluConfidenceThreshold()
}
