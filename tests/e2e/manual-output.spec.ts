import { test, expect } from '@playwright/test'

/**
 * 최종 산출물 수동 업로드 플로우
 * 인스타그램 OAuth/자동 게시 UI는 온보딩과 산출물 화면의 필수 흐름에서 제외한다.
 */

async function mockSupabaseAuth(page: import('@playwright/test').Page) {
  await page.route('**/auth/v1/user**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 'manual-output-user-id',
          email: 'manual-output@example.com',
          role: 'authenticated',
        },
      }),
    })
  })
}

async function mockOnboardingProfile(page: import('@playwright/test').Page) {
  await page.route('/api/store-profile', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          category: 'cafe',
          store_name: '테스트 카페',
          address: '서울시 강남구',
          menus: [],
          onboarding_step: 3,
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    })
  })

  await page.route('/api/onboarding/event', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    })
  })
}

test.describe('수동 업로드 전환', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseAuth(page)
    await mockOnboardingProfile(page)
  })

  test('온보딩 3단계는 인스타그램 인증 대신 메뉴 입력을 보여준다', async ({ page }) => {
    await page.goto('/onboarding/3?error=personal_account')

    await expect(page.getByText('대표 메뉴를 입력해 주세요')).toBeVisible()
    await expect(page.getByText('인스타그램 계정 연결')).not.toBeVisible()
    await expect(page.getByRole('button', { name: /인스타그램 비즈니스 계정 연결/ })).not.toBeVisible()
    await expect(page.getByText(/인스타그램 개인 계정은 연결할 수 없습니다/)).not.toBeVisible()
  })
})
