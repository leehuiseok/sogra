'use client'

import { useState, useTransition } from 'react'
import { consentToRealPublish } from './consent'

interface RealPublishConsentModalProps {
  needsConsent: boolean
}

export default function RealPublishConsentModal({ needsConsent }: RealPublishConsentModalProps) {
  const [dismissed, setDismissed] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!needsConsent || dismissed) return null

  function handleConsent() {
    setError(null)
    startTransition(async () => {
      try {
        await consentToRealPublish()
        setDismissed(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : '동의 처리 중 오류가 발생했습니다.')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
        <h2 className="text-base font-bold text-gray-900 mb-3">인스타그램 자동 게시 동의</h2>
        <p className="text-sm text-gray-700 mb-5 leading-relaxed">
          이제부터 콘텐츠가 인스타그램에 자동으로 게시됩니다. 계속하시겠습니까?
        </p>
        {error && (
          <p className="text-xs text-red-500 mb-3">{error}</p>
        )}
        <div className="flex gap-3">
          <button
            onClick={() => setDismissed(true)}
            disabled={isPending}
            className="flex-1 py-2 border border-gray-300 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleConsent}
            disabled={isPending}
            className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {isPending ? '처리 중...' : '동의하고 계속'}
          </button>
        </div>
      </div>
    </div>
  )
}
