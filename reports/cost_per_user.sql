-- reports/cost_per_user.sql
-- 사용자당 월간 비용 분석 (Plan §2.5 / §7 #12)
-- AI 비용 + 스토리지 egress ≈ ₩40/user/month 목표
--
-- 스토리지 egress 추정:
--   릴스 5편 × 50MB + 포스터 30개 × 2MB = 310MB/user/month
--   ₩ = 310MB / 1024 × $0.09/GB × 1380 KRW/USD ≈ ₩37.7 → ₩40 (반올림)
-- AI 비용:
--   marketing_contents.cost_usd 컬럼 합계 → KRW 환산
-- 환율: 1USD = 1380 KRW (cost-per-user.ts DEFAULT_USD_KRW_RATE 와 동기화)

-- =========================================================
-- 월별 사용자당 AI 비용 집계
-- =========================================================
WITH monthly_ai_cost AS (
  SELECT
    sp.id                                                             AS store_id,
    sp.store_name,
    sp.category,
    to_char(mc.created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')      AS month_period,
    -- AI 비용 합계 (USD)
    COALESCE(SUM(mc.cost_usd), 0)                                     AS ai_cost_usd,
    -- KRW 환산 (환율 1380)
    ROUND(COALESCE(SUM(mc.cost_usd), 0) * 1380)                      AS ai_cost_krw,
    COUNT(*) FILTER (WHERE mc.kind = 'poster')                        AS posters_generated,
    COUNT(*) FILTER (WHERE mc.kind = 'reels')                         AS reels_generated,
    COUNT(*) FILTER (WHERE mc.kind = 'caption')                       AS captions_generated,
    COUNT(*)                                                           AS total_contents
  FROM store_profiles sp
  LEFT JOIN marketing_contents mc
    ON mc.store_id = sp.id
    AND mc.status NOT IN ('failed')
  GROUP BY sp.id, sp.store_name, sp.category,
           to_char(mc.created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')
),
-- =========================================================
-- 스토리지 egress 추정
-- 릴스 5편 × 50MB + 포스터 30개 × 2MB = 310MB/user/month
-- $0.09/GB × 1380 KRW/USD = ₩124.2/GB → 310MB/1024GB × ₩124.2 ≈ ₩37.6
-- =========================================================
storage_egress_estimate AS (
  SELECT
    mac.store_id,
    mac.month_period,
    -- 실제 생성된 릴스·포스터 수 기준 egress 추정 (한도까지 생성된 경우 최대치)
    ROUND(
      (
        (LEAST(mac.reels_generated,   5)  * 50.0)   -- 릴스: 편당 50MB
        + (LEAST(mac.posters_generated, 30) * 2.0)   -- 포스터: 장당 2MB
      ) / 1024.0                                       -- MB → GB
      * 0.09                                           -- $0.09/GB (Supabase Storage egress)
      * 1380                                           -- USD → KRW
    )                                                  AS storage_egress_krw
  FROM monthly_ai_cost mac
)
-- =========================================================
-- 최종 집계: AI 비용 + 스토리지 egress = 사용자당 총 비용
-- =========================================================
SELECT
  mac.store_id,
  mac.store_name,
  mac.category,
  mac.month_period,
  mac.posters_generated,
  mac.reels_generated,
  mac.captions_generated,
  mac.total_contents,
  mac.ai_cost_usd,
  mac.ai_cost_krw,
  COALESCE(see.storage_egress_krw, 0)                               AS storage_egress_krw,
  mac.ai_cost_krw + COALESCE(see.storage_egress_krw, 0)            AS total_cost_krw,
  -- 목표 대비 비율 (목표: ₩40/user/month)
  ROUND(
    (mac.ai_cost_krw + COALESCE(see.storage_egress_krw, 0))::numeric
    / 40.0 * 100,
    1
  )                                                                  AS pct_of_target_40krw
FROM monthly_ai_cost mac
LEFT JOIN storage_egress_estimate see
  ON see.store_id  = mac.store_id
  AND see.month_period = mac.month_period
WHERE mac.month_period IS NOT NULL
ORDER BY mac.month_period DESC, total_cost_krw DESC;

-- =========================================================
-- 월 요약: 전체 평균 사용자당 비용
-- =========================================================
WITH monthly_summary AS (
  SELECT
    to_char(mc.created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')   AS month_period,
    COUNT(DISTINCT mc.store_id)                                     AS active_stores,
    ROUND(COALESCE(SUM(mc.cost_usd), 0) * 1380)                   AS total_ai_cost_krw,
    -- 스토리지 egress: 활성 매장당 ₩40 중 AI 제외분 (₩40 - AI 평균)
    COUNT(DISTINCT mc.store_id) * 38                               AS estimated_storage_total_krw
  FROM marketing_contents mc
  WHERE mc.status NOT IN ('failed')
  GROUP BY 1
)
SELECT
  month_period,
  active_stores,
  total_ai_cost_krw,
  estimated_storage_total_krw,
  total_ai_cost_krw + estimated_storage_total_krw                  AS total_infra_cost_krw,
  ROUND(
    (total_ai_cost_krw + estimated_storage_total_krw)::numeric
    / NULLIF(active_stores, 0),
    0
  )                                                                 AS avg_cost_per_user_krw,
  -- ₩40 목표 달성 여부
  CASE
    WHEN ROUND(
      (total_ai_cost_krw + estimated_storage_total_krw)::numeric
      / NULLIF(active_stores, 0), 0
    ) <= 40 THEN 'PASS'
    ELSE 'OVER_BUDGET'
  END                                                               AS budget_status
FROM monthly_summary
ORDER BY month_period DESC;
