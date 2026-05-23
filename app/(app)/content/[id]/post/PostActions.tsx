'use client'

import { useState, useTransition } from 'react'

interface PostActionsProps {
  contentId: string
  kind: 'poster' | 'reels' | 'caption'
  mode: 'mock' | 'real'
  storageUrl: string | null
}

type PostApiResponse = {
  post_id: string
  mode: 'mock' | 'real'
  publish_kind: 'feed' | 'reels' | 'stories'
  ig_media_id: string | null
  ig_permalink: string | null
  download_url?: string
  deeplink?: string
}

// 실제 게시(Real + feed): POST /api/instagram/post 호출
async function callPostApi(contentId: string): Promise<PostApiResponse> {
  const res = await fetch('/api/instagram/post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content_id: contentId }),
  })
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { message?: string }
    throw new Error(json.message ?? `게시 실패 (HTTP ${res.status})`)
  }
  return res.json() as Promise<PostApiResponse>
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

function openInstagramDeeplink() {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  if (isMobile) {
    window.location.href = 'instagram://library'
  } else {
    alert('모바일 기기에서 인스타그램 앱을 열어 다운로드한 영상을 업로드해 주세요.')
  }
}

export default function PostActions({ contentId, kind, mode, storageUrl }: PostActionsProps) {
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [postedPermalink, setPostedPermalink] = useState<string | null>(null)

  // caption은 게시 대상 아님
  if (kind === 'caption') return null

  // 하이브리드: mock 모드 or reels
  const isHybrid = mode === 'mock' || kind === 'reels'
  // 자동 게시 가능: real + poster(feed)
  const canAutoPost = mode === 'real' && kind === 'poster'

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  function handleHybridDownload() {
    if (!storageUrl) {
      showToast('error', '다운로드할 파일이 없습니다.')
      return
    }
    startTransition(async () => {
      try {
        const ext = kind === 'reels' ? 'mp4' : 'jpg'
        await downloadFile(storageUrl, `sogra-${kind}-${contentId.slice(0, 8)}.${ext}`)
        showToast('success', '다운로드가 시작되었습니다.')
      } catch (e) {
        showToast('error', e instanceof Error ? e.message : '다운로드에 실패했습니다.')
      }
    })
  }

  function handleAutoPost() {
    startTransition(async () => {
      try {
        const result = await callPostApi(contentId)
        setPostedPermalink(result.ig_permalink)
        showToast('success', '인스타그램에 게시되었습니다!')
      } catch (e) {
        showToast('error', e instanceof Error ? e.message : '게시에 실패했습니다.')
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

      {postedPermalink && (
        <a
          href={postedPermalink}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-xs text-center text-orange-600 underline"
        >
          인스타그램에서 게시물 보기
        </a>
      )}

      {isHybrid && !postedPermalink && (
        <div className="flex gap-2">
          <button
            disabled={isPending || !storageUrl}
            onClick={handleHybridDownload}
            className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-semibold py-1.5 rounded transition-colors"
          >
            {isPending ? '처리 중...' : kind === 'reels' ? '영상 다운로드' : '이미지 다운로드'}
          </button>
          <button
            disabled={isPending}
            onClick={openInstagramDeeplink}
            className="flex-1 bg-white border border-orange-300 text-orange-600 hover:bg-orange-50 text-sm font-semibold py-1.5 rounded transition-colors"
          >
            인스타 열기
          </button>
        </div>
      )}

      {canAutoPost && !postedPermalink && (
        <button
          disabled={isPending}
          onClick={handleAutoPost}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-semibold py-1.5 rounded transition-colors"
        >
          {isPending ? '게시 중...' : '인스타에 게시'}
        </button>
      )}
    </div>
  )
}
