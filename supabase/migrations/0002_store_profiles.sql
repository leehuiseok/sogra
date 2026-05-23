-- 0002_store_profiles.sql
-- 매장 프로필 테이블 (AC-2, AC-3 온보딩 데이터 저장)

-- =========================================================
-- store_profiles: 매장 기본 정보 + IG OAuth 토큰
-- owner_id → auth.users FK (Supabase Auth)
-- =========================================================
CREATE TABLE IF NOT EXISTS store_profiles (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id                  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 온보딩 Step 1: 업종 (Plan §AC-2 기준 3종)
  category                  TEXT NOT NULL
                              CHECK (category IN ('cafe', 'restaurant', 'delivery')),

  -- 온보딩 Step 2: 상호·주소
  store_name                TEXT NOT NULL CHECK (char_length(store_name) BETWEEN 1 AND 100),
  address                   TEXT NOT NULL CHECK (char_length(address) BETWEEN 1 AND 300),
  address_detail            TEXT,

  -- 온보딩 Step 3: IG OAuth (AC-3)
  ig_user_id                TEXT,
  ig_username               TEXT,
  ig_account_type           TEXT CHECK (ig_account_type IN ('BUSINESS', 'CREATOR', 'PERSONAL', NULL)),
  ig_access_token           TEXT,           -- 암호화 저장 권장 (v1.1: vault 이전)
  ig_token_expires_at       TIMESTAMPTZ,
  ig_page_id                TEXT,           -- FB 페이지 연결 시

  -- 온보딩 Step 4: 대표 메뉴 3개 (jsonb 배열)
  -- [{"name": "...", "desc": "...", "price": 0}]
  menus                     JSONB NOT NULL DEFAULT '[]'::jsonb
                              CHECK (jsonb_array_length(menus) BETWEEN 0 AND 3),

  -- 온보딩 Step 5: 말투 키워드 3개 (jsonb 배열)
  -- ["친근한", "재미있는", "정직한"]
  tone_keywords             JSONB NOT NULL DEFAULT '[]'::jsonb
                              CHECK (jsonb_array_length(tone_keywords) BETWEEN 0 AND 3),

  -- Mock → Real 전환 동의 (AC-9 / Step 5 전환 정책)
  real_publish_consented_at TIMESTAMPTZ,

  -- 국외이전 동의 (R-Compliance / Step 1 온보딩 동의 UI)
  overseas_transfer_consented_at TIMESTAMPTZ,

  -- 온보딩 완료 단계 추적 (1~5, null=미시작)
  onboarding_step           SMALLINT DEFAULT 1 CHECK (onboarding_step BETWEEN 1 AND 5),
  onboarding_completed_at   TIMESTAMPTZ,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 매장당 owner 유일 (owner 1명 = 매장 1개 v1)
  CONSTRAINT store_profiles_owner_unique UNIQUE (owner_id)
);

-- updated_at 자동 갱신
CREATE TRIGGER trg_store_profiles_updated_at
  BEFORE UPDATE ON store_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- owner_id 인덱스 (RLS where 절 최적화)
CREATE INDEX IF NOT EXISTS idx_store_profiles_owner_id ON store_profiles(owner_id);

-- IG user_id 인덱스 (OAuth callback 조회)
CREATE INDEX IF NOT EXISTS idx_store_profiles_ig_user_id ON store_profiles(ig_user_id)
  WHERE ig_user_id IS NOT NULL;

-- RLS 활성화 (정책은 0003_rls_policies.sql에서 정의)
ALTER TABLE store_profiles ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- onboarding_funnel_events: 온보딩 단계별 이탈 추적
-- AC-1 온보딩 7분 목표 측정용 (R6 완화)
-- =========================================================
CREATE TABLE IF NOT EXISTS onboarding_funnel_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step        SMALLINT NOT NULL CHECK (step BETWEEN 1 AND 5),
  event_type  TEXT NOT NULL CHECK (event_type IN ('enter', 'complete', 'skip', 'back', 'abandon')),
  duration_ms INTEGER,        -- 해당 단계 소요 시간(ms)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_events_owner ON onboarding_funnel_events(owner_id);

ALTER TABLE onboarding_funnel_events ENABLE ROW LEVEL SECURITY;
