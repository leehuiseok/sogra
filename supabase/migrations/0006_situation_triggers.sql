-- 0006_situation_triggers.sql
-- 상황별 트리거 인스턴스 + NLU 파싱 이벤트 + 트리거 프리셋 카탈로그
-- Plan §2 SituationTrigger / §RI-4 NLU calibration

-- =========================================================
-- trigger_presets: 프리셋 카탈로그 (public read-only)
-- =========================================================
CREATE TABLE IF NOT EXISTS trigger_presets (
  key             TEXT PRIMARY KEY,
  event           TEXT NOT NULL,
  action          TEXT NOT NULL,
  when_text       TEXT NOT NULL,
  label_ko        TEXT NOT NULL,
  description_ko  TEXT NOT NULL,
  sort_order      INT  NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE trigger_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trigger_presets_select_all"
  ON trigger_presets FOR SELECT
  USING (true);

-- =========================================================
-- situation_triggers: 매장별 트리거 인스턴스
-- =========================================================
CREATE TABLE IF NOT EXISTS situation_triggers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES store_profiles(id) ON DELETE CASCADE,
  source      TEXT NOT NULL CHECK (source IN ('preset', 'recommendation', 'freeform')),
  preset_key  TEXT,
  event       TEXT NOT NULL,
  action      TEXT NOT NULL,
  when_text   TEXT,
  target      TEXT,
  signals     JSONB NOT NULL DEFAULT '{}'::jsonb,
  score       NUMERIC(5,3),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_situation_triggers_store_created
  ON situation_triggers(store_id, created_at DESC);

ALTER TABLE situation_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "situation_triggers_select_own"
  ON situation_triggers FOR SELECT
  USING (get_store_owner_id(store_id) = auth.uid());

CREATE POLICY "situation_triggers_insert_own"
  ON situation_triggers FOR INSERT
  WITH CHECK (get_store_owner_id(store_id) = auth.uid());

CREATE POLICY "situation_triggers_update_own"
  ON situation_triggers FOR UPDATE
  USING (get_store_owner_id(store_id) = auth.uid())
  WITH CHECK (get_store_owner_id(store_id) = auth.uid());

CREATE POLICY "situation_triggers_delete_own"
  ON situation_triggers FOR DELETE
  USING (get_store_owner_id(store_id) = auth.uid());

-- =========================================================
-- nlu_parse_events: NLU 파싱 드리프트 모니터
-- =========================================================
CREATE TABLE IF NOT EXISTS nlu_parse_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id           UUID NOT NULL REFERENCES store_profiles(id) ON DELETE CASCADE,
  input_text         TEXT NOT NULL CHECK (char_length(input_text) BETWEEN 1 AND 500),
  parsed_output      JSONB NOT NULL,
  confidence         NUMERIC(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  threshold_applied  NUMERIC(4,3) NOT NULL,
  user_action        TEXT CHECK (user_action IN ('confirm', 'edit', 'reject', NULL)),
  corrected_output   JSONB,
  model              TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nlu_parse_events_store_created
  ON nlu_parse_events(store_id, created_at DESC);

ALTER TABLE nlu_parse_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nlu_parse_events_select_own"
  ON nlu_parse_events FOR SELECT
  USING (get_store_owner_id(store_id) = auth.uid());

CREATE POLICY "nlu_parse_events_insert_own"
  ON nlu_parse_events FOR INSERT
  WITH CHECK (get_store_owner_id(store_id) = auth.uid());

CREATE POLICY "nlu_parse_events_update_own"
  ON nlu_parse_events FOR UPDATE
  USING (get_store_owner_id(store_id) = auth.uid())
  WITH CHECK (get_store_owner_id(store_id) = auth.uid());

CREATE POLICY "nlu_parse_events_delete_own"
  ON nlu_parse_events FOR DELETE
  USING (get_store_owner_id(store_id) = auth.uid());
