// lib/insights/poll-meta.ts
// Meta Graph API Insights 단일 호출 래퍼 (Plan §Step 5 AC-11).
//
// 사용 엔드포인트 (Graph API v21.0):
//   GET /{ig-media-id}/insights?metric=likes,reach,impressions,saves,comments&access_token=...
//
// 중요한 맥락:
// - Meta Insights는 이미지/Reels에 대해 "lifetime" period 가 기본값이며 메트릭이 누적값으로 반환된다.
// - 따라서 h24 와 d7 윈도우의 차이는 Meta 측 period 가 아니라 우리가 호출하는 시점(captured_at) 의 차이로 표현된다.
// - 본 모듈은 단순히 현재 시점의 누적 값을 가져온다. Delta 계산이 필요하면 호출 측에서 수행.
//
// 에러 분류:
// - 429 / Meta code 4·17·32·613 → rateLimit (호출 측에서 백오프 처리)
// - 5xx → serverError (재시도 가능)
// - 그 외 4xx → permanent (재시도 불가)

export type InsightsMetrics = {
  likes: number
  reach: number
  impressions: number
  saves: number
  comments: number
  raw: unknown
}

export class InsightsPollError extends Error {
  code: 'rate_limit' | 'server_error' | 'permanent' | 'network'

  status?: number

  constructor(
    code: InsightsPollError['code'],
    message: string,
    status?: number,
  ) {
    super(message)
    this.code = code
    this.status = status
  }
}

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0'
const METRIC_LIST = 'likes,reach,impressions,saves,comments'

type GraphInsightsValue = {
  value?: number | { [k: string]: number }
  end_time?: string
}

type GraphInsightsDatum = {
  name?: string
  period?: string
  values?: GraphInsightsValue[]
}

type GraphInsightsResponse = {
  data?: GraphInsightsDatum[]
  error?: {
    message: string
    type: string
    code: number
  }
}

// Meta 가 반환한 단일 메트릭 datum 에서 첫 value 를 number 로 추출.
// reach/impressions 등은 { value: number } 형태이고, demographics 류는 object 가 올 수 있는데
// 본 폴러는 단순 카운트 메트릭만 사용하므로 number 만 신뢰한다.
function extractMetric(data: GraphInsightsDatum[] | undefined, name: string): number {
  if (!data) return 0
  const datum = data.find((d) => d.name === name)
  const first = datum?.values?.[0]?.value
  return typeof first === 'number' ? first : 0
}

export type PollInput = {
  ig_media_id: string
  access_token: string
}

export async function pollMetaInsights(
  input: PollInput,
): Promise<InsightsMetrics> {
  const url = new URL(`${GRAPH_API_BASE}/${input.ig_media_id}/insights`)
  url.searchParams.set('metric', METRIC_LIST)
  url.searchParams.set('access_token', input.access_token)

  let response: Response
  try {
    response = await globalThis.fetch(url.toString(), { method: 'GET' })
  } catch (err) {
    throw new InsightsPollError(
      'network',
      `Meta Insights 호출 네트워크 실패: ${(err as Error).message}`,
    )
  }

  const json = (await response.json().catch(() => ({}))) as GraphInsightsResponse

  if (!response.ok || json.error) {
    const code = json.error?.code
    const isRate =
      response.status === 429 ||
      code === 4 ||
      code === 17 ||
      code === 32 ||
      code === 613

    if (isRate) {
      throw new InsightsPollError(
        'rate_limit',
        json.error?.message ?? 'Meta Insights rate limit',
        response.status,
      )
    }

    if (response.status >= 500) {
      throw new InsightsPollError(
        'server_error',
        json.error?.message ?? `Meta Insights 5xx (HTTP ${response.status})`,
        response.status,
      )
    }

    throw new InsightsPollError(
      'permanent',
      json.error?.message ?? `Meta Insights 호출 실패 (HTTP ${response.status})`,
      response.status,
    )
  }

  return {
    likes: extractMetric(json.data, 'likes'),
    reach: extractMetric(json.data, 'reach'),
    impressions: extractMetric(json.data, 'impressions'),
    saves: extractMetric(json.data, 'saves'),
    comments: extractMetric(json.data, 'comments'),
    raw: json,
  }
}
