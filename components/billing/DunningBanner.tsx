'use client'

import type { Database } from '@/lib/supabase/types'

type SubscriptionStatus = Database['public']['Tables']['subscriptions']['Row']['status']

interface DunningBannerProps {
  status: SubscriptionStatus
  dunningAttempts: number
  gracePeriodUntil: string | null
  onChangeCard: () => void
}

function getDaysRemaining(isoDate: string): number {
  const now = new Date()
  const until = new Date(isoDate)
  const diffMs = until.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}

function getMessage(attempts: number, status: SubscriptionStatus): string {
  if (status === 'suspended') {
    return '결제 실패로 서비스 이용이 정지되었습니다. 결제 수단을 변경하여 구독을 재개해 주세요.'
  }
  if (attempts >= 3) {
    return '3회 결제에 실패했습니다. 지금 바로 결제 수단을 변경하지 않으면 서비스가 정지됩니다.'
  }
  if (attempts === 2) {
    return '결제가 2회 실패했습니다. 결제 수단을 확인하고 변경해 주세요.'
  }
  return '결제가 실패했습니다. 결제 수단을 변경하거나 카드 정보를 확인해 주세요.'
}

export default function DunningBanner({
  status,
  dunningAttempts,
  gracePeriodUntil,
  onChangeCard,
}: DunningBannerProps) {
  const message = getMessage(dunningAttempts, status)
  const daysRemaining = gracePeriodUntil ? getDaysRemaining(gracePeriodUntil) : null

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-5 h-5 mt-0.5">
          <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-800">{message}</p>
          {daysRemaining !== null && daysRemaining > 0 && (
            <p className="text-xs text-red-600 mt-1">
              유예 기간 남은 일수: <span className="font-semibold">{daysRemaining}일</span>
            </p>
          )}
          {daysRemaining === 0 && gracePeriodUntil && (
            <p className="text-xs text-red-600 mt-1 font-semibold">
              유예 기간이 오늘 만료됩니다.
            </p>
          )}
        </div>
        <button
          onClick={onChangeCard}
          className="flex-shrink-0 bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors"
        >
          결제 수단 변경
        </button>
      </div>
    </div>
  )
}
