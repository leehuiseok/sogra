import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ReelsPolling from '@/components/content/ReelsPolling'
import ContentActions from './ContentActions'
import type { Database } from '@/lib/supabase/types'

type MarketingContent = Database['public']['Tables']['marketing_contents']['Row']

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

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ContentPreviewPage({ params }: PageProps) {
  const { id: triggerId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) notFound()

  const { data: store } = await supabase
    .from('store_profiles')
    .select('id, store_name')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!store) notFound()

  const { data: trigger } = await supabase
    .from('situation_triggers')
    .select('id, event, action, when_text')
    .eq('id', triggerId)
    .eq('store_id', store.id)
    .maybeSingle()

  if (!trigger) notFound()

  const { data: contents } = await supabase
    .from('marketing_contents')
    .select('*')
    .eq('trigger_id', triggerId)
    .eq('store_id', store.id)
    .order('created_at', { ascending: true })

  const contentList = contents ?? []
  const hasGeneratingReels = contentList.some(
    (c) => c.kind === 'reels' && c.status === 'generating',
  )

  // 종류별로 가장 최신 콘텐츠 1개씩 추출
  const byKind: Partial<Record<MarketingContent['kind'], MarketingContent>> = {}
  for (const c of contentList) {
    byKind[c.kind] = c
  }

  const cards: MarketingContent[] = [
    byKind['poster'],
    byKind['reels'],
    byKind['caption'],
  ].filter((c): c is MarketingContent => c !== undefined)

  return (
    <main className="max-w-xl mx-auto p-6">
      <ReelsPolling isGenerating={hasGeneratingReels} />

      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 mb-1">콘텐츠 미리보기</h1>
        <p className="text-sm text-gray-500">{store.store_name}</p>
      </div>

      <div className="bg-orange-50 border-l-4 border-orange-400 rounded-md p-3 mb-6">
        <p className="text-xs text-gray-500 mb-0.5">상황</p>
        <p className="text-sm font-medium text-gray-800">{trigger.event}</p>
        <p className="text-xs text-gray-600 mt-1">{trigger.action}</p>
        {trigger.when_text && (
          <p className="text-xs text-gray-400 mt-0.5">{trigger.when_text}</p>
        )}
      </div>

      {cards.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          생성된 콘텐츠가 없습니다.
        </p>
      ) : (
        <div className="space-y-4">
          {cards.map((content) => (
            <div key={content.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-900">
                  {KIND_LABEL[content.kind]}
                </span>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded ${
                    content.status === 'ready' || content.status === 'approved'
                      ? 'bg-green-100 text-green-700'
                      : content.status === 'generating'
                        ? 'bg-yellow-100 text-yellow-700'
                        : content.status === 'failed'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {STATUS_LABEL[content.status]}
                </span>
              </div>

              {content.kind === 'caption' && content.caption_text && (
                <p className="text-sm text-gray-700 whitespace-pre-wrap mb-1">
                  {content.caption_text}
                </p>
              )}

              {content.kind === 'poster' && (
                <>
                  {content.storage_url || content.external_url ? (
                    <img
                      src={content.storage_url ?? content.external_url ?? ''}
                      alt="포스터 이미지"
                      className="w-full rounded-md object-cover aspect-square mb-1"
                    />
                  ) : content.status === 'generating' ? (
                    <div className="w-full aspect-square bg-gray-100 rounded-md flex items-center justify-center mb-1">
                      <span className="text-sm text-gray-400">이미지 생성 중...</span>
                    </div>
                  ) : null}
                </>
              )}

              {content.kind === 'reels' && (
                <>
                  {content.storage_url ? (
                    <video
                      src={content.storage_url}
                      controls
                      className="w-full rounded-md mb-1"
                    />
                  ) : (
                    <div className="w-full aspect-video bg-gray-100 rounded-md flex items-center justify-center mb-1">
                      <span className="text-sm text-gray-400">
                        {content.status === 'generating'
                          ? '영상 생성 중 (최대 3분)...'
                          : '영상 없음'}
                      </span>
                    </div>
                  )}
                </>
              )}

              {content.status === 'failed' && (
                <p className="text-xs text-red-500 mb-1">콘텐츠 생성에 실패했습니다.</p>
              )}

              <ContentActions
                contentId={content.id}
                kind={content.kind}
                status={content.status}
              />
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
