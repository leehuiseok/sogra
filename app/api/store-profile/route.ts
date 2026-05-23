import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { TablesUpdate } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const eventSchema = z.object({
  eventType: z.enum(['enter', 'complete', 'skip', 'back', 'abandon']),
  durationMs: z.number().optional(),
})

const step1Schema = z.object({
  step: z.literal(1),
  category: z.string().min(1),
  overseasTransferConsent: z.literal(true),
  events: z.array(eventSchema).optional(),
})

const step2Schema = z.object({
  step: z.literal(2),
  storeName: z.string().min(1),
  address: z.string().min(1),
  addressDetail: z.string().optional(),
  events: z.array(eventSchema).optional(),
})

const step4Schema = z.object({
  step: z.literal(4),
  menus: z.array(
    z.object({
      name: z.string().min(1),
      desc: z.string().optional(),
      price: z.number().optional(),
    })
  ).min(1).max(3),
  events: z.array(eventSchema).optional(),
})

const step5Schema = z.object({
  step: z.literal(5),
  toneKeywords: z.array(z.string()).length(3),
  events: z.array(eventSchema).optional(),
})

const patchBodySchema = z.discriminatedUnion('step', [
  step1Schema,
  step2Schema,
  step4Schema,
  step5Schema,
])

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: profile, error } = await supabase
    .from('store_profiles')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!profile) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  return NextResponse.json(profile)
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = patchBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_error', details: parsed.error.flatten() }, { status: 400 })
  }

  const body = parsed.data

  const { data: existingProfile, error: fetchError } = await supabase
    .from('store_profiles')
    .select('id, onboarding_step')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const now = new Date().toISOString()
  let profile

  if (!existingProfile) {
    if (body.step !== 1) {
      return NextResponse.json({ error: 'incomplete_profile' }, { status: 400 })
    }

    const { data: inserted, error: insertError } = await supabase
      .from('store_profiles')
      .insert({
        owner_id: user.id,
        category: body.category,
        // Step 2에서 덮어쓰기 전 임시 placeholder. DB CHECK(char_length>=1) 충족용.
        store_name: '_pending_',
        address: '_pending_',
        overseas_transfer_consented_at: body.overseasTransferConsent ? now : null,
        onboarding_step: 1,
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    profile = inserted
  } else {
    const currentStep = existingProfile.onboarding_step ?? 0
    const newStep = Math.max(currentStep, body.step)

    const updateData: TablesUpdate<'store_profiles'> = { onboarding_step: newStep }

    if (body.step === 1) {
      updateData.category = body.category
      updateData.overseas_transfer_consented_at = body.overseasTransferConsent ? now : null
    } else if (body.step === 2) {
      updateData.store_name = body.storeName
      updateData.address = body.address
      updateData.address_detail = body.addressDetail ?? null
    } else if (body.step === 4) {
      updateData.menus = body.menus
    } else if (body.step === 5) {
      updateData.tone_keywords = body.toneKeywords
      updateData.onboarding_completed_at = now
    }

    const { data: updated, error: updateError } = await supabase
      .from('store_profiles')
      .update(updateData)
      .eq('owner_id', user.id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    profile = updated
  }

  if (body.events && body.events.length > 0) {
    const rows = body.events.map((e) => ({
      owner_id: user.id,
      step: body.step,
      event_type: e.eventType,
      duration_ms: e.durationMs ?? null,
    }))
    const { error: eventError } = await supabase.from('onboarding_funnel_events').insert(rows)
    if (eventError) {
      console.error('[store-profile PATCH] 이벤트 INSERT 실패:', eventError)
    }
  }

  return NextResponse.json({ ok: true, profile })
}
