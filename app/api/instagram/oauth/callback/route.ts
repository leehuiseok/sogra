import { type NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { validateBusinessAccount } from '@/lib/instagram/validate-business-account'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // 길이가 다를 경우 패딩하여 상수 시간 비교
    const longer = a.length > b.length ? a : b
    const bufA = Buffer.from(a.padEnd(longer.length, '\0'))
    const bufB = Buffer.from(b.padEnd(longer.length, '\0'))
    crypto.timingSafeEqual(bufA, bufB)
    return false
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export async function GET(req: NextRequest) {
  const META_APP_ID = process.env.META_APP_ID
  const META_APP_SECRET = process.env.META_APP_SECRET

  if (!META_APP_ID || !META_APP_SECRET) {
    return NextResponse.json({ error: 'config_missing' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const queryState = searchParams.get('state')

  const cookieStore = await cookies()
  const storedState = cookieStore.get('ig_oauth_state')?.value

  // CSRF 검증
  if (!storedState || !queryState || !timingSafeStringEqual(storedState, queryState)) {
    return NextResponse.redirect(new URL('/onboarding/3?error=csrf', req.url))
  }

  // state 쿠키 삭제
  cookieStore.set('ig_oauth_state', '', { maxAge: 0, path: '/' })

  if (!code) {
    return NextResponse.redirect(new URL('/onboarding/3?error=meta_api', req.url))
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const origin = new URL(req.url).origin
  const redirectUri = `${origin}/api/instagram/oauth/callback`

  // 단기 토큰 교환
  const shortTokenUrl =
    `https://graph.facebook.com/v21.0/oauth/access_token` +
    `?client_id=${META_APP_ID}` +
    `&client_secret=${META_APP_SECRET}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&code=${code}`

  let shortLivedToken: string
  try {
    const shortRes = await fetch(shortTokenUrl)
    if (!shortRes.ok) {
      console.error('[IG OAuth] 단기 토큰 교환 실패:', await shortRes.text())
      return NextResponse.redirect(new URL('/onboarding/3?error=meta_api', req.url))
    }
    const shortData = (await shortRes.json()) as { access_token?: string; error?: unknown }
    if (!shortData.access_token) {
      console.error('[IG OAuth] 단기 토큰 누락:', shortData.error)
      return NextResponse.redirect(new URL('/onboarding/3?error=meta_api', req.url))
    }
    shortLivedToken = shortData.access_token
  } catch (err) {
    console.error('[IG OAuth] 단기 토큰 fetch 오류:', err)
    return NextResponse.redirect(new URL('/onboarding/3?error=meta_api', req.url))
  }

  // 장기 토큰 교환 (60일)
  const longTokenUrl =
    `https://graph.facebook.com/v21.0/oauth/access_token` +
    `?grant_type=fb_exchange_token` +
    `&client_id=${META_APP_ID}` +
    `&client_secret=${META_APP_SECRET}` +
    `&fb_exchange_token=${shortLivedToken}`

  let longLivedToken: string
  try {
    const longRes = await fetch(longTokenUrl)
    if (!longRes.ok) {
      console.error('[IG OAuth] 장기 토큰 교환 실패:', await longRes.text())
      return NextResponse.redirect(new URL('/onboarding/3?error=meta_api', req.url))
    }
    const longData = (await longRes.json()) as { access_token?: string; error?: unknown }
    if (!longData.access_token) {
      console.error('[IG OAuth] 장기 토큰 누락:', longData.error)
      return NextResponse.redirect(new URL('/onboarding/3?error=meta_api', req.url))
    }
    longLivedToken = longData.access_token
  } catch (err) {
    console.error('[IG OAuth] 장기 토큰 fetch 오류:', err)
    return NextResponse.redirect(new URL('/onboarding/3?error=meta_api', req.url))
  }

  // Facebook 페이지 목록 조회
  let igUserId: string
  let igPageId: string
  try {
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,instagram_business_account&access_token=${longLivedToken}`
    )
    if (!pagesRes.ok) {
      console.error('[IG OAuth] 페이지 조회 실패:', await pagesRes.text())
      return NextResponse.redirect(new URL('/onboarding/3?error=meta_api', req.url))
    }
    const pagesData = (await pagesRes.json()) as {
      data?: Array<{ id: string; name: string; instagram_business_account?: { id: string } }>
      error?: unknown
    }
    if (!pagesData.data) {
      console.error('[IG OAuth] 페이지 데이터 누락:', pagesData.error)
      return NextResponse.redirect(new URL('/onboarding/3?error=meta_api', req.url))
    }

    const pageWithIG = pagesData.data.find((p) => p.instagram_business_account?.id)
    if (!pageWithIG || !pageWithIG.instagram_business_account?.id) {
      return NextResponse.redirect(new URL('/onboarding/3?error=no_facebook_page', req.url))
    }

    igUserId = pageWithIG.instagram_business_account.id
    igPageId = pageWithIG.id
  } catch (err) {
    console.error('[IG OAuth] 페이지 fetch 오류:', err)
    return NextResponse.redirect(new URL('/onboarding/3?error=meta_api', req.url))
  }

  // 비즈니스 계정 검증
  const result = await validateBusinessAccount(igUserId, longLivedToken)
  if (!result.valid) {
    return NextResponse.redirect(new URL(`/onboarding/3?error=${result.reason}`, req.url))
  }

  // 기존 프로필 확인
  const { data: existingProfile } = await supabase
    .from('store_profiles')
    .select('id, onboarding_step')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!existingProfile) {
    // Step 1+2 미완료 — INSERT 불가 (NOT NULL 필드 없음)
    return NextResponse.redirect(new URL('/onboarding/1?error=incomplete_profile', req.url))
  }

  const igTokenExpiresAt = new Date(Date.now() + 60 * 86400 * 1000).toISOString()
  const newOnboardingStep = Math.max(existingProfile.onboarding_step ?? 0, 3)

  const { error: updateError } = await supabase
    .from('store_profiles')
    .update({
      ig_user_id: result.igUserId,
      ig_username: result.username,
      ig_account_type: result.accountType,
      ig_access_token: longLivedToken,
      ig_token_expires_at: igTokenExpiresAt,
      ig_page_id: igPageId,
      onboarding_step: newOnboardingStep,
    })
    .eq('owner_id', user.id)

  if (updateError) {
    console.error('[IG OAuth] store_profiles 업데이트 오류:', updateError)
    return NextResponse.redirect(new URL('/onboarding/3?error=meta_api', req.url))
  }

  return NextResponse.redirect(new URL('/onboarding/4', req.url))
}
