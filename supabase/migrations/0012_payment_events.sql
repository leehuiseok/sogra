-- 0012_payment_events.sql
-- Toss webhook 이벤트 저장 + dunning 추적 (Plan §AC-13 / RI-6 / §7 #9)

CREATE TABLE IF NOT EXISTS payment_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            TEXT UNIQUE NOT NULL,         -- Toss eventId (멱등성)
  event_type          TEXT NOT NULL,                -- PAYMENT_STATUS_CHANGED 등
  owner_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id     UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  toss_payment_key    TEXT,
  toss_customer_key   TEXT NOT NULL,
  toss_order_id       TEXT,
  amount_krw          INT,
  status              TEXT NOT NULL,                -- DONE / FAILED / CANCELLED 등
  raw_payload         JSONB NOT NULL,
  signature_valid     BOOLEAN NOT NULL,
  customer_key_match  BOOLEAN NOT NULL,             -- RI-6 mapping assert 결과
  dunning_attempts    INT NOT NULL DEFAULT 0 CHECK (dunning_attempts >= 0),
  processed_at        TIMESTAMPTZ,
  processing_error    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (signature_valid = true OR processing_error IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_payment_events_owner_created
  ON payment_events(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_events_unprocessed
  ON payment_events(created_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payment_events_subscription
  ON payment_events(subscription_id, created_at DESC);

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_events_service_all" ON payment_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
-- 사용자 SELECT는 v1 범위 아님 (관리자 대시보드 v2)
