import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Database } from '@/lib/supabase/types'
import StatusBadge from '@/components/billing/StatusBadge'
import PlanCard from './PlanCard'
import DunningBannerWrapper from './DunningBannerWrapper'

type SubscriptionRow = Database['public']['Tables']['subscriptions']['Row']

const KST_FORMATTER = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

function formatKST(isoDate: string | null): string | null {
  if (!isoDate) return null
  return KST_FORMATTER.format(new Date(isoDate))
}

function hasDunning(sub: SubscriptionRow): boolean {
  return sub.status === 'past_due' || sub.status === 'suspended'
}

export default async function BillingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle()

  const showDunning = sub !== null && hasDunning(sub)

  return (
    <main className="max-w-xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 mb-1">구독 관리</h1>
        <p className="text-sm text-gray-500">소그라 플랜 결제 및 구독 현황</p>
      </div>

      {showDunning && sub && (
        <DunningBannerWrapper
          status={sub.status}
          dunningAttempts={0}
          gracePeriodUntil={sub.grace_period_until}
        />
      )}

      {sub && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">현재 구독 상태</h2>
            <StatusBadge status={sub.status} />
          </div>

          <dl className="space-y-3">
            {sub.next_billing_at && (
              <div className="flex justify-between items-center">
                <dt className="text-sm text-gray-500">다음 결제일</dt>
                <dd className="text-sm font-medium text-gray-900">
                  {formatKST(sub.next_billing_at)}
                </dd>
              </div>
            )}

            {sub.current_period_end && (
              <div className="flex justify-between items-center">
                <dt className="text-sm text-gray-500">현재 구독 기간 종료</dt>
                <dd className="text-sm font-medium text-gray-900">
                  {formatKST(sub.current_period_end)}
                </dd>
              </div>
            )}

            {sub.cancelled_at && (
              <div className="flex justify-between items-center">
                <dt className="text-sm text-gray-500">해지일</dt>
                <dd className="text-sm font-medium text-gray-900">
                  {formatKST(sub.cancelled_at)}
                </dd>
              </div>
            )}

            <div className="flex justify-between items-center">
              <dt className="text-sm text-gray-500">결제 수단</dt>
              <dd className="text-sm font-medium text-gray-900">
                {sub.toss_billing_key ? '카드 등록됨' : '미등록'}
              </dd>
            </div>
          </dl>
        </div>
      )}

      <div className="mb-4">
        <PlanCard />
      </div>

      {/* v1 베타 — 결제 기능은 정식 출시 후 활성화됩니다. */}
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
        <p className="text-sm font-semibold text-orange-700 mb-1">결제 준비 중</p>
        <p className="text-sm text-orange-600 leading-relaxed">
          베타 기간 동안 소그라를 무료로 이용하실 수 있어요. 정식 출시 후 신용카드·계좌이체 결제가 활성화되며, 미리 안내해 드릴게요.
        </p>
      </div>
    </main>
  )
}
