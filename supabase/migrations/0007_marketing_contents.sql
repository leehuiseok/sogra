-- 0007_marketing_contents.sql
-- 매장별 콘텐츠 (포스터/릴스/캡션) — 1 trigger → 최대 3 row (kind별 1개)
CREATE TABLE IF NOT EXISTS marketing_contents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES store_profiles(id) ON DELETE CASCADE,
  trigger_id    UUID NOT NULL REFERENCES situation_triggers(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('poster','reels','caption')),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','generating','ready','approved','failed')),
  caption_text  TEXT,
  storage_url   TEXT,        -- Supabase Storage signed URL (poster/reels)
  storage_path  TEXT,        -- 영구 경로 (URL refresh 용)
  external_url  TEXT,        -- 원본 외부 AI URL (디버그)
  model_used    TEXT,
  cost_usd      NUMERIC(10,4),
  used_boost    BOOLEAN NOT NULL DEFAULT false,
  approved_at   TIMESTAMPTZ,
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_contents_store_created
  ON marketing_contents(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_contents_trigger
  ON marketing_contents(trigger_id);

ALTER TABLE marketing_contents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketing_contents_select_own" ON marketing_contents FOR SELECT
  USING (get_store_owner_id(store_id) = auth.uid());
CREATE POLICY "marketing_contents_insert_own" ON marketing_contents FOR INSERT
  WITH CHECK (get_store_owner_id(store_id) = auth.uid());
CREATE POLICY "marketing_contents_update_own" ON marketing_contents FOR UPDATE
  USING (get_store_owner_id(store_id) = auth.uid())
  WITH CHECK (get_store_owner_id(store_id) = auth.uid());

-- updated_at 자동 갱신 트리거
DROP TRIGGER IF EXISTS trg_marketing_contents_updated_at ON marketing_contents;
CREATE TRIGGER trg_marketing_contents_updated_at
  BEFORE UPDATE ON marketing_contents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
