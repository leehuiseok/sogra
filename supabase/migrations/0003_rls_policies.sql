-- 0003_rls_policies.sql
-- Step 1 범위 RLS 정책: store_profiles + onboarding_funnel_events
-- AC-12, Scenario X3 완화
-- 원칙: store_id FK를 가진 모든 테이블은 매장 단위 격리 강제
-- 나머지 테이블 정책은 해당 테이블 생성 migration 이후 단계에서 추가

-- =========================================================
-- get_store_owner_id 헬퍼 (store_profiles 생성 후 의존)
-- =========================================================
CREATE OR REPLACE FUNCTION get_store_owner_id(p_store_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT owner_id FROM store_profiles WHERE id = p_store_id;
$$;

-- =========================================================
-- store_profiles RLS
-- =========================================================

-- 자신의 프로필만 조회
CREATE POLICY "store_profiles_select_own"
  ON store_profiles FOR SELECT
  USING (owner_id = auth.uid());

-- 자신의 프로필만 삽입 (owner_id는 자신으로 강제)
CREATE POLICY "store_profiles_insert_own"
  ON store_profiles FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- 자신의 프로필만 수정
CREATE POLICY "store_profiles_update_own"
  ON store_profiles FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- 자신의 프로필만 삭제
CREATE POLICY "store_profiles_delete_own"
  ON store_profiles FOR DELETE
  USING (owner_id = auth.uid());

-- =========================================================
-- onboarding_funnel_events RLS
-- =========================================================

CREATE POLICY "onboarding_events_select_own"
  ON onboarding_funnel_events FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "onboarding_events_insert_own"
  ON onboarding_funnel_events FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- 수정/삭제 불가 (이벤트 로그는 불변)

-- =========================================================
-- 이하 테이블 RLS 정책은 해당 테이블 생성 migration에서 추가
-- quota_counters       → 0004_quota.sql
-- subscriptions        → 0005_subscriptions.sql
-- situation_triggers   → 0006_situation_triggers.sql
-- marketing_contents   → 0007_marketing_contents.sql
-- media_generation_jobs → 0008_media_generation_jobs.sql
-- instagram_posts      → 0009_instagram_posts.sql
-- insights             → 0010_insights.sql
-- baseline_insight_windows → 0011_baseline_windows.sql
-- payment_events       → 0012_payment_events.sql
-- nlu_parse_events     → 0006_situation_triggers.sql
-- =========================================================
