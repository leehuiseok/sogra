// server-only: ContentBrief 빌더 (Layer 1 합성)
// Plan §5 Step 4 RI-2 — ContentBriefSchema는 plan 라인 293-303 VERBATIM.
// Layer 2 renderer는 이 ContentBrief만 입력으로 받아 provider-specific payload를 생성한다.

import { z } from 'zod'
import type { Database } from '@/lib/supabase/types'
import { buildStoreTone, type StoreToneInput } from './store-tone'
import {
  buildSituationContext,
  type SignalsSnapshot,
  type SituationContext,
  type SituationTriggerRow,
} from './situation-context'

// =========================================================
// ContentBrief Schema (Plan 라인 293-303 VERBATIM)
// =========================================================

export const ContentBriefSchema = z.object({
  tone_keywords: z.array(z.string()).length(3),
  menus: z.array(z.object({ name: z.string(), desc: z.string().optional() })).length(3),
  situation: z.object({ event: z.string(), action: z.string(), when: z.string() }),
  target_format: z.enum(['poster', 'reels', 'caption']),
  store_name: z.string(),
  extra_context: z.string().optional(),
  // reels(영상) 생성 시 시작 프레임으로 사용할 포스터 storage URL.
  // image-to-video 모델(예: Runway Gen-3 Turbo)에서 promptImage 로 전달된다.
  image_url: z.string().url().optional(),
})
export type ContentBrief = z.infer<typeof ContentBriefSchema>

// =========================================================
// 빌더 입력 타입
// =========================================================

export type StoreProfileRow = Database['public']['Tables']['store_profiles']['Row']

export interface BuildContentBriefArgs {
  storeProfile: StoreProfileRow
  trigger: SituationTriggerRow
  targetFormat: ContentBrief['target_format']
  signals?: SignalsSnapshot
  extraContext?: string
}

// =========================================================
// 메인 빌더
// =========================================================

/**
 * 매장 프로필 + 상황 트리거 + 외부 신호 → ContentBrief.
 * Layer 2 renderer는 ContentBrief만 받아 provider-specific prompt를 생성한다.
 *
 * 책임:
 *  - storeProfile JSONB(menus/tone_keywords)를 strict 검증 (length 3 보장)
 *  - situation context 합성 후 ContentBrief.situation으로 평탄화
 *  - extra_context로 외부 신호의 자연어 요약을 전달 (renderer가 활용)
 */
export function buildContentBrief(args: BuildContentBriefArgs): ContentBrief {
  const { storeProfile, trigger, targetFormat, signals, extraContext } = args

  // store_profiles.tone_keywords / menus는 JSONB → 런타임 검증 필수
  const toneKeywords = parseToneKeywords(storeProfile.tone_keywords)
  const menus = parseMenus(storeProfile.menus)

  // Layer 1: tone fingerprint 검증 차원에서 빌드만 수행 (불일치 시 throw)
  const toneInput: StoreToneInput = {
    store_name: storeProfile.store_name,
    tone_keywords: toneKeywords,
    menus,
  }
  buildStoreTone(toneInput) // throw on schema mismatch

  // Layer 1: situation context (외부 신호 통합)
  const situationContext: SituationContext = buildSituationContext(trigger, signals)

  // extra_context: 외부 신호를 한국어 자연어로 요약 (renderer가 prompt에 활용)
  const composedExtra = composeExtraContext(situationContext, extraContext)

  const brief: ContentBrief = {
    tone_keywords: toneKeywords,
    menus: menus.map((m) => ({
      name: m.name,
      ...(m.desc !== undefined ? { desc: m.desc } : {}),
    })) as ContentBrief['menus'],
    situation: {
      event: situationContext.event,
      action: situationContext.action,
      when: situationContext.when,
    },
    target_format: targetFormat,
    store_name: storeProfile.store_name,
    ...(composedExtra !== undefined ? { extra_context: composedExtra } : {}),
  }

  return ContentBriefSchema.parse(brief)
}

// =========================================================
// JSONB narrowing
// =========================================================

function parseToneKeywords(value: unknown): [string, string, string] {
  const arr = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : []
  if (arr.length !== 3) {
    throw new Error('content_brief_invalid_tone_keywords')
  }
  return [arr[0], arr[1], arr[2]]
}

interface MenuItem {
  name: string
  desc?: string
}

function parseMenus(value: unknown): [MenuItem, MenuItem, MenuItem] {
  if (!Array.isArray(value)) {
    throw new Error('content_brief_invalid_menus')
  }
  const parsed: MenuItem[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const o = item as Record<string, unknown>
    if (typeof o.name !== 'string' || o.name.length === 0) continue
    parsed.push({
      name: o.name,
      ...(typeof o.desc === 'string' && o.desc.length > 0 ? { desc: o.desc } : {}),
    })
  }
  if (parsed.length !== 3) {
    throw new Error('content_brief_invalid_menus')
  }
  return [parsed[0], parsed[1], parsed[2]]
}

// =========================================================
// extra_context 자연어 요약
// =========================================================

function composeExtraContext(
  ctx: SituationContext,
  userExtra?: string
): string | undefined {
  const parts: string[] = []

  if (ctx.weather) {
    const temp =
      typeof ctx.weather.temperature_c === 'number'
        ? `, ${ctx.weather.temperature_c}°C`
        : ''
    const desc = ctx.weather.description_ko ?? ctx.weather.condition
    parts.push(`날씨: ${desc}${temp}`)
  }

  if (ctx.calendar_tags && ctx.calendar_tags.length > 0) {
    parts.push(`달력: ${ctx.calendar_tags.join(', ')}`)
  }

  if (ctx.insight_hints?.top_hashtags && ctx.insight_hints.top_hashtags.length > 0) {
    parts.push(`인기 해시태그: ${ctx.insight_hints.top_hashtags.slice(0, 5).join(' ')}`)
  }

  if (ctx.insight_hints?.peak_hour !== undefined) {
    parts.push(`피크 시간: ${ctx.insight_hints.peak_hour}시`)
  }

  if (ctx.target) {
    parts.push(`타겟 메뉴: ${ctx.target}`)
  }

  if (userExtra && userExtra.trim().length > 0) {
    parts.push(userExtra.trim())
  }

  return parts.length > 0 ? parts.join(' / ') : undefined
}
