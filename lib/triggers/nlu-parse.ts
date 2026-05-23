// server-only: must not be imported in client bundle

export interface NluParseResult {
  event: string
  action: string
  when: string
  target: string | null
  confidence: number
}

const SYSTEM_PROMPT =
  '당신은 한국 음식점 사장님의 자연어 마케팅 지시를 JSON으로 파싱합니다. 입력 예: \'내일 비 오니까 할인\'. 반드시 다음 JSON만 출력하세요: {"event":"...","action":"...","when":"...","target":"..."|null,"confidence":0.0~1.0}. event: rain|heat|holiday|opening|discount|lunch|dinner|other 중 하나. action: promote|discount|announce|other. when: today|tomorrow|weekday|weekend|YYYY-MM-DD|other. target: 메뉴명 또는 null. confidence: 본인 파싱 확신도 0~1.'

export async function parseFreeformUtterance(input: string): Promise<NluParseResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('anthropic_key_missing')
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: input }],
    }),
  })

  if (!response.ok) {
    throw new Error(`anthropic_api_error: ${response.status}`)
  }

  const data = (await response.json()) as { content: Array<{ text: string }> }

  // Defect #3: Claude가 코드펜스나 앞뒤 텍스트 추가할 경우 첫 {...} 블록만 추출
  const raw = data.content[0].text
  const match = raw.match(/\{[\s\S]*\}/)
  const jsonText = match ? match[0] : raw
  try {
    return JSON.parse(jsonText) as NluParseResult
  } catch {
    throw new Error('nlu_parse_invalid_json')
  }
}
