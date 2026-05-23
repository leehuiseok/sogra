// server-only: DALL-E 3 image renderer (Layer 2)
// Plan §5 Step 4 — 포스터(image 1장) 생성. ContentBrief.target_format === 'poster'.
// OpenAI Images API: https://platform.openai.com/docs/api-reference/images/create

import { buildStoreTone } from '@/lib/prompts/store-tone'
import type { ContentBrief } from '@/lib/prompts/content-brief'

// =========================================================
// ProviderPayload — OpenAI Images API
// =========================================================

export interface Dalle3Payload {
  provider: 'openai-images'
  model: 'dall-e-3'
  prompt: string
  // 인스타그램 피드 1:1 정사각 포스터 기본값
  size: '1024x1024' | '1024x1792' | '1792x1024'
  quality: 'standard' | 'hd'
  style: 'vivid' | 'natural'
  n: 1
  response_format: 'url'
  metadata: {
    target_format: ContentBrief['target_format']
    store_name: string
    register: string
  }
}

// =========================================================
// register → 비주얼 스타일 매핑 (한국 음식 비주얼)
// =========================================================

const STYLE_GUIDE: Record<string, { mood: string; lighting: string }> = {
  casual: {
    mood: '경쾌하고 밝은 분위기, 캐주얼한 카페 비주얼',
    lighting: '자연광, 부드러운 그림자',
  },
  friendly: {
    mood: '따뜻하고 다정한 분위기, 가정적이고 정겨운 한국 음식점 비주얼',
    lighting: '웜톤 텅스텐 조명, 식욕을 자극하는 황금빛',
  },
  polite: {
    mood: '깔끔하고 정돈된 분위기, 미니멀한 플레이팅',
    lighting: '균일하고 깨끗한 화이트 라이팅',
  },
  formal: {
    mood: '격식 있는 고급 한식당 분위기, 전통 식기',
    lighting: '드라마틱한 사이드 라이팅, 깊은 그림자',
  },
}

// =========================================================
// situation event → 비주얼 모티프
// =========================================================

const EVENT_MOTIF: Record<string, string> = {
  rain: '창밖에 비가 내리는 따뜻한 실내, 김이 모락모락 나는 음식',
  heat: '시원한 음료에 맺힌 물방울, 얼음, 청량한 식기',
  holiday: '명절 또는 연휴 분위기, 가족 단위 식탁',
  opening: '새로운 시작, 정성껏 준비한 첫 한 그릇',
  discount: '풍성한 플레이팅, 가성비를 강조한 정직한 구성',
  lunch: '점심 직장인 단품, 빠르게 나오는 한 그릇',
  dinner: '저녁 가족·연인 식탁, 푸짐한 정찬',
  other: '계절감을 담은 정성스러운 한 그릇',
}

// =========================================================
// render(): ContentBrief → Dalle3Payload
// =========================================================

export function render(brief: ContentBrief): Dalle3Payload {
  if (brief.target_format !== 'poster') {
    // 어댑터 격리 — image renderer는 poster 전용
    throw new Error('dalle3_invalid_target_format')
  }

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

  const style = STYLE_GUIDE[tone.register] ?? STYLE_GUIDE.friendly
  const motif = EVENT_MOTIF[brief.situation.event] ?? EVENT_MOTIF.other

  // DALL-E 3는 영어 프롬프트가 가장 안정적이지만, 한국 음식 명사는 한국어 유지가 비주얼 정확도 ↑
  const menuNames = brief.menus.map((m) => m.name).join(', ')

  const prompt = [
    `Instagram square poster photograph for a Korean restaurant named "${brief.store_name}".`,
    `Subject: ${menuNames} — Korean food photography, top-down or 45° angle, hero dish in focus.`,
    `Mood: ${style.mood}.`,
    `Lighting: ${style.lighting}.`,
    `Scene context: ${motif}.`,
    brief.extra_context ? `Additional context: ${brief.extra_context}.` : '',
    'Style: high-resolution food photography, sharp focus on food, shallow depth of field background, no text overlay, no logo, no watermark.',
    'Avoid: cartoon, illustration, anime, low quality, extra limbs, text artifacts, distorted utensils.',
  ]
    .filter((s) => s.length > 0)
    .join(' ')

  return {
    provider: 'openai-images',
    model: 'dall-e-3',
    prompt,
    size: '1024x1024',
    // 한국 음식 비주얼은 hd가 톤 일관성 ↑ (R5 미트게이션)
    quality: 'hd',
    // friendly/casual → vivid, polite/formal → natural
    style: tone.register === 'polite' || tone.register === 'formal' ? 'natural' : 'vivid',
    n: 1,
    response_format: 'url',
    metadata: {
      target_format: brief.target_format,
      store_name: brief.store_name,
      register: tone.register,
    },
  }
}
