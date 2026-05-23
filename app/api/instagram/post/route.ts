import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  return NextResponse.json(
    {
      error: 'instagram_publish_disabled',
      message: '인스타그램 자동 게시는 현재 비활성화되어 있습니다. 최종 산출물을 다운로드하거나 캡션을 복사해 직접 업로드해 주세요.',
    },
    { status: 410 },
  )
}
