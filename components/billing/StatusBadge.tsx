import type { Database } from '@/lib/supabase/types'

type SubscriptionStatus = Database['public']['Tables']['subscriptions']['Row']['status']

const STATUS_CONFIG: Record<
  SubscriptionStatus,
  { label: string; className: string }
> = {
  pending:   { label: '결제 대기',  className: 'bg-gray-100 text-gray-600' },
  active:    { label: '구독 중',    className: 'bg-green-100 text-green-700' },
  past_due:  { label: '결제 연체',  className: 'bg-yellow-100 text-yellow-700' },
  suspended: { label: '이용 정지',  className: 'bg-red-100 text-red-700' },
  cancelled: { label: '구독 취소',  className: 'bg-gray-100 text-gray-500' },
}

interface StatusBadgeProps {
  status: SubscriptionStatus
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}
