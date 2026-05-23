// lib/observability/metrics.ts
// 메트릭 수집 sink (Plan §2.5)
// - MetricSink 인터페이스 + supabase / stdout 두 가지 기본 구현
// - 메트릭 기록 실패가 비즈니스 로직을 막지 않도록 best-effort (swallow + console.warn)

import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentCorrelationId } from './correlation-id'

// =========================================================
// 메트릭 이름 상수 (Plan §2.5)
// =========================================================
export const METRIC = {
  // 콘텐츠 생성 / Meta API / 쿼터 / 비용
  CONTENT_GENERATION_LATENCY_MS: 'content_generation_latency_ms',
  META_API_ERROR_RATE: 'meta_api_error_rate',
  QUOTA_BREACH_COUNT: 'quota_breach_count',
  COST_PER_USER_KR_WON: 'cost_per_user_kr_won',

  // 잡 큐 4종
  JOB_QUEUE_DEPTH: 'job_queue_depth',
  JOB_P95_LATENCY: 'job_p95_latency',
  IN_FLIGHT_JOB_AGE_P95: 'in_flight_job_age_p95',
  DEAD_LETTER_COUNT: 'dead_letter_count',
  QUOTA_REFUND_COUNT: 'quota_refund_count',

  // NLU
  NLU_CONFIRM_RATE: 'nlu_confirm_rate',
  NLU_EDIT_RATE: 'nlu_edit_rate',
  NLU_LOW_CONFIDENCE_RATE: 'nlu_low_confidence_rate',

  // Baseline
  BASELINE_CAPTURE_STATUS_DISTRIBUTION: 'baseline_capture_status_distribution',

  // 보안
  WEBHOOK_SIGNATURE_FAIL_COUNT: 'webhook_signature_fail_count',
  CUSTOMER_KEY_MISMATCH_COUNT: 'customer_key_mismatch_count',
} as const

export type MetricName = (typeof METRIC)[keyof typeof METRIC]
export type MetricType = 'counter' | 'gauge' | 'timing'
export type MetricTags = Record<string, string | number | boolean | null | undefined>

// =========================================================
// Sink 인터페이스
// =========================================================
export interface MetricSink {
  increment(name: MetricName | string, tags?: MetricTags, value?: number): Promise<void>
  gauge(name: MetricName | string, value: number, tags?: MetricTags): Promise<void>
  timing(name: MetricName | string, ms: number, tags?: MetricTags): Promise<void>
}

// 공통 페이로드 — Supabase observability_metrics row 형태
type MetricPayload = {
  metric_name: string
  metric_type: MetricType
  value: number
  tags: MetricTags
  store_id: string | null
  correlation_id: string | null
  recorded_at: string
}

// tags에서 store_id를 분리하고 직렬화 가능한 형태로 정리
function buildPayload(
  name: string,
  metric_type: MetricType,
  value: number,
  tags: MetricTags | undefined,
): MetricPayload {
  const cleanTags: MetricTags = { ...(tags ?? {}) }
  let store_id: string | null = null
  if (typeof cleanTags.store_id === 'string') {
    store_id = cleanTags.store_id
    delete cleanTags.store_id
  }
  return {
    metric_name: name,
    metric_type,
    value,
    tags: cleanTags,
    store_id,
    correlation_id: getCurrentCorrelationId(),
    recorded_at: new Date().toISOString(),
  }
}

// =========================================================
// stdout sink (개발용)
// =========================================================
class StdoutMetricSink implements MetricSink {
  async increment(name: string, tags?: MetricTags, value = 1): Promise<void> {
    this.write(buildPayload(name, 'counter', value, tags))
  }
  async gauge(name: string, value: number, tags?: MetricTags): Promise<void> {
    this.write(buildPayload(name, 'gauge', value, tags))
  }
  async timing(name: string, ms: number, tags?: MetricTags): Promise<void> {
    this.write(buildPayload(name, 'timing', ms, tags))
  }
  private write(payload: MetricPayload): void {
    // 한 줄 JSON — 로그 수집기 친화적
    try {
      console.log(JSON.stringify({ kind: 'metric', ...payload }))
    } catch (err) {
      console.warn('[metrics] stdout 직렬화 실패', err)
    }
  }
}

// =========================================================
// supabase sink (운영용)
// =========================================================
class SupabaseMetricSink implements MetricSink {
  async increment(name: string, tags?: MetricTags, value = 1): Promise<void> {
    await this.insert(buildPayload(name, 'counter', value, tags))
  }
  async gauge(name: string, value: number, tags?: MetricTags): Promise<void> {
    await this.insert(buildPayload(name, 'gauge', value, tags))
  }
  async timing(name: string, ms: number, tags?: MetricTags): Promise<void> {
    await this.insert(buildPayload(name, 'timing', ms, tags))
  }
  private async insert(payload: MetricPayload): Promise<void> {
    // best-effort: 실패해도 throw 하지 않음
    try {
      const admin = createAdminClient()
      const { error } = await admin.from('observability_metrics').insert({
        metric_name: payload.metric_name,
        metric_type: payload.metric_type,
        value: payload.value,
        tags: payload.tags as never,
        store_id: payload.store_id,
        correlation_id: payload.correlation_id,
        recorded_at: payload.recorded_at,
      })
      if (error) {
        console.warn('[metrics] supabase insert error', error.message)
      }
    } catch (err) {
      console.warn('[metrics] supabase sink throw swallowed', err)
    }
  }
}

// =========================================================
// 싱크 선택 — METRICS_SINK=stdout 이면 stdout, 그 외는 supabase
// =========================================================
let cachedSink: MetricSink | null = null

export function getMetricSink(): MetricSink {
  if (cachedSink) return cachedSink
  const mode = (process.env.METRICS_SINK ?? '').toLowerCase()
  cachedSink = mode === 'stdout' ? new StdoutMetricSink() : new SupabaseMetricSink()
  return cachedSink
}

/**
 * 테스트에서 sink를 주입하기 위한 훅. 운영 코드에서는 사용 금지.
 */
export function __setMetricSinkForTest(sink: MetricSink | null): void {
  cachedSink = sink
}

// =========================================================
// 편의 함수 — 모든 호출은 best-effort
// =========================================================
export async function metricIncrement(
  name: MetricName | string,
  tags?: MetricTags,
  value = 1,
): Promise<void> {
  try {
    await getMetricSink().increment(name, tags, value)
  } catch (err) {
    console.warn('[metrics] increment swallowed', err)
  }
}

export async function metricGauge(
  name: MetricName | string,
  value: number,
  tags?: MetricTags,
): Promise<void> {
  try {
    await getMetricSink().gauge(name, value, tags)
  } catch (err) {
    console.warn('[metrics] gauge swallowed', err)
  }
}

export async function metricTiming(
  name: MetricName | string,
  ms: number,
  tags?: MetricTags,
): Promise<void> {
  try {
    await getMetricSink().timing(name, ms, tags)
  } catch (err) {
    console.warn('[metrics] timing swallowed', err)
  }
}
