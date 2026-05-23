'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import ProgressBar from '@/components/onboarding/ProgressBar'
import CategorySelect from '@/components/onboarding/CategorySelect'
import OverseasConsentCheckbox from '@/components/onboarding/OverseasConsentCheckbox'
import StoreInfoForm, { type StoreInfoValue } from '@/components/onboarding/StoreInfoForm'
import MenuForm, { type MenuItem } from '@/components/onboarding/MenuForm'
import ToneForm from '@/components/onboarding/ToneForm'

type StoreProfile = {
  category?: string
  store_name?: string
  address?: string
  address_detail?: string | null
  menus?: MenuItem[]
  tone_keywords?: string[]
  onboarding_step?: number | null
}

export default function OnboardingStepPage() {
  const params = useParams()
  const router = useRouter()
  const stepStr = params.step as string
  const currentStep = parseInt(stepStr, 10)

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  // Step 1
  const [category, setCategory] = useState('')
  const [overseasConsent, setOverseasConsent] = useState(false)

  // Step 2
  const [storeInfo, setStoreInfo] = useState<StoreInfoValue>({ storeName: '', address: '', addressDetail: '' })

  // Step 3
  const [menus, setMenus] = useState<MenuItem[]>([])

  // Step 4
  const [toneKeywords, setToneKeywords] = useState<string[]>([])

  useEffect(() => {
    async function init() {
      const res = await fetch('/api/store-profile')
      if (res.ok) {
        const data = (await res.json()) as StoreProfile
        setCategory(data.category ?? '')
        setStoreInfo({
          storeName: data.store_name ?? '',
          address: data.address ?? '',
          addressDetail: data.address_detail ?? '',
        })
        setMenus((data.menus as MenuItem[]) ?? [])
        setToneKeywords((data.tone_keywords as string[]) ?? [])
      } else if (res.status === 401) {
        router.push('/login')
        return
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
    } else if (step === 3) {
      body = { step: 3, menus, events: [{ eventType: 'complete' }] }
    } else if (step === 4) {
      body = { step: 4, toneKeywords, events: [{ eventType: 'complete' }] }
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

  if (isNaN(currentStep) || currentStep < 1 || currentStep > 4) {
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
            <h1 className="text-xl font-bold text-gray-800 mb-6">대표 메뉴를 입력해 주세요</h1>
            <MenuForm value={menus} onChange={setMenus} />
            <button
              type="button"
              disabled={menus.length === 0 || submitting}
              onClick={() => handleSubmit(3, '/onboarding/4')}
              className="mt-8 w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-200 text-white font-semibold rounded-lg transition-colors"
            >
              다음
            </button>
          </section>
        )}

        {currentStep === 4 && (
          <section>
            <h1 className="text-xl font-bold text-gray-800 mb-6">브랜드 톤을 선택해 주세요</h1>
            <ToneForm value={toneKeywords} onChange={setToneKeywords} />
            <button
              type="button"
              disabled={toneKeywords.length !== 3 || submitting}
              onClick={() => handleSubmit(4, '/dashboard')}
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
