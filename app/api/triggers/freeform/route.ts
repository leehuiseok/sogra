import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parseFreeformUtterance } from '@/lib/triggers/nlu-parse'
import {
  getNluConfidenceThreshold,
  shouldRequestConfirmation,
} from '@/lib/triggers/confidence-calibration'
import type { Json } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const postBodySchema = z.object({
  input: z.string().min(1).max(500),
})

const patchBodySchema = z.object({
  nluEventId: z.string().uuid(),
  userAction: z.enum(['confirm', 'edit', 'reject']),
  correctedOutput: z
    .object({
      event: z.string(),
      action: z.string(),
      when: z.string(),
      target: z.string().nullable(),
    })
    .optional(),
})

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: store, error: storeError } = await supabase
    .from('store_profiles')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (storeError) {
    return NextResponse.json({ error: storeError.message }, { status: 500 })
  }

  if (!store) {
    return NextResponse.json({ error: 'no_profile' }, { status: 404 })
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = postBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { input } = parsed.data
  const threshold = getNluConfidenceThreshold()

  let nluResult: Awaited<ReturnType<typeof parseFreeformUtterance>>
  try {
    nluResult = await parseFreeformUtterance(input)
  } catch {
    return NextResponse.json({ error: 'nlu_failed' }, { status: 500 })
  }

  const { data: eventRow, error: insertError } = await supabase
    .from('nlu_parse_events')
    .insert({
      store_id: store.id,
      input_text: input,
      parsed_output: nluResult as unknown as Json,
      confidence: nluResult.confidence,
      threshold_applied: threshold,
      user_action: null,
      model: 'claude-haiku-4-5-20251001',
    })
    .select('id')
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const needsConfirmation = shouldRequestConfirmation(nluResult.confidence)

  // Defect #1: 신뢰도 높으면 자동 확정 — user_action + situation_triggers 즉시 기록
  if (!needsConfirmation) {
    await supabase
      .from('nlu_parse_events')
      .update({ user_action: 'confirm' })
      .eq('id', eventRow.id)

    await supabase.from('situation_triggers').insert({
      store_id: store.id,
      source: 'freeform' as const,
      preset_key: null,
      event: nluResult.event,
      action: nluResult.action,
      when_text: nluResult.when,
      target: nluResult.target,
      signals: { confidence: nluResult.confidence } as Json,
      score: null,
    })
  }

  return NextResponse.json({
    parsed: nluResult,
    needsConfirmation,
    nluEventId: eventRow.id,
  })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: store, error: storeError } = await supabase
    .from('store_profiles')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (storeError) {
    return NextResponse.json({ error: storeError.message }, { status: 500 })
  }

  if (!store) {
    return NextResponse.json({ error: 'no_profile' }, { status: 404 })
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = patchBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { nluEventId, userAction, correctedOutput } = parsed.data

  const { error: updateError } = await supabase
    .from('nlu_parse_events')
    .update({ user_action: userAction })
    .eq('id', nluEventId)
    .eq('store_id', store.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Defect #2: confirm 시 correctedOutput 없어도 parsed_output fallback으로 INSERT
  if (userAction === 'confirm' || userAction === 'edit') {
    type OutputShape = { event: string; action: string; when: string; target: string | null }
    let output: OutputShape | undefined = correctedOutput

    if (!output) {
      const { data: event } = await supabase
        .from('nlu_parse_events')
        .select('parsed_output')
        .eq('id', nluEventId)
        .eq('store_id', store.id)
        .single()

      if (event?.parsed_output) {
        output = event.parsed_output as OutputShape
      }
    }

    if (output) {
      await supabase.from('situation_triggers').insert({
        store_id: store.id,
        source: 'freeform' as const,
        preset_key: null,
        event: output.event,
        action: output.action,
        when_text: output.when,
        target: output.target,
        signals: {} as Json,
        score: null,
      })
    }
  }

  return NextResponse.json({ ok: true })
}
