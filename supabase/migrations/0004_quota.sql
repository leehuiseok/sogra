-- 0004_quota.sql
-- 매장별 월간 콘텐츠 생성 한도 + 첫 60일 부스트 크레딧 (Plan §Decision 5)

CREATE TABLE IF NOT EXISTS quota_counters (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id                  UUID NOT NULL REFERENCES store_profiles(id) ON DELETE CASCADE,
  month_period              TEXT NOT NULL,  -- 'YYYY-MM' KST 기준
  posters_used              INT NOT NULL DEFAULT 0 CHECK (posters_used >= 0),
  reels_used                INT NOT NULL DEFAULT 0 CHECK (reels_used >= 0),
  boost_credits_remaining   INT NOT NULL DEFAULT 3 CHECK (boost_credits_remaining >= 0),
  boost_expires_at          TIMESTAMPTZ NOT NULL,  -- DEFAULT now() + interval '60 days' (가입 시점 기준)
  quota_refund_count        INT NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, month_period)
);

CREATE INDEX IF NOT EXISTS idx_quota_counters_store_month
  ON quota_counters(store_id, month_period);

ALTER TABLE quota_counters ENABLE ROW LEVEL SECURITY;

-- 자신의 매장 한도만 조회 가능
CREATE POLICY "quota_counters_select_own" ON quota_counters FOR SELECT
  USING (get_store_owner_id(store_id) = auth.uid());
-- INSERT/UPDATE는 service_role 전용 (RPC 내부에서만 수행)
CREATE POLICY "quota_counters_insert_service" ON quota_counters FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "quota_counters_update_service" ON quota_counters FOR UPDATE
  USING (auth.role() = 'service_role');

-- =========================================================
-- RPC: check_and_decrement_quota
-- 반환: { allowed: bool, remaining: int, used_boost: bool, reason: text }
-- 동시성: FOR UPDATE 락으로 race 차단
-- TODO: integration test — 동시 10건 → 정확히 (한도+부스트)만큼 통과
-- =========================================================
CREATE OR REPLACE FUNCTION check_and_decrement_quota(
  p_store_id UUID,
  p_kind     TEXT  -- 'poster' | 'reels' | 'caption'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month        TEXT := current_month_kst();
  v_row          quota_counters%ROWTYPE;
  v_limit        INT;
  v_used         INT;
  v_used_boost   BOOLEAN := false;
BEGIN
  IF p_kind NOT IN ('poster','reels','caption') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', '유효하지 않은 콘텐츠 종류');
  END IF;

  -- caption 은 무제한 → 즉시 통과 (행 없으면 만들지도 않음)
  IF p_kind = 'caption' THEN
    RETURN jsonb_build_object('allowed', true, 'remaining', -1, 'used_boost', false);
  END IF;

  -- upsert + lock: 해당 월 행이 없으면 신규 생성 후 잠금
  INSERT INTO quota_counters (store_id, month_period, boost_expires_at)
    VALUES (p_store_id, v_month, now() + interval '60 days')
    ON CONFLICT (store_id, month_period) DO NOTHING;

  SELECT * INTO v_row FROM quota_counters
    WHERE store_id = p_store_id AND month_period = v_month
    FOR UPDATE;

  IF p_kind = 'poster' THEN
    v_limit := 30; v_used := v_row.posters_used;
  ELSE
    v_limit := 5;  v_used := v_row.reels_used;
  END IF;

  -- 한도 이내 → 차감 후 허용
  IF v_used < v_limit THEN
    IF p_kind = 'poster' THEN
      UPDATE quota_counters SET posters_used = posters_used + 1, updated_at = now()
        WHERE id = v_row.id;
    ELSE
      UPDATE quota_counters SET reels_used = reels_used + 1, updated_at = now()
        WHERE id = v_row.id;
    END IF;
    RETURN jsonb_build_object('allowed', true, 'remaining', v_limit - v_used - 1, 'used_boost', false);
  END IF;

  -- 한도 초과 → 부스트 시도 (릴스만, 60일 내, 크레딧 남음)
  IF p_kind = 'reels'
     AND v_row.boost_credits_remaining > 0
     AND now() <= v_row.boost_expires_at THEN
    UPDATE quota_counters
      SET reels_used = reels_used + 1,
          boost_credits_remaining = boost_credits_remaining - 1,
          updated_at = now()
      WHERE id = v_row.id;
    RETURN jsonb_build_object('allowed', true, 'remaining', 0,
                              'used_boost', true,
                              'boost_left', v_row.boost_credits_remaining - 1);
  END IF;

  -- 한도 초과, 부스트도 불가
  RETURN jsonb_build_object('allowed', false, 'reason', '월간 한도 초과',
                            'limit', v_limit, 'used', v_used);
END;
$$;

-- =========================================================
-- RPC: refund_quota
-- dead_letter 진입 시 호출하여 차감된 한도 복구
-- =========================================================
CREATE OR REPLACE FUNCTION refund_quota(
  p_store_id UUID,
  p_kind     TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month TEXT := current_month_kst();
BEGIN
  IF p_kind = 'poster' THEN
    UPDATE quota_counters
      SET posters_used = GREATEST(posters_used - 1, 0),
          quota_refund_count = quota_refund_count + 1,
          updated_at = now()
      WHERE store_id = p_store_id AND month_period = v_month;
  ELSIF p_kind = 'reels' THEN
    UPDATE quota_counters
      SET reels_used = GREATEST(reels_used - 1, 0),
          quota_refund_count = quota_refund_count + 1,
          updated_at = now()
      WHERE store_id = p_store_id AND month_period = v_month;
  END IF;
  RETURN jsonb_build_object('refunded', true);
END;
$$;
