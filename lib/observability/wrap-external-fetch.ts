// lib/observability/wrap-external-fetch.ts
// 외부 API 호출 duration + status 자동 로깅 (Plan §2.5 / Step 6 Lane 4)
// - correlation_id는 AsyncLocalStorage에서 자동 획득
// - external_api_calls 테이블에 best-effort insert
// - meta_api_error_rate 메트릭 counter도 자동 증가 (service=meta_graph일 때)
//
// 사용 예시:
//   const json = await withExternalFetch(
//     { service: 'meta_graph', endpoint: '/{ig-user-id}/media' },
//     async () => {
//       const res = await fetch(url, { method: 'POST', body })
//       if (!res.ok) throw new Error(`status=${res.status}`)
//       return res.json()
//     },
//   )

import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentCorrelationId } from './correlation-id'
import { METRIC, metricIncrement } from './metrics'

export type ExternalService =
  | 'meta_graph'
  | 'anthropic'
  | 'openai'
  | 'runway'
  | 'toss'
  | 'openweather'
  | (string & {}) // 확장 허용 (오타 방지를 위해 known union 우선 노출)

export type WrapExternalFetchOptions = {
  service: ExternalService
  endpoint?: string
  storeId?: string | null
}

type CallRecord = {
  correlation_id: string
  service: string
  endpoint: string | null
  http_status: number | null
  duration_ms: number
  error: string | null
  store_id: string | null
  created_at: string
}

/**
 * 외부 호출 fn을 래핑하여 성공/실패 상관없이 호출 로그를 남긴다.
 * - fn이 Response 객체를 반환하면 status를 자동 추출
 * - fn이 throw하면 error 메시지 기록 + meta_api_error_rate 증가
 */
export async function withExternalFetch<T>(
  options: WrapExternalFetchOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now()
  let httpStatus: number | null = null
  let errorMessage: string | null = null
  try {
    const result = await fn()
    // Response/Response 유사체이면 status 캡처
    if (result && typeof result === 'object' && 'status' in result) {
      const s = (result as { status?: unknown }).status
      if (typeof s === 'number') {
        httpStatus = s
        if (s >= 400) {
          errorMessage = `http_${s}`
        }
      }
    }
    return result
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err)
    throw err
  } finally {
    const duration_ms = Date.now() - startedAt
    void recordCall({
      correlation_id: getCurrentCorrelationId() ?? 'unknown',
      service: options.service,
      endpoint: options.endpoint ?? null,
      http_status: httpStatus,
      duration_ms,
      error: errorMessage,
      store_id: options.storeId ?? null,
      created_at: new Date().toISOString(),
    })
    // Meta Graph 호출 에러는 별도 메트릭으로 카운트
    if (errorMessage && options.service === 'meta_graph') {
      void metricIncrement(METRIC.META_API_ERROR_RATE, {
        service: options.service,
        endpoint: options.endpoint ?? null,
      })
    }
  }
}

// best-effort insert — 실패해도 throw 하지 않음
async function recordCall(rec: CallRecord): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('external_api_calls').insert(rec)
    if (error) {
      console.warn('[external_api_calls] insert error', error.message)
    }
  } catch (err) {
    console.warn('[external_api_calls] insert throw swallowed', err)
  }
}
