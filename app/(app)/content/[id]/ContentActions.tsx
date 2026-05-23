'use client'

import { useTransition } from 'react'
import { approveContent, regenerateContent } from './approve'

interface ContentActionsProps {
  contentId: string
  kind: 'poster' | 'reels' | 'caption'
  status: 'pending' | 'generating' | 'ready' | 'approved' | 'failed'
}

export default function ContentActions({ contentId, status }: ContentActionsProps) {
  const [isPending, startTransition] = useTransition()

  const isReady = status === 'ready'
  const isFailed = status === 'failed'

  if (!isReady && !isFailed) return null

  return (
    <div className="flex gap-2 mt-3">
      {isReady && (
        <button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await approveContent(contentId)
            })
          }
          className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-semibold py-1.5 rounded transition-colors"
        >
          {isPending ? '처리 중...' : '승인'}
        </button>
      )}
      {(isReady || isFailed) && (
        <button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              try {
                await regenerateContent(contentId)
              } catch {
                alert('재생성 기능은 준비 중입니다.')
              }
            })
          }
          className="flex-1 bg-white border border-orange-300 text-orange-500 hover:bg-orange-50 disabled:opacity-50 text-sm font-semibold py-1.5 rounded transition-colors"
        >
          다시 생성
        </button>
      )}
    </div>
  )
}
