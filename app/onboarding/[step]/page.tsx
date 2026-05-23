'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import ProgressBar from '@/components/onboarding/ProgressBar'
import CategorySelect from '@/components/onboarding/CategorySelect'
import OverseasConsentCheckbox from '@/components/onboarding/OverseasConsentCheckbox'
import StoreInfoForm, { type StoreInfoValue } from '@/components/onboarding/StoreInfoForm'
import MenuForm, { type MenuItem } from '@/components/onboarding/MenuForm'
import ToneForm from '@/components/onboarding/ToneForm'

const ERROR_MESSAGES: Record<string, string> = {
  csrf: 'CSRF 검증에 실패했습니다. 다시 시도해 주세요.',
  personal_account: '인스타그램 개인 계정은 연결할 수 없습니다. 앱 설정에서 비즈니스 또는 크리에이터 계정으로 전환해 주세요.',
  no_facebook_page: '연결된 페이스북 페이지가 없습니다. 인스타그램 앱에서 페이스북 페이지를 연결해 주세요.',
  api_error: '인스타그램 API 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
  meta_api: '메타 API 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
  incomplete_profile: '먼저 기본 정보(1~2단계)를 입력해 주세요.',
}

type StoreProfile = {
  category?: string
  store_name?: string
  address?: string
  address_detail?: string | null
  menus?: MenuItem[]
  tone_keywords?: string[]
  ig_user_id?: string | null
  ig_username?: string | null
  onboarding_step?: number | null
}

export default function OnboardingStepPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const stepStr = params.step as string
  const currentStep = parseInt(stepStr, 10)

  const [profile, setProfile] = useState<StoreProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const errorCode = searchParams.get('error')

  // Step 1
  const [category, setCategory] = useState('')
  const [overseasConsent, setOverseasConsent] = useState(false)

  // Step 2
  const [storeInfo, setStoreInfo] = useState<StoreInfoValue>({ storeName: '', address: '', addressDetail: '' })

  // Step 4
  const [menus, setMenus] = useState<MenuItem[]>([])

  // Step 5
  const [toneKeywords, setToneKeywords] = useState<string[]>([])

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const res = await fetch('/api/store-profile')
      if (res.ok) {
        const data = (await res.json()) as StoreProfile
        setProfile(data)
        setCategory(data.category ?? '')
        setStoreInfo({
          storeName: data.store_name ?? '',
          address: data.address ?? '',
          addressDetail: data.address_detail ?? '',
        })
        setMenus((data.menus as MenuItem[]) ?? [])
        setToneKeywords((data.tone_keywords as string[]) ?? [])
      } else if (res.status === 404) {
        setProfile({})
      }

      fetch('/api/onboarding/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: currentStep, eventType: 'enter' }),
      }).catch(() => {})

      setLoading(false)
    }

    void init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep])

  async function handleSubmit(step: number, nextPath: string) {
    setSubmitting(true)
    const completeTime = Date.now()

    let body: Record<string, unknown>

    if (step === 1) {
      body = { step: 1, category, overseasTransferConsent: true, events: [{ eventType: 'complete' }] }
    } else if (step === 2) {
      body = {
        step: 2,
        storeName: storeInfo.storeName,
        address: storeInfo.address,
        addressDetail: storeInfo.addressDetail || undefined,
        events: [{ eventType: 'complete', durationMs: completeTime }],
      }
    } else if (step === 4) {
      body = { step: 4, menus, events: [{ eventType: 'complete' }] }
    } else if (step === 5) {
      body = { step: 5, toneKeywords, events: [{ eventType: 'complete' }] }
    } else {
      setSubmitting(false)
      router.push(nextPath)
      return
    }

    const res = await fetch('/api/store-profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    setSubmitting(false)

    if (res.ok) {
      router.push(nextPath)
    } else {
      const data = (await res.json()) as { error?: string }
      alert(data.error ?? '오류가 발생했습니다.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 text-sm">불러오는 중...</p>
      </div>
    )
  }

  if (isNaN(currentStep) || currentStep < 1 || currentStep > 5) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">잘못된 단계입니다.</p>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-md">
        <ProgressBar currentStep={currentStep} />

        {errorCode && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700" role="alert">
            {ERROR_MESSAGES[errorCode] ?? '알 수 없는 오류가 발생했습니다.'}
          </div>
        )}

        {currentStep === 1 && (
          <section>
            <h1 className="text-xl font-bold text-gray-800 mb-6">업종을 선택해 주세요</h1>
            <CategorySelect value={category} onChange={setCategory} />
            <div className="mt-6">
              <OverseasConsentCheckbox checked={overseasConsent} onChange={setOverseasConsent} />
            </div>
            <button
              type="button"
              disabled={!category || !overseasConsent || submitting}
              onClick={() => handleSubmit(1, '/onboarding/2')}
              className="mt-8 w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-200 text-white font-semibold rounded-lg transition-colors"
            >
              다음
            </button>
          </section>
        )}

        {currentStep === 2 && (
          <section>
            <h1 className="text-xl font-bold text-gray-800 mb-6">매장 정보를 입력해 주세요</h1>
            <StoreInfoForm value={storeInfo} onChange={setStoreInfo} />
            <button
              type="button"
              disabled={!storeInfo.storeName || !storeInfo.address || submitting}
              onClick={() => handleSubmit(2, '/onboarding/3')}
              className="mt-8 w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-200 text-white font-semibold rounded-lg transition-colors"
            >
              다음
            </button>
          </section>
        )}

        {currentStep === 3 && (
          <section>
            <h1 className="text-xl font-bold text-gray-800 mb-6">인스타그램 계정 연결</h1>
            {profile?.ig_user_id ? (
              <>
                <p className="text-gray-600 mb-6">
                  <span className="font-semibold text-orange-600">@{profile.ig_username}</span> 계정이 연결되었습니다.
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/onboarding/4')}
                  className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg transition-colors"
                >
                  다음
                </button>
              </>
            ) : (
              <>
                <p className="text-gray-600 mb-6">인스타그램 비즈니스 계정을 연결해야 소그라를 사용할 수 있습니다.</p>
                <button
                  type="button"
                  onClick={() => { window.location.href = '/api/instagram/oauth/start' }}
                  className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg transition-colors"
                >
                  인스타그램 비즈니스 계정 연결
                </button>
              </>
            )}
          </section>
        )}

        {currentStep === 4 && (
          <section>
            <h1 className="text-xl font-bold text-gray-800 mb-6">대표 메뉴를 입력해 주세요</h1>
            <MenuForm value={menus} onChange={setMenus} />
            <button
              type="button"
              disabled={menus.length === 0 || submitting}
              onClick={() => handleSubmit(4, '/onboarding/5')}
              className="mt-8 w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-200 text-white font-semibold rounded-lg transition-colors"
            >
              다음
            </button>
          </section>
        )}

        {currentStep === 5 && (
          <section>
            <h1 className="text-xl font-bold text-gray-800 mb-6">브랜드 톤을 선택해 주세요</h1>
            <ToneForm value={toneKeywords} onChange={setToneKeywords} />
            <button
              type="button"
              disabled={toneKeywords.length !== 3 || submitting}
              onClick={() => handleSubmit(5, '/dashboard')}
              className="mt-8 w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-200 text-white font-semibold rounded-lg transition-colors"
            >
              완료
            </button>
          </section>
        )}
      </div>
    </main>
  )
}
