'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function consentToRealPublish(): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('인증이 필요합니다.')
  }

  const { error } = await supabase
    .from('store_profiles')
    .update({ real_publish_consented_at: new Date().toISOString() })
    .eq('owner_id', user.id)

  if (error) {
    throw new Error(`동의 처리 실패: ${error.message}`)
  }

  revalidatePath('/content', 'layout')
}
