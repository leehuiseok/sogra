// app/api/instagram/post/route.ts
// 인스타그램 게시 트리거 (Plan §Step 5 / CB-1)
// 1) 인증 → store_profiles 소유권 확인
// 2) marketing_contents.status='approved' 보장
// 3) kind에 따라 publish_kind 결정 (poster→feed, reels→reels, caption→feed 동행)
// 4) publishToInstagram(mock/real) 호출
// 5) instagram_posts insert + marketing_contents.published_at 갱신
// 6) 응답 — mock+reels는 download_url + deeplink 동봉 (사장님 수동 업로드 가이드)

import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import {
  publishToInstagram,
  InstagramPublishError,
  type PublishKind,
} from '@/lib/instagram/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const postBodySchema = z.object({
  content_id: z.string().uuid(),
})

// marketing_contents.kind → instagram_posts.publish_kind 매핑
// poster: 이미지 피드, reels: 릴스(하이브리드), caption: 단독 게시는 v1 미지원 → feed 동행
function mapPublishKind(contentKind: 'poster' | 'reels' | 'caption'): PublishKind {
  if (contentKind === 'reels') return 'reels'
  return 'feed'
}

// caption 매칭용 substring — 매처가 IG 응답의 caption과 비교 (포함 검사용 prefix 80자)
function captionSubstring(caption: string): string {
  return caption.slice(0, 80)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthorized', message: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data: store, error: storeError } = await supabase
    .from('store_profiles')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (storeError) {
    return NextResponse.json({ error: 'db_error', message: storeError.message }, { status: 500 })
  }
  if (!store) {
    return NextResponse.json(
      { error: 'no_profile', message: '매장 프로필이 없습니다 — 온보딩을 먼저 완료해 주세요.' },
      { status: 404 },
    )
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'invalid_json', message: '요청 본문이 올바른 JSON이 아닙니다.' },
      { status: 400 },
    )
  }

  const parsed = postBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', message: '요청 형식이 올바르지 않습니다.', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { content_id } = parsed.data

  // 콘텐츠 fetch — RLS로 자기 매장만 조회 가능
  const { data: content, error: contentErr } = await supabase
    .from('marketing_contents')
    .select('id, store_id, kind, status, caption_text, storage_url')
    .eq('id', content_id)
    .maybeSingle()

  if (contentErr) {
    return NextResponse.json({ error: 'db_error', message: contentErr.message }, { status: 500 })
  }
  if (!content) {
    return NextResponse.json(
      { error: 'content_not_found', message: '해당 콘텐츠를 찾을 수 없습니다.' },
      { status: 404 },
    )
  }
  if (content.store_id !== store.id) {
    return NextResponse.json(
      { error: 'forbidden', message: '다른 매장의 콘텐츠는 게시할 수 없습니다.' },
      { status: 403 },
    )
  }
  if (content.status !== 'approved') {
    return NextResponse.json(
      { error: 'not_approved', message: '승인되지 않은 콘텐츠는 게시할 수 없습니다.' },
      { status: 403 },
    )
  }

  const caption = content.caption_text ?? ''
  const publishKind = mapPublishKind(content.kind)

  let result
  try {
    result = await publishToInstagram({
      store_id: store.id,
      content_id: content.id,
      caption,
      media_storage_url: content.storage_url,
      kind: publishKind,
    })
  } catch (err) {
    if (err instanceof InstagramPublishError) {
      const status =
        err.code === 'reels_hybrid_only'
          ? 400
          : err.code === 'missing_token' || err.code === 'missing_ig_user_id'
            ? 412
            : 502
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status },
      )
    }
    return NextResponse.json(
      { error: 'publish_failed', message: '게시 처리 중 알 수 없는 오류가 발생했습니다.' },
      { status: 500 },
    )
  }

  // instagram_posts insert + published_at — service_role 사용
  // (instagram_posts.service_all RLS / marketing_contents.update_own은 사용자 클라이언트로)
  const admin = createAdminClient()

  const matchStatus: 'pending' | 'not_required' =
    result.mode === 'real' ? 'not_required' : 'pending'

  const { data: postRow, error: insertErr } = await admin
    .from('instagram_posts')
    .insert({
      store_id: store.id,
      content_id: content.id,
      mode: result.mode,
      ig_media_id: result.ig_media_id,
      ig_permalink: result.ig_permalink,
      caption_used: captionSubstring(caption),
      publish_kind: publishKind,
      match_status: matchStatus,
    })
    .select('id')
    .single()

  if (insertErr || !postRow) {
    return NextResponse.json(
      { error: 'db_insert_failed', message: insertErr?.message ?? '게시 기록 저장에 실패했습니다.' },
      { status: 500 },
    )
  }

  const { error: updateErr } = await supabase
    .from('marketing_contents')
    .update({ published_at: new Date().toISOString() })
    .eq('id', content.id)

  if (updateErr) {
    return NextResponse.json(
      { error: 'db_update_failed', message: updateErr.message },
      { status: 500 },
    )
  }

  // 하이브리드(Mock + reels) 응답: 사장님이 다운로드 → IG 앱에서 직접 업로드
  const isHybridDownload = result.mode === 'mock' && publishKind === 'reels'

  return NextResponse.json({
    post_id: postRow.id,
    mode: result.mode,
    publish_kind: publishKind,
    ig_media_id: result.ig_media_id,
    ig_permalink: result.ig_permalink,
    ...(isHybridDownload
      ? {
          download_url: content.storage_url,
          deeplink: 'instagram://library',
        }
      : {}),
  })
}
