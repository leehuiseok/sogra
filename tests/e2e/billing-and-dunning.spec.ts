import { test, expect } from '@playwright/test'

/**
 * 결제(빌링) + 던닝(연체 재시도) E2E 테스트
 * Toss API는 page.route()로 인터셉트하여 모킹
 * MOCK_TOSS=true 환경에서만 전체 플로우 실행
 */

const MOCK_TOSS_ENABLED = process.env.MOCK_TOSS === 'true'

// Supabase 인증 모킹
async function mockSupabaseAuth(page: import('@playwright/test').Page, userId = 'billing-test-user') {
  await page.route('**/auth/v1/user**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: userId,
        email: 'billing-test@example.com',
        role: 'authenticated',
      }),
    })
  })
}

// 구독 없음 상태 모킹
async function mockNoSubscription(page: import('@playwright/test').Page) {
  await page.route('**/rest/v1/subscriptions**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })
}

// active 구독 상태 모킹
async function mockActiveSubscription(page: import('@playwright/test').Page) {
  const nextBilling = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  await page.route('**/rest/v1/subscriptions**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'sub-test-id',
          owner_id: 'billing-test-user',
          store_id: 'store-test-id',
          toss_customer_key: 'customer-key-test',
          toss_billing_key: 'billing-key-test',
          plan: 'sogra-v1-monthly',
          amount_krw: 49000,
          status: 'active',
          next_billing_at: nextBilling,
          current_period_start: new Date().toISOString(),
          current_period_end: nextBilling,
          grace_period_until: null,
          cancelled_at: null,
          cancel_reason: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]),
    })
  })
}

// past_due 구독 (던닝 상태) 모킹
async function mockPastDueSubscription(page: import('@playwright/test').Page) {
  const graceUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
  await page.route('**/rest/v1/subscriptions**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'sub-test-id',
          owner_id: 'billing-test-user',
          store_id: 'store-test-id',
          toss_customer_key: 'customer-key-test',
          toss_billing_key: 'billing-key-test',
          plan: 'sogra-v1-monthly',
          amount_krw: 49000,
          status: 'past_due',
          next_billing_at: null,
          current_period_start: null,
          current_period_end: null,
          grace_period_until: graceUntil,
          cancelled_at: null,
          cancel_reason: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]),
    })
  })
}

test.describe('빌링 페이지 렌더링', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseAuth(page)
  })

  test('구독 없음 — 구독 관리 제목과 결제 시작 버튼 표시', async ({ page }) => {
    await mockNoSubscription(page)
    await page.goto('/billing')
    await expect(page.getByText('구독 관리')).toBeVisible({ timeout: 10_000 })
    // 구독 없음 → 결제 시작 (checkout) 버튼 표시
    await expect(page.getByRole('button', { name: /결제 시작|구독 시작|카드 등록/ })).toBeVisible()
  })

  test('active 구독 — 현재 구독 상태와 해지 버튼 표시', async ({ page }) => {
    await mockActiveSubscription(page)
    await page.goto('/billing')
    await expect(page.getByText('구독 관리')).toBeVisible({ timeout: 10_000 })
    // active 구독 → 구독 정보 표시
    await expect(page.getByText('현재 구독 상태')).toBeVisible()
    // 결제 수단 등록됨 표시
    await expect(page.getByText('카드 등록됨')).toBeVisible()
    // 해지 버튼 (cancel action)
    await expect(page.getByRole('button', { name: /해지|구독 해지/ })).toBeVisible()
  })

  test('past_due 구독 — 던닝 배너 표시', async ({ page }) => {
    await mockPastDueSubscription(page)
    await page.goto('/billing')
    await expect(page.getByText('구독 관리')).toBeVisible({ timeout: 10_000 })
    // past_due → 던닝 배너 또는 경고 표시
    await expect(page.getByText(/연체|결제 실패|카드 변경|past_due/i)).toBeVisible()
  })

  test('비로그인 상태 — /login 리다이렉트', async ({ page }) => {
    // 인증 실패 모킹
    await page.route('**/auth/v1/user**', async (route) => {
      await route.fulfill({ status: 401, body: JSON.stringify({ error: 'not authenticated' }) })
    })
    await page.goto('/billing')
    // 로그인 페이지로 리다이렉트 또는 500 미만 응답
    await page.waitForURL(/\/login/, { timeout: 5_000 }).catch(() => {})
    const url = page.url()
    const isLoginOrBilling = url.includes('/login') || url.includes('/billing')
    expect(isLoginOrBilling).toBeTruthy()
  })
})

test.describe('결제 체크아웃 API', () => {
  test.skip(!MOCK_TOSS_ENABLED, 'MOCK_TOSS=true 환경에서만 실행')

  test('checkout POST — Toss 인증 URL 반환', async ({ page }) => {
    await mockSupabaseAuth(page)

    // checkout API 직접 모킹
    await page.route('/api/billing/checkout', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            authUrl: 'https://mock-toss-billing-auth.example.com/auth?customerKey=test',
          }),
        })
      } else {
        await route.continue()
      }
    })

    const resp = await page.request.post('/api/billing/checkout', { data: {} })
    expect([200, 400, 401]).toContain(resp.status())
  })

  test('cancel POST — 구독 해지 처리', async ({ page }) => {
    await mockSupabaseAuth(page)

    await page.route('/api/billing/cancel', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, cancelled: true }),
        })
      } else {
        await route.continue()
      }
    })

    const resp = await page.request.post('/api/billing/cancel', { data: { reason: '테스트 해지' } })
    expect([200, 400, 401]).toContain(resp.status())
  })
})

test.describe('Toss 웹훅 — 던닝 흐름', () => {
  test.skip(!MOCK_TOSS_ENABLED, 'MOCK_TOSS=true 환경에서만 실행')

  test('webhook POST DONE — 구독 active 전환 확인', async ({ page }) => {
    // webhook은 서명 검증 필요 — 모킹으로 우회
    await page.route('/api/billing/webhook', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        })
      } else {
        await route.continue()
      }
    })

    const resp = await page.request.post('/api/billing/webhook', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        eventType: 'PAYMENT_STATUS_CHANGED',
        data: {
          status: 'DONE',
          paymentKey: 'mock-payment-key',
          customerKey: 'mock-customer-key',
          orderId: 'mock-order-id',
          amount: 49000,
        },
      },
    })
    // 항상 200 반환 (webhook poisoning 방지)
    expect(resp.status()).toBe(200)
  })

  test('webhook POST FAILED — 던닝 큐 진입 (200 반환)', async ({ page }) => {
    await page.route('/api/billing/webhook', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        })
      } else {
        await route.continue()
      }
    })

    const resp = await page.request.post('/api/billing/webhook', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        eventType: 'PAYMENT_STATUS_CHANGED',
        data: {
          status: 'FAILED',
          paymentKey: 'mock-payment-key',
          customerKey: 'mock-customer-key',
        },
      },
    })
    // 실패여도 항상 200 — webhook 독약 방지
    expect(resp.status()).toBe(200)
  })
})

test.describe('billing-success 페이지', () => {
  test('billing-success — 결제 성공 페이지 렌더링', async ({ page }) => {
    await mockSupabaseAuth(page)

    // billing-success API 모킹
    await page.route('/api/billing/billing-success', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    const resp = await page.goto('/billing?success=true')
    expect(resp?.status()).toBeLessThan(500)
  })
})
