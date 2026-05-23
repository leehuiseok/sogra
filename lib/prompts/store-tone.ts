// server-only: 매장 톤 fingerprint 빌더 (Layer 1)
// 입력: store_profiles.tone_keywords(3) + menus(3) + store_name
// 출력: 결정적(deterministic) tone fingerprint JSON
// Plan §5 Step 4 RI-2 — Layer 2 renderer는 ContentBrief만 받으므로
// 본 모듈은 store_profiles row → 정규화된 tone fingerprint 변환을 담당한다.

import { z } from 'zod'

// =========================================================
// Schema
// =========================================================

// 말투 키워드 → 음성/어조 매핑을 위해 사용하는 정규화된 tone fingerprint
export const ToneFingerprintSchema = z.object({
  // voice: 1인칭/대화 주체 ("사장님", "우리 가게" 등)
  voice: z.string(),
  // register: 격식 수준 ('casual' | 'friendly' | 'polite' | 'formal')
  register: z.enum(['casual', 'friendly', 'polite', 'formal']),
  // signature_phrases: 톤 키워드를 한국어 SNS 캡션 시그니처 구문으로 변환
  signature_phrases: z.array(z.string()).length(3),
  // menu_highlights: 대표 메뉴 3개를 "이름 — 설명" 한 줄 포맷으로 정규화
  menu_highlights: z.array(z.string()).length(3),
})

export type ToneFingerprint = z.infer<typeof ToneFingerprintSchema>

// store_profiles row에서 추출되는 입력 스키마 (느슨한 검증)
export const StoreToneInputSchema = z.object({
  store_name: z.string().min(1).max(100),
  tone_keywords: z.array(z.string()).length(3),
  menus: z
    .array(
      z.object({
        name: z.string().min(1),
        desc: z.string().optional(),
        price: z.number().optional(),
      })
    )
    .length(3),
})

export type StoreToneInput = z.infer<typeof StoreToneInputSchema>

// =========================================================
// 결정적 매핑 테이블
// =========================================================

// 한국어 톤 키워드 → register 매핑 (소문자 정규화 후 lookup)
// 매핑되지 않는 키워드는 기본값 'friendly'로 fallback (deterministic).
const REGISTER_MAP: Record<string, ToneFingerprint['register']> = {
  // casual
  '편한': 'casual',
  '편안': 'casual',
  '캐주얼': 'casual',
  '자유로운': 'casual',
  '재미있는': 'casual',
  '유쾌한': 'casual',
  '발랄한': 'casual',
  // friendly (default 군)
  '친근한': 'friendly',
  '따뜻한': 'friendly',
  '다정한': 'friendly',
  '정겨운': 'friendly',
  '소박한': 'friendly',
  // polite
  '정중한': 'polite',
  '정직한': 'polite',
  '깔끔한': 'polite',
  '단정한': 'polite',
  '믿음직한': 'polite',
  // formal
  '격식있는': 'formal',
  '고급스러운': 'formal',
  '품격있는': 'formal',
  '전통적인': 'formal',
}

// register별 시그니처 구문 템플릿 (deterministic 변환)
const SIGNATURE_TEMPLATES: Record<ToneFingerprint['register'], (kw: string) => string> = {
  casual: (kw) => `${kw} 분위기로 가볼까요`,
  friendly: (kw) => `${kw} 마음 담아 전해요`,
  polite: (kw) => `${kw} 정성으로 준비했습니다`,
  formal: (kw) => `${kw} 마음으로 모시겠습니다`,
}

// =========================================================
// Pure 변환 함수 (deterministic)
// =========================================================

/**
 * 매장 입력 → tone fingerprint 변환.
 * 같은 입력에 대해 항상 같은 출력을 보장한다 (외부 API 호출 없음, 시간 의존성 없음).
 */
export function buildStoreTone(input: StoreToneInput): ToneFingerprint {
  // 입력 검증 (zod strict)
  const parsed = StoreToneInputSchema.parse(input)

  // voice: 1인칭은 매장명 기반으로 결정적으로 구성
  const voice = `${parsed.store_name} 사장님`

  // register: 첫 키워드 우선, 매핑 누락 시 friendly fallback
  const primaryKeyword = parsed.tone_keywords[0]
  const register: ToneFingerprint['register'] =
    REGISTER_MAP[primaryKeyword] ?? 'friendly'

  // signature_phrases: 각 톤 키워드를 템플릿으로 변환 (순서 보존)
  const template = SIGNATURE_TEMPLATES[register]
  const signature_phrases = parsed.tone_keywords.map((kw) => template(kw)) as [
    string,
    string,
    string,
  ]

  // menu_highlights: "이름 — 설명" 정규화 (desc 없으면 이름만)
  const menu_highlights = parsed.menus.map((m) =>
    m.desc ? `${m.name} — ${m.desc}` : m.name
  ) as [string, string, string]

  return ToneFingerprintSchema.parse({
    voice,
    register,
    signature_phrases,
    menu_highlights,
  })
}
