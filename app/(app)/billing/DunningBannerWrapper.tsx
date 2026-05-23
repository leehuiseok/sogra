'use client'

import DunningBanner from '@/components/billing/DunningBanner'
import type { Database } from '@/lib/supabase/types'
import { useState } from 'react'

type SubscriptionStatus = Database['public']['Tables']['subscriptions']['Row']['status']

interface DunningBannerWrapperProps {
  status: SubscriptionStatus
  dunningAttempts: number
  gracePeriodUntil: string | null
}

export default function DunningBannerWrapper({
  status,
  dunningAttempts,
  gracePeriodUntil,
}: DunningBannerWrapperProps) {
  const [loading, setLoading] = useState(false)

  async function handleChangeCard() {
    const confirmed = window.confirm(
      '결제 수단을 변경하시겠습니까?\n토스페이먼츠 결제 페이지로 이동합니다.',
    )
    if (!confirmed) return

    setLoading(true)
    try {
      const res = await fetch('/api/billing/checkout', { method: 'POST' })
      const json = await res.json()
      if (res.ok && json.auth_url) {
        window.location.href = json.auth_url
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <DunningBanner
      status={status}
      dunningAttempts={dunningAttempts}
      gracePeriodUntil={gracePeriodUntil}
      onChangeCard={handleChangeCard}
    />
  )
}
