'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type ActionType = 'checkout' | 'cancel' | 'change-card'

interface BillingActionsProps {
  actionType: ActionType
}

export default function BillingActions({ actionType }: BillingActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCheckout() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/checkout', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? '결제 URL 생성에 실패했습니다.')
        return
      }
      window.location.href = json.auth_url
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    const confirmed = window.confirm(
      '정말 구독을 해지하시겠습니까?\n현재 결제 기간이 끝날 때까지 서비스를 계속 이용하실 수 있습니다.',
    )
    if (!confirmed) return

    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/cancel', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? '구독 취소에 실패했습니다.')
        return
      }
      router.refresh()
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  async function handleChangeCard() {
    const confirmed = window.confirm(
      '결제 수단을 변경하시겠습니까?\n토스페이먼츠 결제 페이지로 이동합니다.',
    )
    if (!confirmed) return
    await handleCheckout()
  }

  if (actionType === 'checkout') {
    return (
      <div>
        <button
          onClick={handleCheckout}
          disabled={loading}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-semibold py-3 px-4 rounded-lg transition-colors text-sm"
        >
          {loading ? '처리 중...' : '구독 시작하기'}
        </button>
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </div>
    )
  }

  if (actionType === 'change-card') {
    return (
      <div>
        <button
          onClick={handleChangeCard}
          disabled={loading}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-semibold py-3 px-4 rounded-lg transition-colors text-sm"
        >
          {loading ? '처리 중...' : '결제 수단 변경'}
        </button>
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={handleCancel}
        disabled={loading}
        className="w-full bg-white hover:bg-gray-50 disabled:bg-gray-100 text-gray-700 font-medium py-3 px-4 rounded-lg border border-gray-300 transition-colors text-sm"
      >
        {loading ? '처리 중...' : '구독 해지'}
      </button>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </div>
  )
}

export function DunningCardAction() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleChangeCard() {
    const confirmed = window.confirm(
      '결제 수단을 변경하시겠습니까?\n토스페이먼츠 결제 페이지로 이동합니다.',
    )
    if (!confirmed) return

    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/checkout', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? '결제 URL 생성에 실패했습니다.')
        return
      }
      window.location.href = json.auth_url
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleChangeCard}
        disabled={loading}
        className="bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors"
      >
        {loading ? '처리 중...' : '결제 수단 변경'}
      </button>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}
