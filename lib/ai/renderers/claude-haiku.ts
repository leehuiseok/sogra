// server-only: Claude Haiku 4.5 renderer (Layer 2)
// Plan §2.3 Decision 2 — primary text model. caption 용도.
// 입력은 ContentBrief뿐. 외부 API 호출은 lib/ai/text-provider.ts(Lane 2)가 수행한다.

import { buildStoreTone } from '@/lib/prompts/store-tone'
import type { ContentBrief } from '@/lib/prompts/content-brief'

// =========================================================
// ProviderPayload — Anthropic Messages API 구조
// https://docs.anthropic.com/en/api/messages
// =========================================================

export interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ClaudeHaikuPayload {
  provider: 'anthropic'
  model: 'claude-haiku-4-5-20251001'
  max_tokens: number
  temperature: number
  system: string
  messages: ClaudeMessage[]
  // 응답 파싱 단계에서 metadata로 활용 (correlation_id, target_format 등)
  metadata: {
    target_format: ContentBrief['target_format']
    store_name: string
    register: string
  }
}

// =========================================================
// 시스템 프롬프트 (deterministic)
// =========================================================

const SYSTEM_PROMPT = [
  '당신은 한국 음식점 사장님의 인스타그램 캡션·문구를 작성하는 카피라이터입니다.',
  '말투 키워드와 매장 톤을 반영해 자연스럽고 짧은 한국어 문장을 만듭니다.',
  '규칙:',
  '- 인스타그램 캡션은 1~3문장, 80자 이내로 작성.',
  '- 해시태그는 본문 아래에 5~8개. 모두 한국어 또는 한영혼용.',
  '- 과장·허위 광고 금지 (예: "최고", "1위", "역대급" 단독 사용 금지).',
  '- 가격·할인율 명시는 사용자가 명시한 경우에만 포함.',
  '- 결과는 JSON 한 덩이만 반환: {"caption":"...","hashtags":["...","..."]}',
].join('\n')

// =========================================================
// 한국어 register → caption tone 가이드 매핑
// =========================================================

const REGISTER_GUIDE: Record<string, string> = {
  casual: '반말과 친근한 이모지를 살짝 섞어도 좋습니다. 가볍고 경쾌하게.',
  friendly: '존댓말 기본, 다정하고 따뜻한 어조. "오늘", "여러분" 같은 부드러운 호명.',
  polite: '정중한 존댓말. 깔끔한 문장. 이모지는 최소화.',
  formal: '격식 있는 존댓말. 문어체에 가까운 단정한 문장.',
}

// =========================================================
// render(): ContentBrief → ClaudeHaikuPayload
// =========================================================

export function render(brief: ContentBrief): ClaudeHaikuPayload {
  // tone fingerprint 재계산 (renderer는 deterministic, store_profile에 의존하지 않음)
  // ContentBrief.menus는 length=3, desc optional이므로 buildStoreTone 입력에 맞춰 변환.
  const tone = buildStoreTone({
    store_name: brief.store_name,
    tone_keywords: brief.tone_keywords as [string, string, string],
    menus: brief.menus.map((m) => ({
      name: m.name,
      ...(m.desc !== undefined ? { desc: m.desc } : {}),
    })) as [
      { name: string; desc?: string },
      { name: string; desc?: string },
      { name: string; desc?: string },
    ],
  })

  const guide = REGISTER_GUIDE[tone.register] ?? REGISTER_GUIDE.friendly

  const userPrompt = [
    `[매장]\n${brief.store_name}`,
    `[말투 키워드]\n${brief.tone_keywords.join(', ')}`,
    `[톤 가이드]\n${guide}`,
    `[대표 메뉴]\n${tone.menu_highlights.map((m, i) => `${i + 1}. ${m}`).join('\n')}`,
    `[상황]\nevent=${brief.situation.event}, action=${brief.situation.action}, when=${brief.situation.when}`,
    brief.extra_context ? `[추가 컨텍스트]\n${brief.extra_context}` : '',
    `[요청]\ntarget_format=${brief.target_format} — 위 톤에 맞춰 인스타그램 ${formatLabel(brief.target_format)}용 한국어 캡션과 해시태그를 작성하세요. JSON만 반환.`,
  ]
    .filter((s) => s.length > 0)
    .join('\n\n')

  return {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    // 일관성이 중요한 캡션이므로 낮은 temperature
    temperature: 0.4,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    metadata: {
      target_format: brief.target_format,
      store_name: brief.store_name,
      register: tone.register,
    },
  }
}

function formatLabel(fmt: ContentBrief['target_format']): string {
  switch (fmt) {
    case 'poster':
      return '포스터 카피'
    case 'reels':
      return '릴스 후킹 문구'
    case 'caption':
      return '피드 캡션'
  }
}
