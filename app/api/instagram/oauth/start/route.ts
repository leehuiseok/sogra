import { type NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // 로컬/Mock 모드: 실제 Meta OAuth 없이 더미 IG 값으로 store_profiles 채우고 다음 단계로 이동
  if (process.env.MOCK_INSTAGRAM_PUBLISH === 'true') {
    const { data: existingProfile } = await supabase
      .from('store_profiles')
      .select('id, onboarding_step')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (!existingProfile) {
      return NextResponse.redirect(new URL('/onboarding/1?error=incomplete_profile', req.url))
    }

    const mockSuffix = crypto.randomBytes(4).toString('hex')
    const { error: mockError } = await supabase
      .from('store_profiles')
      .update({
        ig_user_id: `mock_ig_user_${mockSuffix}`,
        ig_username: `mock_store_${mockSuffix}`,
        ig_account_type: 'BUSINESS',
        ig_access_token: 'mock-ig-access-token',
        ig_token_expires_at: new Date(Date.now() + 60 * 86400 * 1000).toISOString(),
        ig_page_id: `mock_page_${mockSuffix}`,
        onboarding_step: Math.max(existingProfile.onboarding_step ?? 0, 3),
      })
      .eq('owner_id', user.id)

    if (mockError) {
      console.error('[IG OAuth Mock] store_profiles 업데이트 오류:', mockError)
      return NextResponse.redirect(new URL('/onboarding/3?error=mock_failed', req.url))
    }

    return NextResponse.redirect(new URL('/onboarding/4', req.url))
  }

  const META_APP_ID = process.env.META_APP_ID
  if (!META_APP_ID) {
    return NextResponse.json({ error: 'config_missing' }, { status: 500 })
  }

  const state = crypto.randomBytes(32).toString('hex')
  const cookieStore = await cookies()
  cookieStore.set('ig_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  const origin = new URL(req.url).origin
  const redirectUri = `${origin}/api/instagram/oauth/callback`
  const scope = 'instagram_basic,instagram_content_publish,instagram_manage_insights,pages_show_list,business_management'

  const url =
    `https://www.facebook.com/v21.0/dialog/oauth` +
    `?client_id=${META_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}` +
    `&scope=${scope}` +
    `&response_type=code`

  return NextResponse.redirect(url)
}
