'use client'

import type { Database } from '@/lib/supabase/types'

type InstagramPost = Database['public']['Tables']['instagram_posts']['Row']

interface InstagramPostCardProps {
  post: InstagramPost
}

const MODE_LABEL: Record<InstagramPost['mode'], string> = {
  mock: '모의 게시',
  real: '자동 게시',
}

const MATCH_STATUS_LABEL: Record<InstagramPost['match_status'], string> = {
  pending: '사후 매칭 중',
  matched: '매칭 완료',
  unmatched: '매칭 실패',
  not_required: '-',
}

export default function InstagramPostCard({ post }: InstagramPostCardProps) {
  const postedAt = new Date(post.posted_at).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded">
          게시 완료
        </span>
        <span className="text-xs text-gray-400">{MODE_LABEL[post.mode]}</span>
      </div>

      <p className="text-xs text-gray-500 mb-1">{postedAt}</p>

      {post.ig_permalink ? (
        <a
          href={post.ig_permalink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-orange-600 underline hover:text-orange-700"
        >
          인스타그램에서 보기
        </a>
      ) : (
        <p className="text-xs text-gray-400">
          {post.match_status === 'pending'
            ? '게시물 링크 매칭 중...'
            : post.match_status === 'unmatched'
              ? '게시물 링크를 찾지 못했습니다.'
              : '링크 없음'}
        </p>
      )}

      {post.mode === 'mock' && post.match_status !== 'not_required' && (
        <p className="text-xs text-gray-400 mt-1">
          매칭 상태: {MATCH_STATUS_LABEL[post.match_status]}
        </p>
      )}
    </div>
  )
}
