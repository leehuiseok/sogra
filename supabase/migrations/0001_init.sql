-- 0001_init.sql
-- pgcrypto 확장 + 공통 헬퍼 함수

-- pgcrypto: gen_random_uuid(), crypt(), digest() 등 암호화 함수 제공
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- citext: 대소문자 구분 없는 텍스트 (이메일 비교 등)
CREATE EXTENSION IF NOT EXISTS citext;

-- pgtap: SQL 단위 테스트 프레임워크
CREATE EXTENSION IF NOT EXISTS pgtap;

-- pg_stat_statements: 쿼리 성능 모니터링 (선택)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- =========================================================
-- 공통 헬퍼: updated_at 자동 갱신 트리거 함수
-- =========================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================
-- 공통 헬퍼: idempotency_key 생성 (sha256 기반)
-- sha256(store_id || trigger_id || content_kind || month_period)
-- media_generation_jobs에서 ghost-job 방지용으로 사용
-- =========================================================
CREATE OR REPLACE FUNCTION generate_idempotency_key(
  p_store_id   UUID,
  p_trigger_id UUID,
  p_kind       TEXT,
  p_period     TEXT   -- 'YYYY-MM' 형식
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN encode(
    digest(
      p_store_id::TEXT || p_trigger_id::TEXT || p_kind || p_period,
      'sha256'
    ),
    'hex'
  );
END;
$$;

-- =========================================================
-- 공통 헬퍼: KST 자정 기준 월 period 문자열 반환
-- 한도 카운터 월별 롤오버에서 사용
-- =========================================================
CREATE OR REPLACE FUNCTION current_month_kst()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM');
$$;

-- =========================================================
-- 공통 헬퍼: 구독 만료 여부 확인
-- =========================================================
CREATE OR REPLACE FUNCTION is_subscription_active(p_expires_at TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT now() < p_expires_at;
$$;
