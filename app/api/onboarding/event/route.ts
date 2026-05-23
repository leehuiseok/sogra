import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { trackOnboardingEvent } from '@/lib/funnel/track'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  step: z.number().int().min(1).max(5),
  eventType: z.enum(['enter', 'complete', 'skip', 'back', 'abandon']),
  durationMs: z.number().optional(),
})

export async function POST(req: NextRequest) {
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

  const parsed = bodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_error', details: parsed.error.flatten() }, { status: 400 })
  }

  const { step, eventType, durationMs } = parsed.data

  await trackOnboardingEvent(supabase, {
    ownerId: user.id,
    step: String(step),
    eventType,
    durationMs,
  })

  return NextResponse.json({ ok: true })
}
