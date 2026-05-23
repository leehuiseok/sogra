// server-only: Runway Gen-3 Turbo renderer (Layer 2)
// Plan §2.3 Decision 1 — primary video model. ContentBrief.target_format === 'reels'.
// 5초 음식 비주얼. text-to-video.
// Runway API: https://docs.dev.runwayml.com/

import { buildStoreTone } from '@/lib/prompts/store-tone'
import type { ContentBrief } from '@/lib/prompts/content-brief'

// =========================================================
// ProviderPayload — Runway Gen-3 Turbo text-to-video
// =========================================================

export interface RunwayGen3Payload {
  provider: 'runway'
  model: 'gen3a_turbo'
  // text-to-video 프롬프트 (영문 + 한국 음식 명사 혼용)
  prompt_text: string
  // 5초 (Plan §AC-7: 15~30초 릴스이나 v1 PoC는 5초, Decision 1 단가 기준)
  duration: 5
  // 9:16 세로 릴스 비율
  ratio: '768:1280' | '1280:768'
  // 시드 (결정성 위해 ContentBrief 해시 기반)
  seed?: number
  // watermark 제거 옵션 (paid feature, default true)
  watermark: boolean
  metadata: {
    target_format: ContentBrief['target_format']
    store_name: string
    register: string
  }
}

// =========================================================
// register → 비주얼·카메라 무빙 매핑
// =========================================================

const VISUAL_GUIDE: Record<
  string,
  { camera: string; mood: string; pace: string }
> = {
  casual: {
    camera: 'handheld dynamic, slight shake, vlog style',
    mood: 'cheerful, bright daylight',
    pace: 'quick cuts, energetic',
  },
  friendly: {
    camera: 'smooth slow dolly-in to the dish, gimbal stabilized',
    mood: 'warm tungsten light, cozy Korean restaurant interior',
    pace: 'gentle and inviting',
  },
  polite: {
    camera: 'static top-down then slow pan, tripod',
    mood: 'clean, evenly lit, minimalist',
    pace: 'calm and deliberate',
  },
  formal: {
    camera: 'cinematic dolly with shallow depth of field, anamorphic feel',
    mood: 'dramatic side lighting, refined Korean fine-dining',
    pace: 'slow and elegant',
  },
}

const EVENT_SCENE: Record<string, string> = {
  rain: 'rain droplets on the window, steam rising from a hot Korean dish',
  heat: 'condensation on a cold drink, ice cubes, refreshing cold noodle dish',
  holiday: 'festive Korean holiday table setting with traditional side dishes',
  opening: 'fresh ingredients being plated for the first serving of the day',
  discount: 'generous portion served on a wooden table, abundance shot',
  lunch: 'a quick single-portion Korean lunch set on a bright table',
  dinner: 'family dinner table with multiple Korean dishes, warm lighting',
  other: 'seasonal Korean dish presented with care on a rustic table',
}

// =========================================================
// 결정적 seed 생성 — 같은 brief → 같은 seed
// =========================================================

function hashSeed(brief: ContentBrief): number {
  const key = [
    brief.store_name,
    brief.tone_keywords.join('|'),
    brief.menus.map((m) => m.name).join('|'),
    brief.situation.event,
    brief.situation.action,
    brief.situation.when,
  ].join('::')
  // FNV-1a 32bit
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  // Runway seed는 양의 32bit 정수
  return h >>> 0
}

// =========================================================
// render(): ContentBrief → RunwayGen3Payload
// =========================================================

export function render(brief: ContentBrief): RunwayGen3Payload {
  if (brief.target_format !== 'reels') {
    throw new Error('runway_gen3_invalid_target_format')
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

  const visual = VISUAL_GUIDE[tone.register] ?? VISUAL_GUIDE.friendly
  const scene = EVENT_SCENE[brief.situation.event] ?? EVENT_SCENE.other

  // 대표 메뉴 1개 hero shot 중심 (5초 분량 한계)
  const heroMenu = brief.menus[0]
  const heroDesc = heroMenu.desc ? `(${heroMenu.desc})` : ''

  const prompt_text = [
    `Korean food cinemagraph for Instagram Reels, 9:16 vertical, 5 seconds.`,
    `Hero subject: ${heroMenu.name} ${heroDesc} — Korean cuisine, photorealistic, mouth-watering.`,
    `Camera: ${visual.camera}.`,
    `Mood: ${visual.mood}.`,
    `Pace: ${visual.pace}.`,
    `Scene: ${scene}.`,
    brief.extra_context ? `Context: ${brief.extra_context}.` : '',
    `Restaurant name "${brief.store_name}" not shown as text — visual only, no overlay text, no logos, no watermarks.`,
    `Style: high-end food cinematography, shallow depth of field, natural texture, steam or sizzle motion if applicable.`,
  ]
    .filter((s) => s.length > 0)
    .join(' ')

  return {
    provider: 'runway',
    model: 'gen3a_turbo',
    prompt_text,
    duration: 5,
    ratio: '768:1280',
    seed: hashSeed(brief),
    watermark: false,
    metadata: {
      target_format: brief.target_format,
      store_name: brief.store_name,
      register: tone.register,
    },
  }
}
