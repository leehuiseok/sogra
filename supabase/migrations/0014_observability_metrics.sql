-- 0014_observability_metrics.sql
-- 메트릭 수집 (Plan §2.5) + 외부 API 호출 로그
-- Step 6 Lane 4 (observability)
-- service_role 전용 RLS

-- =========================================================
-- observability_metrics
-- =========================================================
CREATE TABLE IF NOT EXISTS observability_metrics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name     TEXT NOT NULL,
  metric_type     TEXT NOT NULL CHECK (metric_type IN ('counter','gauge','timing')),
  value           NUMERIC NOT NULL,
  tags            JSONB NOT NULL DEFAULT '{}'::jsonb,
  store_id        UUID,
  correlation_id  TEXT,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_metrics_name_recorded
  ON observability_metrics(metric_name, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_store_recorded
  ON observability_metrics(store_id, recorded_at DESC) WHERE store_id IS NOT NULL;

ALTER TABLE observability_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "metrics_service_all" ON observability_metrics FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =========================================================
-- external_api_calls
-- =========================================================
CREATE TABLE IF NOT EXISTS external_api_calls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id  TEXT NOT NULL,
  service         TEXT NOT NULL,                   -- 'meta_graph' | 'anthropic' | 'openai' | 'runway' | 'toss' | 'openweather'
  endpoint        TEXT,
  http_status     INT,
  duration_ms     INT,
  error           TEXT,
  store_id        UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_external_api_correlation
  ON external_api_calls(correlation_id);
CREATE INDEX IF NOT EXISTS idx_external_api_service_created
  ON external_api_calls(service, created_at DESC);

ALTER TABLE external_api_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "external_api_service_all" ON external_api_calls FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
