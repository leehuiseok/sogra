// server-only: GPT-4o-mini renderer (Layer 2)
// Plan §2.3 Decision 2 — caption fallback. Claude Haiku 장애 시 swap.
// 입력은 ContentBrief뿐.

import { buildStoreTone } from '@/lib/prompts/store-tone'
import type { ContentBrief } from '@/lib/prompts/content-brief'

// =========================================================
// ProviderPayload — OpenAI Chat Completions 구조
// https://platform.openai.com/docs/api-reference/chat
// =========================================================

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface Gpt4oMiniPayload {
  provider: 'openai'
  model: 'gpt-4o-mini'
  max_tokens: number
  temperature: number
  response_format: { type: 'json_object' }
  messages: OpenAIMessage[]
  metadata: {
    target_format: ContentBrief['target_format']
    store_name: string
    register: string
  }
}

// =========================================================
// 시스템 프롬프트 — Claude Haiku와 동일한 contract 유지 (snapshot test 통과 목표)
// =========================================================

const SYSTEM_PROMPT = [
  '당신은 한국 음식점 사장님의 인스타그램 캡션·문구를 작성하는 카피라이터입니다.',
  '말투 키워드와 매장 톤을 반영해 자연스럽고 짧은 한국어 문장을 만듭니다.',
  '규칙:',
  '- 인스타그램 캡션은 1~3문장, 80자 이내.',
  '- 해시태그는 본문 아래에 5~8개. 모두 한국어 또는 한영혼용.',
  '- 과장·허위 광고 금지 ("최고", "1위", "역대급" 단독 사용 금지).',
  '- 가격·할인율은 사용자가 명시한 경우에만 포함.',
  '- 응답은 반드시 JSON 한 덩이: {"caption":"...","hashtags":["...","..."]}',
].join('\n')

const REGISTER_GUIDE: Record<string, string> = {
  casual: '반말 + 가벼운 이모지. 경쾌하게.',
  friendly: '존댓말 기본, 다정하고 따뜻하게.',
  polite: '정중한 존댓말, 깔끔한 문장.',
  formal: '격식 있는 존댓말, 단정한 문어체.',
}

// =========================================================
// render(): ContentBrief → Gpt4oMiniPayload
// =========================================================

export function render(brief: ContentBrief): Gpt4oMiniPayload {
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
    `매장명: ${brief.store_name}`,
    `말투 키워드: ${brief.tone_keywords.join(', ')}`,
    `톤 가이드: ${guide}`,
    `대표 메뉴: ${tone.menu_highlights.join(' / ')}`,
    `상황: event=${brief.situation.event}, action=${brief.situation.action}, when=${brief.situation.when}`,
    brief.extra_context ? `추가 컨텍스트: ${brief.extra_context}` : '',
    `target_format=${brief.target_format} — 인스타그램 ${formatLabel(brief.target_format)} JSON으로 작성.`,
  ]
    .filter((s) => s.length > 0)
    .join('\n')

  return {
    provider: 'openai',
    model: 'gpt-4o-mini',
    max_tokens: 512,
    temperature: 0.4,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
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
