import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { recommendTriggers } from '@/lib/triggers/recommend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: store, error: storeError } = await supabase
    .from('store_profiles')
    .select('id, ig_access_token, ig_user_id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (storeError) {
    return NextResponse.json({ error: storeError.message }, { status: 500 })
  }

  if (!store) {
    return NextResponse.json({ error: 'no_profile' }, { status: 404 })
  }

  const recommendations = await recommendTriggers({
    city: 'Seoul',
    storeId: store.id,
    igAccessToken: store.ig_access_token ?? undefined,
    igUserId: store.ig_user_id ?? undefined,
  })

  const generatedAt = new Date().toISOString()

  if (recommendations.length > 0) {
    const rows = recommendations.map((r) => ({
      store_id: store.id,
      source: 'recommendation' as const,
      preset_key: r.presetKey,
      event: r.preset.event,
      action: r.preset.action,
      when_text: r.preset.whenText,
      signals: { score: r.score, reason: r.reason },
      score: r.score,
    }))

    await supabase.from('situation_triggers').insert(rows)
  }

  return NextResponse.json({ recommendations, generatedAt })
}
