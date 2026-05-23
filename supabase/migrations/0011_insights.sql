-- 0011_insights.sql
-- Meta Graph API Insights 폴링 결과 저장 (Plan §Step 5 AC-11)
-- 폴링 주기: posted_at + 24h, posted_at + 7d (Inngest scheduled, 1h cron)
-- 원래 plan 0010이었으나 0010_storage_buckets로 선점되어 0011로 배정.

CREATE TABLE IF NOT EXISTS instagram_post_insights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID NOT NULL REFERENCES store_profiles(id) ON DELETE CASCADE,
  post_id         UUID NOT NULL REFERENCES instagram_posts(id) ON DELETE CASCADE,
  window_label    TEXT NOT NULL CHECK (window_label IN ('h24','d7')),
  likes           INT NOT NULL DEFAULT 0 CHECK (likes >= 0),
  reach           INT NOT NULL DEFAULT 0 CHECK (reach >= 0),
  impressions     INT NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  saves           INT NOT NULL DEFAULT 0 CHECK (saves >= 0),
  comments        INT NOT NULL DEFAULT 0 CHECK (comments >= 0),
  raw_payload     JSONB,
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, window_label)
);

CREATE INDEX IF NOT EXISTS idx_insights_store_captured
  ON instagram_post_insights(store_id, captured_at DESC);

ALTER TABLE instagram_post_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insights_select_own" ON instagram_post_insights FOR SELECT
  USING (get_store_owner_id(store_id) = auth.uid());
CREATE POLICY "insights_service_all" ON instagram_post_insights FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 폴링 실패/제한 추적 — exponential retry (1h → 2h → 4h → 8h → 12h max).
-- 5회 실패 시 succeeded=false 영구로 두고 더 이상 시도하지 않는다.
CREATE TABLE IF NOT EXISTS insights_poll_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         UUID NOT NULL REFERENCES instagram_posts(id) ON DELETE CASCADE,
  window_label    TEXT NOT NULL CHECK (window_label IN ('h24','d7')),
  attempt_count   INT NOT NULL DEFAULT 0,
  last_error      TEXT,
  next_retry_at   TIMESTAMPTZ,
  succeeded       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, window_label)
);

CREATE INDEX IF NOT EXISTS idx_poll_attempts_next_retry
  ON insights_poll_attempts(next_retry_at)
  WHERE NOT succeeded;

ALTER TABLE insights_poll_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "poll_attempts_service_all" ON insights_poll_attempts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS trg_poll_attempts_updated_at ON insights_poll_attempts;
CREATE TRIGGER trg_poll_attempts_updated_at
  BEFORE UPDATE ON insights_poll_attempts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
