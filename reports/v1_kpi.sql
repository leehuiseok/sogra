-- reports/v1_kpi.sql
-- V1 핵심 KPI 대시보드 쿼리
-- 집계 기준: KST 기준 최근 30일 (DAU, 사용자당 콘텐츠 수, composite_score 베이스라인 대비 차이, 쿼터 소진율, 결제 활성화율)

-- =========================================================
-- 1. DAU (일간 활성 사용자) — 최근 30일 일별 추세
-- marketing_contents 생성 기준 활성 사용자 집계
-- =========================================================
WITH daily_active AS (
  SELECT
    date_trunc('day', mc.created_at AT TIME ZONE 'Asia/Seoul') AS day_kst,
    COUNT(DISTINCT mc.store_id)                                  AS dau
  FROM marketing_contents mc
  WHERE mc.created_at >= now() - interval '30 days'
    AND mc.status NOT IN ('failed')
  GROUP BY 1
)
SELECT
  day_kst,
  dau,
  -- 7일 이동 평균
  AVG(dau) OVER (ORDER BY day_kst ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS dau_7d_avg
FROM daily_active
ORDER BY day_kst DESC;

-- =========================================================
-- 2. 사용자당 월간 콘텐츠 생성 수
-- 현재 KST 월 기준, 매장별 포스터+릴스 생성 건수
-- =========================================================
SELECT
  sp.id                                                          AS store_id,
  sp.store_name,
  sp.category,
  COALESCE(qc.posters_used, 0)                                  AS posters_used,
  COALESCE(qc.reels_used, 0)                                    AS reels_used,
  COALESCE(qc.posters_used, 0) + COALESCE(qc.reels_used, 0)    AS total_contents,
  -- 한도 대비 사용률 (포스터 30개, 릴스 5개 기준)
  ROUND((COALESCE(qc.posters_used, 0)::numeric / 30) * 100, 1) AS poster_usage_pct,
  ROUND((COALESCE(qc.reels_used, 0)::numeric  / 5)  * 100, 1) AS reels_usage_pct
FROM store_profiles sp
LEFT JOIN quota_counters qc
  ON qc.store_id = sp.id
  AND qc.month_period = to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')
ORDER BY total_contents DESC;

-- =========================================================
-- 3. composite_score 베이스라인 대비 차이
-- 공식: 0.4×likes_delta + 0.4×reach_delta + 0.2×saves_delta (Plan §7 #13)
-- 베이스라인: baseline_insight_windows.baseline_*_avg
-- 실적: instagram_post_insights h24 window 평균
-- =========================================================
WITH baseline AS (
  SELECT
    bw.store_id,
    bw.baseline_likes_avg,
    bw.baseline_reach_avg,
    bw.baseline_saves_avg
  FROM baseline_insight_windows bw
  WHERE bw.status = 'captured'
),
recent_performance AS (
  -- 최근 30일 게시된 포스트의 h24 인사이트 평균
  SELECT
    ip.store_id,
    AVG(ipi.likes)  AS avg_likes,
    AVG(ipi.reach)  AS avg_reach,
    AVG(ipi.saves)  AS avg_saves,
    COUNT(*)        AS posts_measured
  FROM instagram_posts ip
  JOIN instagram_post_insights ipi
    ON ipi.post_id = ip.id AND ipi.window_label = 'h24'
  WHERE ip.posted_at >= now() - interval '30 days'
  GROUP BY ip.store_id
)
SELECT
  sp.id                                                              AS store_id,
  sp.store_name,
  b.baseline_likes_avg,
  b.baseline_reach_avg,
  b.baseline_saves_avg,
  rp.avg_likes,
  rp.avg_reach,
  rp.avg_saves,
  rp.posts_measured,
  -- 델타 (실적 - 베이스라인)
  ROUND(rp.avg_likes - b.baseline_likes_avg, 3)                    AS likes_delta,
  ROUND(rp.avg_reach - b.baseline_reach_avg, 3)                    AS reach_delta,
  ROUND(rp.avg_saves - b.baseline_saves_avg, 3)                    AS saves_delta,
  -- composite_score: 0.4×likes_delta + 0.4×reach_delta + 0.2×saves_delta
  ROUND(
    0.4 * (rp.avg_likes - b.baseline_likes_avg)
    + 0.4 * (rp.avg_reach - b.baseline_reach_avg)
    + 0.2 * (rp.avg_saves - b.baseline_saves_avg),
    3
  )                                                                  AS composite_score
FROM store_profiles sp
JOIN baseline b       ON b.store_id = sp.id
JOIN recent_performance rp ON rp.store_id = sp.id
ORDER BY composite_score DESC;

-- =========================================================
-- 4. 쿼터 소진율 — 현재 월 포스터+릴스 한도 사용 비율 분포
-- =========================================================
SELECT
  CASE
    WHEN usage_pct >= 90 THEN '90-100%'
    WHEN usage_pct >= 70 THEN '70-89%'
    WHEN usage_pct >= 50 THEN '50-69%'
    WHEN usage_pct >= 30 THEN '30-49%'
    ELSE '0-29%'
  END                           AS usage_bucket,
  COUNT(*)                      AS store_count,
  ROUND(AVG(usage_pct), 1)      AS avg_usage_pct
FROM (
  SELECT
    sp.id,
    -- 통합 소진율: (poster_used/30 + reels_used/5) / 2 × 100
    ROUND(
      (
        (COALESCE(qc.posters_used, 0)::numeric / 30)
        + (COALESCE(qc.reels_used, 0)::numeric  / 5)
      ) / 2.0 * 100,
      1
    ) AS usage_pct
  FROM store_profiles sp
  LEFT JOIN quota_counters qc
    ON qc.store_id = sp.id
    AND qc.month_period = to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')
) quota_stats
GROUP BY 1
ORDER BY MIN(usage_pct) DESC;

-- =========================================================
-- 5. 결제 활성화율 — 전체 사용자 대비 active 구독 비율
-- =========================================================
SELECT
  COUNT(*)                                                            AS total_stores,
  COUNT(*) FILTER (WHERE s.status = 'active')                        AS active_subs,
  COUNT(*) FILTER (WHERE s.status = 'past_due')                      AS past_due_subs,
  COUNT(*) FILTER (WHERE s.status = 'suspended')                     AS suspended_subs,
  COUNT(*) FILTER (WHERE s.status IN ('pending', 'cancelled') OR s.id IS NULL) AS inactive_subs,
  ROUND(
    COUNT(*) FILTER (WHERE s.status = 'active')::numeric
    / NULLIF(COUNT(*), 0) * 100,
    1
  )                                                                   AS billing_active_pct
FROM store_profiles sp
LEFT JOIN subscriptions s ON s.owner_id = sp.owner_id;
