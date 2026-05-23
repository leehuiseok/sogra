// server-only: Pika Labs fallback renderer (Layer 2)
// Plan §2.3 Decision 1 — Runway 실패 시 video fallback.
// ContentBrief.target_format === 'reels'. 5초 음식 비주얼.
// Pika Labs API (Generate v1 text-to-video).

import { buildStoreTone } from '@/lib/prompts/store-tone'
import type { ContentBrief } from '@/lib/prompts/content-brief'

// =========================================================
// ProviderPayload — Pika Labs Generate API
// =========================================================

export interface PikaFallbackPayload {
  provider: 'pika'
  // Pika 1.5 / Turbo (스펙 시점 v1)
  model: 'pika-1.5'
  promptText: string
  // pika는 negativePrompt 필드 별도 지원
  negativePrompt: string
  // 5초
  duration: 5
  // 9:16 세로
  aspectRatio: '9:16' | '16:9' | '1:1'
  // FNV-1a 기반 결정적 seed
  seed: number
  // pika 카메라 무빙 옵션 (zoom/pan/tilt)
  options: {
    camera: 'zoom-in' | 'zoom-out' | 'pan-right' | 'pan-left' | 'static'
    motion: 1 | 2 | 3 | 4
  }
  metadata: {
    target_format: ContentBrief['target_format']
    store_name: string
    register: string
    fallback_from: 'runway-gen3'
  }
}

// =========================================================
// register → 카메라 무빙 / motion 강도
// =========================================================

const CAMERA_GUIDE: Record<
  string,
  { camera: PikaFallbackPayload['options']['camera']; motion: 1 | 2 | 3 | 4 }
> = {
  casual: { camera: 'pan-right', motion: 3 },
  friendly: { camera: 'zoom-in', motion: 2 },
  polite: { camera: 'static', motion: 1 },
  formal: { camera: 'zoom-in', motion: 1 },
}

const EVENT_SCENE: Record<string, string> = {
  rain: 'steaming hot Korean dish indoor, rainy window background',
  heat: 'ice cubes dropping into a cold Korean drink, condensation glass',
  holiday: 'Korean holiday banchan spread on a wooden family table',
  opening: 'fresh Korean dish being plated, opening day energy',
  discount: 'generous Korean portion served, abundance close-up',
  lunch: 'quick single-bowl Korean lunch, clean daylight',
  dinner: 'Korean dinner table with multiple banchan, warm tungsten light',
  other: 'seasonal Korean dish, rustic table, natural light',
}

const NEGATIVE_PROMPT = [
  'text overlay',
  'watermark',
  'logo',
  'cartoon',
  'illustration',
  'anime',
  'low quality',
  'blurry',
  'distorted utensils',
  'extra limbs',
  'hands deformed',
].join(', ')

// =========================================================
// 결정적 seed (Runway와 동일 알고리즘으로 일관성 유지)
// =========================================================

function hashSeed(brief: ContentBrief): number {
  const key = [
    brief.store_name,
    brief.tone_keywords.join('|'),
    brief.menus.map((m) => m.name).join('|'),
    brief.situation.event,
    brief.situation.action,
    brief.situation.when,
    'pika', // provider salt — Runway seed와 다르게 분리
  ].join('::')
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

// =========================================================
// render(): ContentBrief → PikaFallbackPayload
// =========================================================

export function render(brief: ContentBrief): PikaFallbackPayload {
  if (brief.target_format !== 'reels') {
    throw new Error('pika_fallback_invalid_target_format')
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

  const camera = CAMERA_GUIDE[tone.register] ?? CAMERA_GUIDE.friendly
  const scene = EVENT_SCENE[brief.situation.event] ?? EVENT_SCENE.other

  const heroMenu = brief.menus[0]
  const heroDesc = heroMenu.desc ? ` (${heroMenu.desc})` : ''

  const promptText = [
    `Korean food video, Instagram Reels 9:16, photorealistic, 5 seconds.`,
    `Hero: ${heroMenu.name}${heroDesc} — Korean cuisine close-up, mouth-watering.`,
    `Scene: ${scene}.`,
    brief.extra_context ? `Context: ${brief.extra_context}.` : '',
    `Cinematic food shot, shallow depth of field, natural steam/sizzle motion, no on-screen text.`,
  ]
    .filter((s) => s.length > 0)
    .join(' ')

  return {
    provider: 'pika',
    model: 'pika-1.5',
    promptText,
    negativePrompt: NEGATIVE_PROMPT,
    duration: 5,
    aspectRatio: '9:16',
    seed: hashSeed(brief),
    options: {
      camera: camera.camera,
      motion: camera.motion,
    },
    metadata: {
      target_format: brief.target_format,
      store_name: brief.store_name,
      register: tone.register,
      fallback_from: 'runway-gen3',
    },
  }
}
