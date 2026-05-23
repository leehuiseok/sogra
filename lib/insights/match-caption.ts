// lib/insights/match-caption.ts
// Mock 게시 사후 매칭 — caption 기반 Jaccard 유사도 (Plan §Step 5 / Lane 5)
//
// 토큰 분리: 공백·구두점·특수문자 기준, 소문자 정규화.
// 가중치: 이 함수는 0..1 점수만 반환. 호출측에서 0.6 비중 적용.
//
// 예시:
//   matchCaption("개업 1주년 이벤트! 안주 50% 할인", "안주 50% 할인 이벤트 진행 중")
//   → 공통: {안주,50,할인,이벤트}=4, 합집합=7 → ≈0.57
//
//   matchCaption("오늘 하루만! 치킨 무료", "치킨 무료 증정 오늘만")
//   → 공통: {치킨,무료,오늘}=3, 합집합=5 → 0.6
//
//   matchCaption("봄 신메뉴 출시 파스타 & 피자", "완전히 다른 내용의 게시물입니다")
//   → 공통: {}=0 → 0.0

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(' ')
      .filter((t) => t.length > 0),
  )
}

// Jaccard 유사도: |교집합| / |합집합|
export function matchCaption(needle: string, haystack: string): number {
  if (!needle || !haystack) return 0

  const a = tokenize(needle)
  const b = tokenize(haystack)

  if (a.size === 0 || b.size === 0) return 0

  let intersection = 0
  for (const token of a) {
    if (b.has(token)) intersection += 1
  }

  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}
