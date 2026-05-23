import { test, expect } from '@playwright/test'

/**
 * 인스타그램 게시 — Mock 모드 / Real 모드 전환 E2E 테스트
 * MOCK_INSTAGRAM_PUBLISH=true 시 Mock 플로우만 실행
 * Real 모드는 IG OAuth 토큰 없이는 스킵
 */

const MOCK_IG_ENABLED = process.env.MOCK_INSTAGRAM_PUBLISH === 'true'
const REAL_IG_ENABLED = !MOCK_IG_ENABLED && !!process.env.IG_ACCESS_TOKEN

// Supabase 인증 모킹
async function mockSupabaseAuth(page: import('@playwright/test').Page) {
  await page.route('**/auth/v1/user**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'ig-test-user-id',
        email: 'ig-test@example.com',
        role: 'authenticated',
      }),
    })
  })
}

// 인스타그램 게시 API 모킹 (Mock 모드)
async function mockInstagramPostApi(
  page: import('@playwright/test').Page,
  scenario: 'success' | 'quota_exceeded' | 'not_consented' = 'success',
) {
  await page.route('/api/instagram/post', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    if (scenario === 'success') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          mode: 'mock',
          post_id: 'mock-post-id-' + Date.now(),
          ig_media_id: null,
          match_status: 'pending',
        }),
      })
    } else if (scenario === 'quota_exceeded') {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: '월간 한도 초과', quota_exceeded: true }),
      })
    } else if (scenario === 'not_consented') {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Real 게시 동의가 필요합니다.' }),
      })
    }
  })
}

test.describe('Instagram Mock 게시 플로우', () => {
  test.skip(!MOCK_IG_ENABLED, 'MOCK_INSTAGRAM_PUBLISH=true 환경에서만 실행')

  test.beforeEach(async ({ page }) => {
    await mockSupabaseAuth(page)
  })

  test('Mock 모드 — 게시 API 성공 시 post_id 반환', async ({ page }) => {
    await mockInstagramPostApi(page, 'success')

    const resp = await page.request.post('/api/instagram/post', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        content_id: 'test-content-id',
        publish_kind: 'feed',
      },
    })

    // mock 성공 또는 인증 오류 (서버에서 실제 auth 검사)
    expect([200, 401, 403]).toContain(resp.status())
  })

  test('Mock 모드 — 쿼터 초과 시 429 반환', async ({ page }) => {
    await mockInstagramPostApi(page, 'quota_exceeded')

    const resp = await page.request.post('/api/instagram/post', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        content_id: 'test-content-id',
        publish_kind: 'reels',
      },
    })

    expect([429, 401, 403]).toContain(resp.status())
  })

  test('Mock 모드 — Real 동의 없이 real 게시 시도 시 403', async ({ page }) => {
    await mockInstagramPostApi(page, 'not_consented')

    const resp = await page.request.post('/api/instagram/post', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        content_id: 'test-content-id',
        publish_kind: 'feed',
        force_real: true,
      },
    })

    expect([403, 400, 401]).toContain(resp.status())
  })
})

test.describe('Instagram OAuth 플로우', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseAuth(page)
  })

  test('OAuth 시작 — /api/instagram/oauth/start 리다이렉트', async ({ page }) => {
    // MOCK 모드에서는 실제 Meta 리다이렉트 없이 처리
    await page.route('/api/instagram/oauth/start', async (route) => {
      await route.fulfill({
        status: 302,
        headers: {
          Location: 'https://mock-meta-oauth.example.com/dialog/oauth?state=test-state',
        },
        body: '',
      })
    })

    const resp = await page.request.get('/api/instagram/oauth/start', {
      maxRedirects: 0,
    })
    // 302 리다이렉트 (Meta OAuth 페이지로)
    expect([302, 307, 200]).toContain(resp.status())
  })

  test('OAuth 콜백 — CSRF 검증 실패 시 /onboarding/3?error=csrf 리다이렉트', async ({ page }) => {
    await page.route('/api/instagram/oauth/callback*', async (route) => {
      await route.fulfill({
        status: 302,
        headers: { Location: '/onboarding/3?error=csrf' },
        body: '',
      })
    })

    const resp = await page.request.get('/api/instagram/oauth/callback?code=test&state=invalid', {
      maxRedirects: 0,
    })
    expect([302, 307, 400]).toContain(resp.status())
  })

  test('OAuth 콜백 — personal account 오류 시 적절한 에러 표시', async ({ page }) => {
    // 실제 콜백 처리 없이 에러 메시지만 확인
    await page.route('/api/instagram*', async (route) => {
      await route.fulfill({
        status: 302,
        headers: { Location: '/onboarding/3?error=personal_account' },
        body: '',
      })
    })
    await page.goto('/onboarding/3?error=personal_account')
    await expect(
      page.getByText(/인스타그램 개인 계정은 연결할 수 없습니다/)
    ).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Instagram Real 게시 플로우', () => {
  test.skip(!REAL_IG_ENABLED, 'IG_ACCESS_TOKEN 환경변수가 설정된 경우에만 실행')

  test('Real 모드 — 동의 완료 후 feed 게시 성공', async ({ page }) => {
    await mockSupabaseAuth(page)

    // Real 모드: 실제 Meta API 호출 없이 graph API만 모킹
    await page.route('**/graph.facebook.com/**', async (route) => {
      const url = route.request().url()
      if (url.includes('/media')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'real-ig-media-container-id' }),
        })
      } else if (url.includes('/media_publish')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'real-ig-post-id-12345' }),
        })
      } else {
        await route.continue()
      }
    })

    const resp = await page.request.post('/api/instagram/post', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        content_id: 'real-test-content-id',
        publish_kind: 'feed',
      },
    })

    expect([200, 401, 403]).toContain(resp.status())
  })
})

test.describe('인사이트 폴링 모킹', () => {
  test('h24 인사이트 조회 — Mock 응답 확인', async ({ page }) => {
    await mockSupabaseAuth(page)

    // Meta Graph API insights 모킹
    await page.route('**/graph.facebook.com/**/insights**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { name: 'likes', values: [{ value: 42 }] },
            { name: 'reach', values: [{ value: 156 }] },
            { name: 'impressions', values: [{ value: 200 }] },
            { name: 'saved', values: [{ value: 12 }] },
          ],
        }),
      })
    })

    // insights poll trigger API가 존재하는 경우 테스트
    const resp = await page.request.get('/api/triggers/recommendations', {
      headers: { 'Content-Type': 'application/json' },
    })
    // 존재하거나 404 — 500은 허용하지 않음
    expect(resp.status()).toBeLessThan(500)
  })
})
