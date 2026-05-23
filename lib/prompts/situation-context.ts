// server-only: 상황 context 빌더 (Layer 1)
// 입력: situation_triggers row + 외부 signals snapshot (weather/calendar/insights)
// 출력: provider-agnostic situation context JSON
// Plan §5 Step 4 RI-2 — Layer 2 renderer는 이 context를 통해 외부 신호에 접근한다.

import { z } from 'zod'
import type { Database } from '@/lib/supabase/types'

// =========================================================
// Schema
// =========================================================

// 외부 신호 snapshot (lib/signals/* 결과의 정규화된 표현)
export const SignalsSnapshotSchema = z.object({
  weather: z
    .object({
      condition: z.string(), // 'rain' | 'heat' | 'clear' | ...
      temperature_c: z.number().optional(),
      description_ko: z.string().optional(),
    })
    .optional(),
  calendar: z
    .object({
      // 평일/주말/공휴일/명절 태그
      tags: z.array(z.string()),
      holiday_name_ko: z.string().optional(),
    })
    .optional(),
  insights: z
    .object({
      // IG 인사이트 힌트 (top hashtag, peak hour 등)
      top_hashtags: z.array(z.string()).optional(),
      peak_hour: z.number().min(0).max(23).optional(),
    })
    .optional(),
})

export type SignalsSnapshot = z.infer<typeof SignalsSnapshotSchema>

// situation context — Layer 2 renderer 입력의 일부 (ContentBrief.situation 확장 정보)
export const SituationContextSchema = z.object({
  event: z.string(),
  action: z.string(),
  when: z.string(),
  target: z.string().nullable(),
  weather: z
    .object({
      condition: z.string(),
      temperature_c: z.number().optional(),
      description_ko: z.string().optional(),
    })
    .optional(),
  calendar_tags: z.array(z.string()).optional(),
  insight_hints: z
    .object({
      top_hashtags: z.array(z.string()).optional(),
      peak_hour: z.number().optional(),
    })
    .optional(),
})

export type SituationContext = z.infer<typeof SituationContextSchema>

// situation_triggers row 타입 alias (lib/supabase/types.ts 재사용)
export type SituationTriggerRow =
  Database['public']['Tables']['situation_triggers']['Row']

// =========================================================
// Pure 변환 함수
// =========================================================

/**
 * situation_triggers row + 외부 signals → situation context.
 * row.signals JSONB 안에 캐시된 신호가 있으면 우선 사용하고,
 * 인자로 전달된 snapshot으로 보강한다.
 */
export function buildSituationContext(
  row: SituationTriggerRow,
  snapshot?: SignalsSnapshot
): SituationContext {
  // row.signals JSONB는 Json 타입이므로 안전하게 narrowing
  const rowSignals =
    row.signals && typeof row.signals === 'object' && !Array.isArray(row.signals)
      ? (row.signals as Record<string, unknown>)
      : {}

  // weather: snapshot 우선, fallback으로 row.signals.weather
  const weather =
    snapshot?.weather ?? coerceWeather(rowSignals['weather'])

  // calendar_tags: snapshot.calendar.tags 우선
  const calendar_tags =
    snapshot?.calendar?.tags ?? coerceStringArray(rowSignals['calendar_tags'])

  // insight_hints: snapshot.insights 우선
  const insight_hints = snapshot?.insights
    ? {
        top_hashtags: snapshot.insights.top_hashtags,
        peak_hour: snapshot.insights.peak_hour,
      }
    : coerceInsightHints(rowSignals['insight_hints'])

  return SituationContextSchema.parse({
    event: row.event,
    action: row.action,
    when: row.when_text ?? 'today',
    target: row.target,
    weather,
    calendar_tags,
    insight_hints,
  })
}

// =========================================================
// Json → 정형 narrowing helper (zod 안전 변환)
// =========================================================

function coerceWeather(value: unknown): SituationContext['weather'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const v = value as Record<string, unknown>
  if (typeof v.condition !== 'string') return undefined
  return {
    condition: v.condition,
    temperature_c:
      typeof v.temperature_c === 'number' ? v.temperature_c : undefined,
    description_ko:
      typeof v.description_ko === 'string' ? v.description_ko : undefined,
  }
}

function coerceStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const arr = value.filter((v): v is string => typeof v === 'string')
  return arr.length > 0 ? arr : undefined
}

function coerceInsightHints(value: unknown): SituationContext['insight_hints'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const v = value as Record<string, unknown>
  const top_hashtags = coerceStringArray(v.top_hashtags)
  const peak_hour =
    typeof v.peak_hour === 'number' && v.peak_hour >= 0 && v.peak_hour <= 23
      ? v.peak_hour
      : undefined
  if (top_hashtags === undefined && peak_hour === undefined) return undefined
  return { top_hashtags, peak_hour }
}
