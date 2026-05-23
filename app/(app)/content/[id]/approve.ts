'use server'

import { createClient } from '@/lib/supabase/server'

export async function approveContent(contentId: string): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('인증이 필요합니다.')
  }

  const { data: store } = await supabase
    .from('store_profiles')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!store) {
    throw new Error('매장 프로필이 없습니다.')
  }

  const { error } = await supabase
    .from('marketing_contents')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
    })
    .eq('id', contentId)
    .eq('store_id', store.id)

  if (error) {
    throw new Error(`승인 실패: ${error.message}`)
  }
}

// 재생성은 추후 구현 예정
export async function regenerateContent(_contentId: string): Promise<void> {
  throw new Error('재생성 기능은 준비 중입니다.')
}
