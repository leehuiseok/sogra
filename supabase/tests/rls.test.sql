-- rls.test.sql
-- RLS 매장 단위 격리 검증 테스트 스위트 (32 assertion)
-- 대상: store_profiles + onboarding_funnel_events (Step 1 scope)
-- 실행: psql -h localhost -p 54322 -U postgres -d postgres -f supabase/tests/rls.test.sql

BEGIN;

SELECT plan(32);

-- =========================================================
-- Helper: JWT claims + role 설정
-- =========================================================
CREATE OR REPLACE FUNCTION set_auth(uid uuid) RETURNS void AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- 픽스처: 테스트 유저 2명 (service role로 직접 삽입)
-- =========================================================
RESET role;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, role
)
VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    'owner-a@test.com',
    crypt('pw', gen_salt('bf')),
    now(), now(), now(), '{}', '{}', false, 'authenticated'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'owner-b@test.com',
    crypt('pw', gen_salt('bf')),
    now(), now(), now(), '{}', '{}', false, 'authenticated'
  )
ON CONFLICT (id) DO NOTHING;

-- owner_a 프로필 삽입 (authenticated + RLS 통과)
SET LOCAL role = authenticated;
SELECT set_auth('11111111-1111-1111-1111-111111111111');

INSERT INTO public.store_profiles (
  id, owner_id, category, store_name, address
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'cafe', 'Cafe A', '서울시 마포구'
);

-- owner_b 프로필 삽입
SELECT set_auth('22222222-2222-2222-2222-222222222222');

INSERT INTO public.store_profiles (
  id, owner_id, category, store_name, address
) VALUES (
  'bbbbbbbb-0000-0000-0000-000000000002',
  '22222222-2222-2222-2222-222222222222',
  'restaurant', '식당 B', '서울시 강남구'
);

-- owner_a funnel event 삽입
SELECT set_auth('11111111-1111-1111-1111-111111111111');
INSERT INTO public.onboarding_funnel_events (owner_id, step, event_type)
VALUES ('11111111-1111-1111-1111-111111111111', 1, 'enter');

-- owner_b funnel event 삽입
SELECT set_auth('22222222-2222-2222-2222-222222222222');
INSERT INTO public.onboarding_funnel_events (owner_id, step, event_type)
VALUES ('22222222-2222-2222-2222-222222222222', 1, 'enter');

-- =========================================================
-- [1-4] 스키마 구조 검증
-- =========================================================

RESET role;

-- T1: store_profiles 테이블 존재
SELECT has_table('public', 'store_profiles', 'T1: store_profiles table exists');

-- T2: onboarding_funnel_events 테이블 존재
SELECT has_table('public', 'onboarding_funnel_events', 'T2: onboarding_funnel_events table exists');

-- T3: store_profiles RLS 활성화
SELECT ok(
  (SELECT rowsecurity FROM pg_tables
   WHERE schemaname = 'public' AND tablename = 'store_profiles'),
  'T3: store_profiles RLS is enabled'
);

-- T4: onboarding_funnel_events RLS 활성화
SELECT ok(
  (SELECT rowsecurity FROM pg_tables
   WHERE schemaname = 'public' AND tablename = 'onboarding_funnel_events'),
  'T4: onboarding_funnel_events RLS is enabled'
);

-- =========================================================
-- [5-8] RLS 정책 존재 확인
-- =========================================================

-- T5: store_profiles 4개 이상 정책
SELECT cmp_ok(
  (SELECT count(*)::int FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'store_profiles'),
  '>=', 4,
  'T5: store_profiles has 4+ RLS policies'
);

-- T6: store_profiles SELECT 정책 존재
SELECT cmp_ok(
  (SELECT count(*)::int FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'store_profiles' AND cmd = 'SELECT'),
  '>=', 1,
  'T6: store_profiles SELECT policy exists'
);

-- T7: onboarding_funnel_events SELECT 정책 존재
SELECT cmp_ok(
  (SELECT count(*)::int FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'onboarding_funnel_events' AND cmd = 'SELECT'),
  '>=', 1,
  'T7: onboarding_funnel_events SELECT policy exists'
);

-- T8: onboarding_funnel_events INSERT 정책 존재
SELECT cmp_ok(
  (SELECT count(*)::int FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'onboarding_funnel_events' AND cmd = 'INSERT'),
  '>=', 1,
  'T8: onboarding_funnel_events INSERT policy exists'
);

-- =========================================================
-- [9-12] owner_a 본인 데이터 접근 허용
-- =========================================================

SET LOCAL role = authenticated;
SELECT set_auth('11111111-1111-1111-1111-111111111111');

-- T9: owner_a는 자신의 프로필 1개만 본다
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.store_profiles),
  '=', 1,
  'T9: owner_a sees exactly 1 profile (own)'
);

-- T10: owner_a는 자신의 store_name을 정확히 읽는다
SELECT cmp_ok(
  (SELECT store_name FROM public.store_profiles
   WHERE owner_id = '11111111-1111-1111-1111-111111111111'),
  '=', 'Cafe A',
  'T10: owner_a reads own store_name correctly'
);

-- T11: owner_a는 자신의 funnel event 1개만 본다
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.onboarding_funnel_events),
  '=', 1,
  'T11: owner_a sees exactly 1 funnel event (own)'
);

-- T12: owner_a는 자신의 프로필을 UPDATE 할 수 있다
UPDATE public.store_profiles
SET store_name = 'Cafe A Updated'
WHERE owner_id = '11111111-1111-1111-1111-111111111111';

SELECT cmp_ok(
  (SELECT store_name FROM public.store_profiles
   WHERE owner_id = '11111111-1111-1111-1111-111111111111'),
  '=', 'Cafe A Updated',
  'T12: owner_a can UPDATE own profile'
);

-- =========================================================
-- [13-17] cross-store 차단
-- =========================================================

SELECT set_auth('22222222-2222-2222-2222-222222222222');

-- T13: owner_b는 owner_a 프로필을 볼 수 없다
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.store_profiles
   WHERE owner_id = '11111111-1111-1111-1111-111111111111'),
  '=', 0,
  'T13: owner_b CANNOT see owner_a profile (cross-store deny)'
);

-- T14: owner_b는 전체 조회 시 자신 것 1개만 본다
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.store_profiles),
  '=', 1,
  'T14: owner_b sees only own profile (total=1)'
);

-- T15: owner_b는 owner_a funnel event를 볼 수 없다
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.onboarding_funnel_events
   WHERE owner_id = '11111111-1111-1111-1111-111111111111'),
  '=', 0,
  'T15: owner_b CANNOT see owner_a funnel events (cross-store deny)'
);

-- T16: owner_b가 owner_a 프로필 UPDATE 시도 → 0 rows affected (RLS 필터링)
UPDATE public.store_profiles
SET store_name = 'HACKED'
WHERE owner_id = '11111111-1111-1111-1111-111111111111';

RESET role;
SELECT cmp_ok(
  (SELECT store_name FROM public.store_profiles
   WHERE owner_id = '11111111-1111-1111-1111-111111111111'),
  '=', 'Cafe A Updated',
  'T16: owner_b UPDATE on owner_a blocked (0 rows, value unchanged)'
);

-- T17: owner_b가 owner_a 프로필 DELETE 시도 → 0 rows affected
SET LOCAL role = authenticated;
SELECT set_auth('22222222-2222-2222-2222-222222222222');

DELETE FROM public.store_profiles
WHERE owner_id = '11111111-1111-1111-1111-111111111111';

RESET role;
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.store_profiles
   WHERE owner_id = '11111111-1111-1111-1111-111111111111'),
  '=', 1,
  'T17: owner_b DELETE on owner_a blocked (row still exists)'
);

-- =========================================================
-- [18-21] cross-store INSERT 차단 (WITH CHECK → 42501)
-- =========================================================

SET LOCAL role = authenticated;
SELECT set_auth('22222222-2222-2222-2222-222222222222');

-- T18: owner_b가 owner_a owner_id로 INSERT → 42501
SELECT throws_ok(
  $$INSERT INTO public.store_profiles (owner_id, category, store_name, address)
    VALUES ('11111111-1111-1111-1111-111111111111', 'cafe', 'Hack', 'hack')$$,
  '42501',
  NULL,
  'T18: owner_b INSERT with owner_a id blocked (42501)'
);

-- T19: owner_b 중복 INSERT → UNIQUE 위반 (23505)
SELECT throws_ok(
  $$INSERT INTO public.store_profiles (owner_id, category, store_name, address)
    VALUES ('22222222-2222-2222-2222-222222222222', 'delivery', 'Dup B', 'addr')$$,
  '23505',
  NULL,
  'T19: duplicate owner INSERT blocked by UNIQUE constraint (23505)'
);

-- T20: owner_a funnel event 추가 INSERT 정상
SELECT set_auth('11111111-1111-1111-1111-111111111111');

SELECT lives_ok(
  $$INSERT INTO public.onboarding_funnel_events (owner_id, step, event_type)
    VALUES ('11111111-1111-1111-1111-111111111111', 2, 'complete')$$,
  'T20: owner_a can INSERT own funnel event'
);

-- T21: owner_b가 owner_a owner_id로 funnel event INSERT → 42501
SELECT set_auth('22222222-2222-2222-2222-222222222222');

SELECT throws_ok(
  $$INSERT INTO public.onboarding_funnel_events (owner_id, step, event_type)
    VALUES ('11111111-1111-1111-1111-111111111111', 3, 'complete')$$,
  '42501',
  NULL,
  'T21: owner_b INSERT funnel event with owner_a id blocked (42501)'
);

-- =========================================================
-- [22-25] anon role 전체 차단
-- =========================================================

-- jwt claims 초기화 후 anon role로 전환
SELECT set_config('request.jwt.claims', '{}', true);
SET LOCAL role = anon;

-- T22: anon SELECT store_profiles → 0 rows
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.store_profiles),
  '=', 0,
  'T22: anon SELECT on store_profiles returns 0 rows'
);

-- T23: anon INSERT store_profiles → 42501
SELECT throws_ok(
  $$INSERT INTO public.store_profiles (owner_id, category, store_name, address)
    VALUES (gen_random_uuid(), 'cafe', 'Anon', 'addr')$$,
  '42501',
  NULL,
  'T23: anon INSERT on store_profiles blocked (42501)'
);

-- T24: anon SELECT onboarding_funnel_events → 0 rows
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.onboarding_funnel_events),
  '=', 0,
  'T24: anon SELECT on onboarding_funnel_events returns 0 rows'
);

-- T25: anon INSERT onboarding_funnel_events → 42501
SELECT throws_ok(
  $$INSERT INTO public.onboarding_funnel_events (owner_id, step, event_type)
    VALUES (gen_random_uuid(), 1, 'enter')$$,
  '42501',
  NULL,
  'T25: anon INSERT on onboarding_funnel_events blocked (42501)'
);

-- =========================================================
-- [26-29] CHECK constraint 검증
-- =========================================================

SET LOCAL role = authenticated;
SELECT set_auth('11111111-1111-1111-1111-111111111111');

-- T26: 유효하지 않은 category → 23514
SELECT throws_ok(
  $$INSERT INTO public.store_profiles (owner_id, category, store_name, address)
    VALUES ('11111111-1111-1111-1111-111111111111', 'invalid_cat', 'x', 'x')$$,
  '23514',
  NULL,
  'T26: invalid category value blocked by CHECK (23514)'
);

-- T27: menus 4개 이상 → 23514
SELECT throws_ok(
  $$UPDATE public.store_profiles
    SET menus = '[{"name":"a"},{"name":"b"},{"name":"c"},{"name":"d"}]'::jsonb
    WHERE owner_id = '11111111-1111-1111-1111-111111111111'$$,
  '23514',
  NULL,
  'T27: menus length > 3 blocked by CHECK (23514)'
);

-- T28: tone_keywords 4개 이상 → 23514
SELECT throws_ok(
  $$UPDATE public.store_profiles
    SET tone_keywords = '["a","b","c","d"]'::jsonb
    WHERE owner_id = '11111111-1111-1111-1111-111111111111'$$,
  '23514',
  NULL,
  'T28: tone_keywords length > 3 blocked by CHECK (23514)'
);

-- T29: 잘못된 event_type → 23514
SELECT throws_ok(
  $$INSERT INTO public.onboarding_funnel_events (owner_id, step, event_type)
    VALUES ('11111111-1111-1111-1111-111111111111', 1, 'invalid_event')$$,
  '23514',
  NULL,
  'T29: invalid event_type blocked by CHECK (23514)'
);

-- =========================================================
-- [30-32] 헬퍼 함수 + 트리거 검증
-- =========================================================

RESET role;

-- T30: updated_at 트리거 존재
SELECT ok(
  (SELECT count(*) = 1 FROM pg_trigger
   WHERE tgname = 'trg_store_profiles_updated_at'
     AND tgrelid = 'public.store_profiles'::regclass),
  'T30: updated_at trigger exists on store_profiles'
);

-- T31: generate_idempotency_key 멱등성
SELECT ok(
  (
    generate_idempotency_key(
      '11111111-1111-1111-1111-111111111111'::uuid,
      '22222222-2222-2222-2222-222222222222'::uuid,
      'reels', '2026-05'
    ) =
    generate_idempotency_key(
      '11111111-1111-1111-1111-111111111111'::uuid,
      '22222222-2222-2222-2222-222222222222'::uuid,
      'reels', '2026-05'
    )
  ),
  'T31: generate_idempotency_key is idempotent for same inputs'
);

-- T32: current_month_kst() YYYY-MM 형식 반환
SELECT ok(
  (current_month_kst() ~ '^\d{4}-\d{2}$'),
  'T32: current_month_kst returns YYYY-MM format'
);

-- =========================================================
SELECT * FROM finish();
ROLLBACK;
