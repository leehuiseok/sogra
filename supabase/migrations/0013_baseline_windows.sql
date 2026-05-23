-- 0013_baseline_windows.sql
-- 베이스라인 인사이트 윈도우 — 가입 직후 30일 IG 데이터 캡처 (Plan §AC-11 / RI-5)
-- 분기 4종: captured / insufficient / new_account / not_applicable

CREATE TABLE IF NOT EXISTS baseline_insight_windows (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id            UUID NOT NULL UNIQUE REFERENCES store_profiles(id) ON DELETE CASCADE,
  status              TEXT NOT NULL CHECK (status IN ('captured','insufficient','new_account','not_applicable')),
  -- captured 분기에서만 채워지는 평균 지표
  baseline_likes_avg  NUMERIC(10,3),
  baseline_reach_avg  NUMERIC(10,3),
  baseline_saves_avg  NUMERIC(10,3),
  -- captured/insufficient: 실제 표본(최근 30일 게시 수)
  posts_sampled       INT,
  sample_window_start TIMESTAMPTZ,
  sample_window_end   TIMESTAMPTZ,
  -- new_account 판단용 IG 계정 연령(일)
  ig_account_age_days INT,
  -- 한국어 UX 메시지 (status_reason)
  status_reason       TEXT,
  captured_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- status 인덱스 (배치 모니터링·집계용)
CREATE INDEX IF NOT EXISTS idx_baseline_status
  ON baseline_insight_windows(status);

-- RLS — 본인 매장만 조회, 서비스 롤은 전부
ALTER TABLE baseline_insight_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "baseline_select_own" ON baseline_insight_windows FOR SELECT
  USING (get_store_owner_id(store_id) = auth.uid());

CREATE POLICY "baseline_service_all" ON baseline_insight_windows FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- updated_at 자동 갱신
DROP TRIGGER IF EXISTS trg_baseline_windows_updated_at ON baseline_insight_windows;
CREATE TRIGGER trg_baseline_windows_updated_at
  BEFORE UPDATE ON baseline_insight_windows
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
