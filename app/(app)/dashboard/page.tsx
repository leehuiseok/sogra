'use client'

import { useEffect, useState } from 'react'
import ConfirmCard, { type ParsedOutput } from '@/components/triggers/ConfirmCard'

interface Recommendation {
  presetKey: string
  score: number
  reason: string
  preset: {
    key: string
    event: string
    action: string
    whenText: string
    labelKo: string
    descriptionKo: string
    sortOrder: number
  }
}

interface FreeformResult {
  parsed: ParsedOutput & { confidence: number }
  needsConfirmation: boolean
  nluEventId: string
}

export default function DashboardPage() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [recLoading, setRecLoading] = useState(true)
  const [recError, setRecError] = useState<string | null>(null)

  const [freeformInput, setFreeformInput] = useState('')
  const [freeformLoading, setFreeformLoading] = useState(false)
  const [freeformResult, setFreeformResult] = useState<FreeformResult | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/triggers/recommendations')
      .then((res) => res.json())
      .then((data: { recommendations?: Recommendation[]; error?: string }) => {
        if (data.error) {
          setRecError(data.error)
        } else {
          setRecommendations(data.recommendations ?? [])
        }
      })
      .catch(() => setRecError('추천을 불러오지 못했습니다.'))
      .finally(() => setRecLoading(false))
  }, [])

  async function handleFreeformSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!freeformInput.trim()) return

    setFreeformLoading(true)
    setFreeformResult(null)
    setToast(null)

    try {
      const res = await fetch('/api/triggers/freeform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: freeformInput.trim() }),
      })
      const data = (await res.json()) as FreeformResult & { error?: string }

      if (data.error) {
        setToast('분석 중 오류가 발생했습니다. 다시 시도해 주세요.')
        return
      }

      if (data.needsConfirmation) {
        setFreeformResult(data)
      } else {
        setToast('추천 콘텐츠 생성 요청 접수 (Step 4 구현 예정)')
        setFreeformInput('')
      }
    } catch {
      setToast('네트워크 오류가 발생했습니다. 다시 시도해 주세요.')
    } finally {
      setFreeformLoading(false)
    }
  }

  async function handleConfirmAction(
    action: 'confirm' | 'edit' | 'reject',
    corrected?: ParsedOutput,
  ) {
    if (!freeformResult) return

    await fetch('/api/triggers/freeform', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nluEventId: freeformResult.nluEventId,
        userAction: action,
        correctedOutput: corrected,
      }),
    })

    setFreeformResult(null)

    if (action === 'confirm' || action === 'edit') {
      setToast('추천 콘텐츠 생성 요청 접수 (Step 4 구현 예정)')
      setFreeformInput('')
    } else {
      setToast('취소되었습니다.')
    }
  }

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-1">사장님, 오늘의 추천이에요</h1>
      <p className="text-sm text-gray-500 mb-6">날씨·요일·계절 신호를 분석해 최적의 마케팅 상황을 골랐어요.</p>

      {recLoading && (
        <p className="text-sm text-gray-400 mb-4">추천 불러오는 중...</p>
      )}

      {recError && (
        <p className="text-sm text-red-500 mb-4">{recError}</p>
      )}

      {!recLoading && recommendations.length === 0 && !recError && (
        <p className="text-sm text-gray-400 mb-4">지금은 딱 맞는 추천이 없어요. 자유 입력으로 시도해 보세요.</p>
      )}

      <div className="mb-6">
        {recommendations.map((rec) => (
          <div
            key={rec.presetKey}
            className="bg-white rounded-lg shadow p-4 mb-3 flex items-start justify-between gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-gray-900">{rec.preset.labelKo}</span>
                <span className="text-xs bg-orange-100 text-orange-700 font-medium px-1.5 py-0.5 rounded">
                  점수 {Math.round(rec.score * 100)}
                </span>
              </div>
              <p className="text-xs text-gray-500">{rec.reason}</p>
              <p className="text-xs text-gray-400 mt-0.5">{rec.preset.descriptionKo}</p>
            </div>
            <button
              disabled
              className="shrink-0 text-xs bg-gray-100 text-gray-400 font-medium px-3 py-1.5 rounded cursor-not-allowed"
              title="Step 4 구현 예정"
            >
              콘텐츠 만들기
            </button>
          </div>
        ))}
      </div>

      <hr className="border-gray-200 mb-6" />

      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-1">직접 입력하기</h2>
        <p className="text-sm text-gray-500 mb-3">
          예: &ldquo;내일 비 오니까 따뜻한 메뉴 할인 알리고 싶어&rdquo;
        </p>

        <form onSubmit={handleFreeformSubmit} className="space-y-3">
          <textarea
            value={freeformInput}
            onChange={(e) => setFreeformInput(e.target.value)}
            placeholder="마케팅 상황을 자유롭게 입력해 주세요 (최대 500자)"
            maxLength={500}
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <button
            type="submit"
            disabled={freeformLoading || !freeformInput.trim()}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
          >
            {freeformLoading ? '분석 중...' : '분석하기'}
          </button>
        </form>

        {freeformResult?.needsConfirmation && (
          <div className="mt-4">
            <ConfirmCard
              parsed={freeformResult.parsed}
              nluEventId={freeformResult.nluEventId}
              onAction={handleConfirmAction}
            />
          </div>
        )}

        {toast && (
          <div className="mt-4 bg-gray-800 text-white text-sm px-4 py-3 rounded-lg">
            {toast}
          </div>
        )}
      </section>
    </main>
  )
}
