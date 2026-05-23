'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface ReelsPollingProps {
  isGenerating: boolean
}

// 릴스가 generating 상태일 때 7초마다 페이지를 새로고침하여 상태를 동기화
export default function ReelsPolling({ isGenerating }: ReelsPollingProps) {
  const router = useRouter()

  useEffect(() => {
    if (!isGenerating) return

    const interval = setInterval(() => {
      router.refresh()
    }, 7000)

    return () => clearInterval(interval)
  }, [isGenerating, router])

  return null
}
