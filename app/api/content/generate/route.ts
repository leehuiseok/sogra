import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { buildContentBrief } from '@/lib/prompts/content-brief'
import { getTextProvider } from '@/lib/ai/text-provider'
import { getImageProvider } from '@/lib/ai/image-provider'
import { checkAndDecrementQuota } from '@/lib/quota/check-and-decrement'
import { inngest } from '@/inngest/client'
import type { VideoGenerateEventData } from '@/inngest/functions/generate-video'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  trigger_id: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: '유효성 검사 오류', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { trigger_id } = parsed.data

  // store_profiles + situation_triggers 조회 (RLS로 소유권 검증)
  const { data: store, error: storeError } = await supabase
    .from('store_profiles')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (storeError) {
    return NextResponse.json({ error: storeError.message }, { status: 500 })
  }
  if (!store) {
    return NextResponse.json({ error: '매장 프로필이 없습니다.' }, { status: 404 })
  }

  const { data: trigger, error: triggerError } = await supabase
    .from('situation_triggers')
    .select('*')
    .eq('id', trigger_id)
    .eq('store_id', store.id)
    .maybeSingle()

  if (triggerError) {
    return NextResponse.json({ error: triggerError.message }, { status: 500 })
  }
  if (!trigger) {
    return NextResponse.json({ error: '트리거를 찾을 수 없습니다.' }, { status: 404 })
  }

  // ContentBrief 3종 빌드
  const posterBrief = buildContentBrief({
    storeProfile: store,
    trigger,
    targetFormat: 'poster',
  })
  const reelsBrief = buildContentBrief({
    storeProfile: store,
    trigger,
    targetFormat: 'reels',
  })
  const captionBrief = buildContentBrief({
    storeProfile: store,
    trigger,
    targetFormat: 'caption',
  })

  // 할당량 확인 (poster + reels) — admin client 사용
  const admin = createAdminClient()
  const [posterQuota, reelsQuota] = await Promise.all([
    checkAndDecrementQuota(store.id, 'poster', admin),
    checkAndDecrementQuota(store.id, 'reels', admin),
  ])

  const posterBlocked = !posterQuota.allowed
  const reelsBlocked = !reelsQuota.allowed

  if (posterBlocked && reelsBlocked) {
    return NextResponse.json(
      {
        error: '이번 달 포스터와 릴스 생성 한도를 모두 초과했습니다. 다음 달에 다시 시도해 주세요.',
        blocked_kinds: ['poster', 'reels'],
      },
      { status: 403 },
    )
  }

  type ContentResult =
    | { id: string; text: string }
    | { id: string; storage_url: string | null; external_url?: string }
    | { id: string; status: string }
    | null

  let captionResult: { id: string; text: string } | null = null
  let posterResult: { id: string; storage_url: string | null; external_url?: string } | null = null
  let reelsResult: { id: string; status: string } | null = null

  // caption 생성 (할당량 불필요)
  try {
    const textResult = await getTextProvider().generate(captionBrief)

    const { data: captionRow, error: captionInsertErr } = await admin
      .from('marketing_contents')
      .insert({
        store_id: store.id,
        trigger_id,
        kind: 'caption',
        status: 'ready',
        caption_text: textResult.text,
        model_used: textResult.modelUsed,
        cost_usd: textResult.cost_usd,
      })
      .select('id')
      .single()

    if (captionInsertErr || !captionRow) {
      throw new Error(captionInsertErr?.message ?? 'caption insert 실패')
    }

    captionResult = { id: captionRow.id, text: textResult.text }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // 캡션 실패는 non-fatal: failed 행 기록
    console.error('[content/generate] caption 생성 실패:', msg)
    await admin
      .from('marketing_contents')
      .insert({
        store_id: store.id,
        trigger_id,
        kind: 'caption',
        status: 'failed',
      })
      .select('id')
      .maybeSingle()
  }

  // poster 생성 (할당량 통과 시)
  if (!posterBlocked) {
    try {
      const imageProvider = getImageProvider()
      const imgResult = await imageProvider.generate(posterBrief)

      // Gemini 는 base64 data URL 을 반환 → DB column 에는 저장하지 않는다.
      const isDataUrl = imgResult.external_url.startsWith('data:')

      // 포스터 행을 먼저 삽입하여 content_id 확보
      const { data: posterRow, error: posterInsertErr } = await admin
        .from('marketing_contents')
        .insert({
          store_id: store.id,
          trigger_id,
          kind: 'poster',
          status: 'generating',
          model_used: imgResult.modelUsed,
          cost_usd: imgResult.cost_usd,
          external_url: isDataUrl ? null : imgResult.external_url,
        })
        .select('id')
        .single()

      if (posterInsertErr || !posterRow) {
        throw new Error(posterInsertErr?.message ?? 'poster insert 실패')
      }

      // MOCK 모드에서는 placehold.co URL이므로 persistToStorage 시도, 실패 시 external_url만 보존
      let storageUrl: string | null = null
      try {
        const persisted = await imageProvider.persistToStorage({
          external_url: imgResult.external_url,
          store_id: store.id,
          content_id: posterRow.id,
          kind: 'poster',
        })
        storageUrl = persisted.storage_url

        await admin
          .from('marketing_contents')
          .update({
            status: 'ready',
            storage_url: storageUrl,
          })
          .eq('id', posterRow.id)
      } catch {
        // TODO: MOCK 모드에서 placehold.co fetch 실패 시 external_url만 유지
        await admin
          .from('marketing_contents')
          .update({ status: 'ready' })
          .eq('id', posterRow.id)
      }

      posterResult = {
        id: posterRow.id,
        storage_url: storageUrl,
        external_url: isDataUrl ? '' : imgResult.external_url,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[content/generate] poster 생성 실패:', msg)
      await admin
        .from('marketing_contents')
        .insert({
          store_id: store.id,
          trigger_id,
          kind: 'poster',
          status: 'failed',
        })
        .select('id')
        .maybeSingle()
    }
  }

  // reels: placeholder 행 삽입 후 Inngest 잡 emit
  if (!reelsBlocked) {
    try {
      const { data: reelsRow, error: reelsInsertErr } = await admin
        .from('marketing_contents')
        .insert({
          store_id: store.id,
          trigger_id,
          kind: 'reels',
          status: 'generating',
        })
        .select('id')
        .single()

      if (reelsInsertErr || !reelsRow) {
        throw new Error(reelsInsertErr?.message ?? 'reels insert 실패')
      }

      await inngest.send({
        name: 'content/video.generate',
        data: {
          store_id: store.id,
          trigger_id,
          content_id: reelsRow.id,
          brief: reelsBrief,
        } satisfies VideoGenerateEventData,
      })

      reelsResult = { id: reelsRow.id, status: 'generating' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[content/generate] reels 생성 실패:', msg)
    }
  }

  return NextResponse.json({
    caption: captionResult,
    poster: posterResult,
    reels: reelsResult,
    quota_remaining: {
      poster: posterBlocked ? 0 : (posterQuota.remaining ?? null),
      reels: reelsBlocked ? 0 : (reelsQuota.remaining ?? null),
    },
  })
}
