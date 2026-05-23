import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E 설정
 * 브라우저: Chrome (Chromium) + WebKit
 * baseURL: http://localhost:3000
 * webServer: pnpm dev (또는 npm run dev)
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : [['list']],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // CI에서는 dev 서버를 직접 기동
  webServer: process.env.CI
    ? {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: false,
        timeout: 60_000,
        env: {
          NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
          NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key',
          SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key',
          MOCK_INSTAGRAM_PUBLISH: 'true',
          MOCK_AI_PROVIDERS: 'true',
          MOCK_TOSS: 'true',
          TOSS_SECRET_KEY: process.env.TOSS_SECRET_KEY ?? 'placeholder-toss-key',
          TOSS_CLIENT_KEY: process.env.TOSS_CLIENT_KEY ?? 'placeholder-toss-client-key',
          INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY ?? 'placeholder-inngest-key',
          INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY ?? 'placeholder-inngest-event-key',
          METRICS_SINK: 'stdout',
        },
      }
    : undefined,
})
