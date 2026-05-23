import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: store } = await supabase
    .from('store_profiles')
    .select('onboarding_completed_at')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!store?.onboarding_completed_at) {
    redirect('/onboarding/1')
  }

  return <>{children}</>
}
