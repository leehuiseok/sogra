-- 0008_media_generation_jobs.sql
-- Inngest 영상 잡 추적 — idempotency + DLQ + 환불 (Plan §CB-2)
CREATE TABLE IF NOT EXISTS media_generation_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID NOT NULL REFERENCES store_profiles(id) ON DELETE CASCADE,
  trigger_id      UUID NOT NULL REFERENCES situation_triggers(id) ON DELETE CASCADE,
  content_id      UUID REFERENCES marketing_contents(id) ON DELETE SET NULL,
  content_kind    TEXT NOT NULL CHECK (content_kind IN ('poster','reels','caption')),
  idempotency_key TEXT UNIQUE NOT NULL,  -- generate_idempotency_key(store_id, trigger_id, kind, month_period)
  status          TEXT NOT NULL CHECK (status IN ('pending','running','succeeded','failed','dead_letter')),
  retry_count     INT NOT NULL DEFAULT 0,
  last_error      TEXT,
  expires_at      TIMESTAMPTZ,  -- external_url 만료 추적
  external_url    TEXT,
  storage_url     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_jobs_store_status
  ON media_generation_jobs(store_id, status);
CREATE INDEX IF NOT EXISTS idx_media_jobs_dead_letter
  ON media_generation_jobs(status) WHERE status = 'dead_letter';
CREATE INDEX IF NOT EXISTS idx_media_jobs_expires
  ON media_generation_jobs(expires_at) WHERE storage_url IS NOT NULL;

ALTER TABLE media_generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "media_jobs_select_own" ON media_generation_jobs FOR SELECT
  USING (get_store_owner_id(store_id) = auth.uid());
CREATE POLICY "media_jobs_service_all" ON media_generation_jobs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- updated_at 자동 갱신 트리거
DROP TRIGGER IF EXISTS trg_media_generation_jobs_updated_at ON media_generation_jobs;
CREATE TRIGGER trg_media_generation_jobs_updated_at
  BEFORE UPDATE ON media_generation_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
