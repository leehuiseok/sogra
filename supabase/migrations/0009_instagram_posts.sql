-- 0009_instagram_posts.sql
-- 인스타그램 게시 기록 — Mock 모드와 Real 모드 모두 동일 스키마 (Plan §Step 5 / CB-1)
-- Real 모드: ig_media_id 즉시 채워짐. Mock 모드: ig_media_id NULL, 사후 매처가 채움.

CREATE TABLE IF NOT EXISTS instagram_posts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         UUID NOT NULL REFERENCES store_profiles(id) ON DELETE CASCADE,
  content_id       UUID NOT NULL REFERENCES marketing_contents(id) ON DELETE CASCADE,
  mode             TEXT NOT NULL CHECK (mode IN ('mock','real')),
  ig_media_id      TEXT,                       -- Real: graph API 응답 / Mock: 사후 매칭
  ig_permalink     TEXT,                       -- Real 즉시 / Mock NULL → 매처가 채움
  caption_used     TEXT NOT NULL,              -- 매칭 알고리즘이 사용할 caption substring
  publish_kind     TEXT NOT NULL CHECK (publish_kind IN ('feed','reels','stories')),
  match_status     TEXT NOT NULL DEFAULT 'pending'
                   CHECK (match_status IN ('pending','matched','unmatched','not_required')),
  match_attempted_at TIMESTAMPTZ,
  posted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (content_id, mode)
);

CREATE INDEX IF NOT EXISTS idx_instagram_posts_store_posted
  ON instagram_posts(store_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_match_pending
  ON instagram_posts(store_id, posted_at)
  WHERE match_status = 'pending';

ALTER TABLE instagram_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "instagram_posts_select_own" ON instagram_posts FOR SELECT
  USING (get_store_owner_id(store_id) = auth.uid());
CREATE POLICY "instagram_posts_insert_own" ON instagram_posts FOR INSERT
  WITH CHECK (get_store_owner_id(store_id) = auth.uid());
CREATE POLICY "instagram_posts_service_all" ON instagram_posts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS trg_instagram_posts_updated_at ON instagram_posts;
CREATE TRIGGER trg_instagram_posts_updated_at
  BEFORE UPDATE ON instagram_posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
