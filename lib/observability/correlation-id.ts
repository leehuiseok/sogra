// lib/observability/correlation-id.ts
// 요청 단위 correlation_id 추적 (Plan §2.5 / Step 6 Lane 4)
// - 들어오는 X-Correlation-Id 헤더 우선
// - 없으면 crypto.randomUUID()
// - AsyncLocalStorage로 요청 스코프 전파

import { AsyncLocalStorage } from 'node:async_hooks'

// correlation_id 만 저장하는 단순 컨텍스트
type CorrelationContext = {
  correlationId: string
}

// 모듈 전역 스토리지 (Edge Runtime이 아닌 Node Runtime 전제)
const storage = new AsyncLocalStorage<CorrelationContext>()

const CORRELATION_HEADER = 'x-correlation-id'

/**
 * 헤더에서 correlation_id 추출 또는 새로 생성.
 * Next App Router의 Request 헤더 또는 raw Headers를 받는다.
 */
export function getCorrelationId(headers?: Headers | null): string {
  if (headers) {
    const fromHeader = headers.get(CORRELATION_HEADER)
    if (fromHeader && fromHeader.trim().length > 0) {
      return fromHeader.trim()
    }
  }
  // 현재 컨텍스트에 이미 있으면 재사용 (중첩 호출 안전성)
  const ctx = storage.getStore()
  if (ctx) {
    return ctx.correlationId
  }
  return crypto.randomUUID()
}

/**
 * 현재 컨텍스트의 correlation_id 조회. 컨텍스트 밖에서는 null.
 * - 외부 fetch 래퍼나 metric sink에서 호출
 */
export function getCurrentCorrelationId(): string | null {
  const ctx = storage.getStore()
  return ctx ? ctx.correlationId : null
}

/**
 * 주어진 correlation_id 컨텍스트 안에서 fn 실행.
 * App Router route handler 진입점에서 감싸는 용도.
 */
export function withCorrelation<T>(
  id: string,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run({ correlationId: id }, fn)
}

/**
 * Response 헤더에 X-Correlation-Id를 부여하기 위한 헤더 상수.
 */
export const CORRELATION_ID_HEADER = 'X-Correlation-Id'
