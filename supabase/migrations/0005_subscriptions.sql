-- 0005_subscriptions.sql
-- 구독 + 빌링키 (Plan §AC-13 / Toss Payments 정기결제)
-- 월 49,000원 단일 플랜 (v1)

CREATE TABLE IF NOT EXISTS subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id              UUID REFERENCES store_profiles(id) ON DELETE SET NULL,
  toss_customer_key     TEXT NOT NULL UNIQUE,
  toss_billing_key      TEXT,                       -- 발급 후 채워짐
  plan                  TEXT NOT NULL DEFAULT 'sogra-v1-monthly',
  amount_krw            INT NOT NULL DEFAULT 49000 CHECK (amount_krw >= 0),
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','active','past_due','suspended','cancelled')),
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  next_billing_at       TIMESTAMPTZ,
  grace_period_until    TIMESTAMPTZ,                -- dunning grace period
  cancelled_at          TIMESTAMPTZ,
  cancel_reason         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_owner ON subscriptions(owner_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_billing
  ON subscriptions(next_billing_at) WHERE status IN ('active','past_due');

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- 본인 구독만 SELECT (owner_id = auth.uid())
CREATE POLICY "subscriptions_select_own" ON subscriptions FOR SELECT
  USING (owner_id = auth.uid());

-- service_role 만 INSERT/UPDATE/DELETE (결제 흐름은 서버 측 admin client 사용)
CREATE POLICY "subscriptions_service_all" ON subscriptions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- updated_at 자동 갱신 트리거
DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
