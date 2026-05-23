import type { SupabaseClient } from '@supabase/supabase-js';

type EventType = 'enter' | 'complete' | 'skip' | 'back' | 'abandon';

interface OnboardingEventParams {
  ownerId: string;
  step: string;
  eventType: EventType;
  durationMs?: number;
}

export async function trackOnboardingEvent(
  supabase: SupabaseClient,
  params: OnboardingEventParams,
): Promise<void> {
  const { ownerId, step, eventType, durationMs } = params;

  try {
    const { error } = await supabase.from('onboarding_funnel_events').insert({
      owner_id: ownerId,
      step,
      event_type: eventType,
      duration_ms: durationMs ?? null,
    });

    if (error) {
      console.error('[funnel/track] insert error:', error.message);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[funnel/track] unexpected error:', message);
  }
}
