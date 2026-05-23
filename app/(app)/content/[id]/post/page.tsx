import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PostActions from './PostActions'
import RealPublishConsentModal from './RealPublishConsentModal'
import InstagramPostCard from '@/components/content/InstagramPostCard'
import type { Database } from '@/lib/supabase/types'

type MarketingContent = Database['public']['Tables']['marketing_contents']['Row']
type InstagramPost = Database['public']['Tables']['instagram_posts']['Row']

interface PageProps {
  params: Promise<{ id: string }>
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

export default async function PostPage({ params }: PageProps) {
  const { id: triggerId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) notFound()

  const { data: store } = await supabase
    .from('store_profiles')
    .select('id, store_name, real_publish_consented_at')
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

  // 트리거에 속한 콘텐츠 — 종류별 최신 1개씩
  const { data: contents } = await supabase
    .from('marketing_contents')
    .select('*')
    .eq('trigger_id', triggerId)
    .eq('store_id', store.id)
    .order('created_at', { ascending: false })

  const contentList = contents ?? []

  const byKind: Partial<Record<MarketingContent['kind'], MarketingContent>> = {}
  for (const c of contentList) {
    if (!byKind[c.kind]) byKind[c.kind] = c
  }

  const cards: MarketingContent[] = [
    byKind['poster'],
    byKind['reels'],
    byKind['caption'],
  ].filter((c): c is MarketingContent => c !== undefined)

  // 각 콘텐츠의 최근 instagram_posts 1개씩 조회
  const contentIds = cards.map((c) => c.id)
  const { data: postRows } = contentIds.length > 0
    ? await supabase
        .from('instagram_posts')
        .select('*')
        .in('content_id', contentIds)
        .order('posted_at', { ascending: false })
    : { data: [] as InstagramPost[] }

  const postByContentId: Record<string, InstagramPost> = {}
  for (const p of postRows ?? []) {
    if (!postByContentId[p.content_id]) {
      postByContentId[p.content_id] = p
    }
  }

  // Mock→Real 전환 동의 필요 여부
  const isMockMode = process.env.MOCK_INSTAGRAM_PUBLISH === 'true'
  const needsConsent = !isMockMode && store.real_publish_consented_at === null
  const publishMode = isMockMode ? 'mock' : 'real'

  return (
    <main className="max-w-xl mx-auto p-6">
      <RealPublishConsentModal needsConsent={needsConsent} />

      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 mb-1">인스타그램 게시</h1>
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

      {isMockMode && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-6 text-xs text-yellow-800">
          현재 모의 게시 모드입니다. 영상·이미지를 다운로드한 후 인스타그램 앱에서 직접 업로드해 주세요.
        </div>
      )}

      {cards.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">생성된 콘텐츠가 없습니다.</p>
      ) : (
        <div className="space-y-4">
          {cards.map((content) => {
            const igPost = postByContentId[content.id]
            const isApproved = content.status === 'approved'

            return (
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

                {isApproved && content.kind !== 'caption' && !igPost && (
                  <PostActions
                    contentId={content.id}
                    kind={content.kind}
                    mode={publishMode}
                    storageUrl={content.storage_url}
                  />
                )}

                {!isApproved && content.kind !== 'caption' && (
                  <p className="text-xs text-gray-400 mt-2">
                    콘텐츠를 먼저 승인해야 게시할 수 있습니다.
                  </p>
                )}

                {igPost && <InstagramPostCard post={igPost} />}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
