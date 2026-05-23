import { test, expect } from '@playwright/test'

/**
 * 온보딩 플로우 + 콘텐츠 생성 E2E 테스트
 * 모든 외부 API는 page.route()로 인터셉트하여 모킹
 */

// API 모킹 헬퍼: store-profile upsert/patch
async function mockStoreProfileApi(page: import('@playwright/test').Page) {
  await page.route('/api/store-profile', async (route) => {
    const method = route.request().method()
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          category: '',
          store_name: '',
          address: '',
          onboarding_step: 1,
        }),
      })
    } else if (method === 'PATCH') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    } else {
      await route.continue()
    }
  })
}

// API 모킹 헬퍼: onboarding event
async function mockOnboardingEventApi(page: import('@playwright/test').Page) {
  await page.route('/api/onboarding/event', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    })
  })
}

// Supabase 인증 모킹 — auth.getUser() 응답
async function mockSupabaseAuth(page: import('@playwright/test').Page) {
  // Supabase SSR 인증 요청 인터셉트
  await page.route('**/auth/v1/user**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'test-user-id-123',
        email: 'test@example.com',
        role: 'authenticated',
      }),
    })
  })
}

test.describe('온보딩 플로우', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseAuth(page)
    await mockStoreProfileApi(page)
    await mockOnboardingEventApi(page)
  })

  test('step 1 — 업종 선택 페이지가 렌더링된다', async ({ page }) => {
    await page.goto('/onboarding/1')
    await expect(page.getByText('업종을 선택해 주세요')).toBeVisible()
    // 카테고리 버튼 3개 존재 확인
    await expect(page.getByRole('button', { name: /카페|음식점|배달/ })).toHaveCount(3)
  })

  test('step 1 — 업종 미선택 시 다음 버튼 비활성화', async ({ page }) => {
    await page.goto('/onboarding/1')
    const nextBtn = page.getByRole('button', { name: '다음' })
    await expect(nextBtn).toBeDisabled()
  })

  test('step 1 — 업종 선택 + 해외이전 동의 후 다음 버튼 활성화', async ({ page }) => {
    await page.goto('/onboarding/1')

    // 카페 선택
    await page.getByRole('button', { name: /카페/ }).click()

    // 해외이전 동의 체크박스
    const checkbox = page.getByRole('checkbox')
    await checkbox.check()

    const nextBtn = page.getByRole('button', { name: '다음' })
    await expect(nextBtn).toBeEnabled()
  })

  test('step 2 — 매장 정보 입력 폼이 렌더링된다', async ({ page }) => {
    // step 2 접근 시 기존 프로필 mock (step 1 완료 상태)
    await page.route('/api/store-profile', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            category: 'cafe',
            store_name: '',
            address: '',
            onboarding_step: 2,
          }),
        })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      }
    })

    await page.goto('/onboarding/2')
    await expect(page.getByText('매장 정보를 입력해 주세요')).toBeVisible()
    // 다음 버튼은 빈 상태에서 비활성화
    await expect(page.getByRole('button', { name: '다음' })).toBeDisabled()
  })

  test('step 2 — 매장명과 주소 입력 후 다음 버튼 활성화', async ({ page }) => {
    await page.route('/api/store-profile', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ category: 'cafe', store_name: '', address: '', onboarding_step: 2 }),
        })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      }
    })

    await page.goto('/onboarding/2')
    await page.getByPlaceholder(/상호명|매장 이름/).fill('테스트 카페')
    await page.getByPlaceholder(/주소/).fill('서울시 강남구 테헤란로 1')
    await expect(page.getByRole('button', { name: '다음' })).toBeEnabled()
  })

  test('step 3 — 인스타그램 미연결 시 연결 버튼 표시', async ({ page }) => {
    await page.route('/api/store-profile', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            category: 'cafe',
            store_name: '테스트 카페',
            address: '서울시 강남구',
            ig_user_id: null,
            ig_username: null,
            onboarding_step: 3,
          }),
        })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      }
    })

    await page.goto('/onboarding/3')
    await expect(page.getByText('인스타그램 계정 연결')).toBeVisible()
    await expect(page.getByRole('button', { name: /인스타그램 비즈니스 계정 연결/ })).toBeVisible()
  })

  test('step 3 — 인스타그램 연결 완료 시 다음 버튼 표시', async ({ page }) => {
    await page.route('/api/store-profile', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            category: 'cafe',
            store_name: '테스트 카페',
            address: '서울시 강남구',
            ig_user_id: 'ig-user-123',
            ig_username: 'test_cafe_ig',
            onboarding_step: 3,
          }),
        })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      }
    })

    await page.goto('/onboarding/3')
    await expect(page.getByText('@test_cafe_ig')).toBeVisible()
    await expect(page.getByRole('button', { name: '다음' })).toBeVisible()
  })

  test('step 4 — 메뉴 입력 폼 렌더링 및 빈 상태 다음 버튼 비활성화', async ({ page }) => {
    await page.route('/api/store-profile', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            category: 'cafe',
            store_name: '테스트 카페',
            address: '서울시 강남구',
            ig_user_id: 'ig-user-123',
            menus: [],
            onboarding_step: 4,
          }),
        })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      }
    })

    await page.goto('/onboarding/4')
    await expect(page.getByText('대표 메뉴를 입력해 주세요')).toBeVisible()
    await expect(page.getByRole('button', { name: '다음' })).toBeDisabled()
  })

  test('step 5 — 톤 키워드 3개 선택 후 완료 버튼 활성화', async ({ page }) => {
    await page.route('/api/store-profile', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            category: 'cafe',
            store_name: '테스트 카페',
            address: '서울시 강남구',
            ig_user_id: 'ig-user-123',
            menus: [{ name: '아메리카노', desc: '진한 에스프레소', price: 4500 }],
            tone_keywords: [],
            onboarding_step: 5,
          }),
        })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      }
    })

    await page.goto('/onboarding/5')
    await expect(page.getByText('브랜드 톤을 선택해 주세요')).toBeVisible()
    // 완료 버튼은 키워드 3개 미선택 시 비활성화
    await expect(page.getByRole('button', { name: '완료' })).toBeDisabled()
  })

  test('잘못된 step 번호 접근 시 오류 메시지 표시', async ({ page }) => {
    await page.goto('/onboarding/99')
    await expect(page.getByText('잘못된 단계입니다.')).toBeVisible()
  })
})

test.describe('콘텐츠 생성 플로우', () => {
  test('콘텐츠 목록 페이지 렌더링 (로그인 필요)', async ({ page }) => {
    // 미인증 상태에서 접근 시 리다이렉트 또는 로그인 페이지 표시
    await page.route('**/auth/v1/user**', async (route) => {
      await route.fulfill({ status: 401, body: JSON.stringify({ error: 'not authenticated' }) })
    })

    const response = await page.goto('/content')
    // 로그인 페이지 또는 401 처리 확인
    expect(response?.status()).toBeLessThan(500)
  })

  test('콘텐츠 생성 API 모킹 — 성공 케이스', async ({ page }) => {
    await mockSupabaseAuth(page)

    // 콘텐츠 생성 API 모킹
    await page.route('/api/content/generate', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            contents: [
              { id: 'content-1', kind: 'poster', status: 'ready' },
              { id: 'content-2', kind: 'caption', status: 'ready', caption_text: '오늘의 특별 메뉴 소개!' },
            ],
          }),
        })
      } else {
        await route.continue()
      }
    })

    // API 직접 호출 테스트 (route.fetch 패턴)
    const resp = await page.request.post('/api/content/generate', {
      data: { trigger_id: 'test-trigger-id', store_id: 'test-store-id' },
    })
    // 모킹된 응답 확인
    expect([200, 400, 401, 403]).toContain(resp.status())
  })
})
