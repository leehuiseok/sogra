'use client'

import type { Database } from '@/lib/supabase/types'

type MarketingContent = Database['public']['Tables']['marketing_contents']['Row']

export interface ContentCardProps {
  content: MarketingContent
  onApprove?: (contentId: string) => void
  onRegenerate?: (contentId: string) => void
}

const KIND_LABEL: Record<MarketingContent['kind'], string> = {
  poster: '포스터',
  reels: '릴스',
  caption: '캡션',
}

const STATUS_LABEL: Record<MarketingContent['status'], string> = {
  pending: '대기 중',
  generating: '생성 중...',
  ready: '완료',
  approved: '승인됨',
  failed: '실패',
}

export default function ContentCard({ content, onApprove, onRegenerate }: ContentCardProps) {
  const kindLabel = KIND_LABEL[content.kind]
  const statusLabel = STATUS_LABEL[content.status]
  const isReady = content.status === 'ready'
  const isApproved = content.status === 'approved'
  const isGenerating = content.status === 'generating'
  const isFailed = content.status === 'failed'

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-900">{kindLabel}</span>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded ${
            isReady || isApproved
              ? 'bg-green-100 text-green-700'
              : isGenerating
                ? 'bg-yellow-100 text-yellow-700'
                : isFailed
                  ? 'bg-red-100 text-red-700'
                  : 'bg-gray-100 text-gray-500'
          }`}
        >
          {statusLabel}
        </span>
      </div>

      {content.kind === 'caption' && content.caption_text && (
        <p className="text-sm text-gray-700 whitespace-pre-wrap mb-3">{content.caption_text}</p>
      )}

      {content.kind === 'poster' && (
        <div className="mb-3">
          {content.storage_url || content.external_url ? (
            <img
              src={content.storage_url ?? content.external_url ?? ''}
              alt="포스터 이미지"
              className="w-full rounded-md object-cover aspect-square"
            />
          ) : isGenerating ? (
            <div className="w-full aspect-square bg-gray-100 rounded-md flex items-center justify-center">
              <span className="text-sm text-gray-400">이미지 생성 중...</span>
            </div>
          ) : null}
        </div>
      )}

      {content.kind === 'reels' && (
        <div className="mb-3">
          {content.storage_url ? (
            <video
              src={content.storage_url}
              controls
              className="w-full rounded-md"
            />
          ) : (
            <div className="w-full aspect-video bg-gray-100 rounded-md flex items-center justify-center">
              <span className="text-sm text-gray-400">
                {isGenerating ? '영상 생성 중 (최대 3분)...' : '영상 없음'}
              </span>
            </div>
          )}
        </div>
      )}

      {isFailed && (
        <p className="text-xs text-red-500 mb-3">콘텐츠 생성에 실패했습니다.</p>
      )}

      <div className="flex gap-2">
        {(isReady) && onApprove && (
          <button
            onClick={() => onApprove(content.id)}
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold py-1.5 rounded transition-colors"
          >
            승인
          </button>
        )}
        {(isReady || isFailed) && onRegenerate && (
          <button
            onClick={() => onRegenerate(content.id)}
            className="flex-1 bg-white border border-orange-300 text-orange-500 hover:bg-orange-50 text-sm font-semibold py-1.5 rounded transition-colors"
          >
            다시 생성
          </button>
        )}
        {isApproved && (
          <span className="flex-1 text-center text-xs text-green-600 py-1.5">
            승인 완료
          </span>
        )}
      </div>
    </div>
  )
}
