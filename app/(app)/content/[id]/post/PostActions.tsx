'use client'

import { useState, useTransition } from 'react'

interface PostActionsProps {
  contentId: string
  kind: 'poster' | 'reels' | 'caption'
  assetUrl: string | null
  captionText?: string | null
}

// storage_url → blob → a.download 다운로드
async function downloadFile(url: string, filename: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('파일 다운로드에 실패했습니다.')
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(objectUrl)
}

export default function PostActions({ contentId, kind, assetUrl, captionText }: PostActionsProps) {
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  function handleDownload() {
    if (!assetUrl) {
      showToast('error', '다운로드할 파일이 없습니다.')
      return
    }
    startTransition(async () => {
      try {
        const ext = kind === 'reels' ? 'mp4' : 'jpg'
        await downloadFile(assetUrl, `sogra-${kind}-${contentId.slice(0, 8)}.${ext}`)
        showToast('success', '다운로드가 시작되었습니다.')
      } catch (e) {
        showToast('error', e instanceof Error ? e.message : '다운로드에 실패했습니다.')
      }
    })
  }

  function handleCopyCaption() {
    if (!captionText?.trim()) {
      showToast('error', '복사할 캡션이 없습니다.')
      return
    }

    startTransition(async () => {
      try {
        await navigator.clipboard.writeText(captionText)
        showToast('success', '캡션을 복사했습니다.')
      } catch (e) {
        showToast('error', e instanceof Error ? e.message : '캡션 복사에 실패했습니다.')
      }
    })
  }

  return (
    <div className="mt-3 space-y-2">
      {toast && (
        <div
          className={`text-xs px-3 py-2 rounded-md ${
            toast.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {toast.message}
        </div>
      )}

      {kind === 'caption' ? (
        <button
          disabled={isPending || !captionText}
          onClick={handleCopyCaption}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-semibold py-1.5 rounded transition-colors"
        >
          {isPending ? '처리 중...' : '캡션 복사'}
        </button>
      ) : (
        <button
          disabled={isPending || !assetUrl}
          onClick={handleDownload}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-semibold py-1.5 rounded transition-colors"
        >
          {isPending ? '처리 중...' : kind === 'reels' ? '영상 다운로드' : '이미지 다운로드'}
        </button>
      )}
    </div>
  )
}
