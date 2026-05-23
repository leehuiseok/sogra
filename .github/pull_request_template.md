## 변경 요약

## 영향 범위

## 체크리스트

- [ ] 새 테이블/컬럼이 추가됐다면 RLS 정책이 동반된다
- [ ] 새 테이블이 추가됐다면 `supabase/tests/rls.test.sql`에 cross-access deny assertion이 추가됐다 (RI-7)
- [ ] 새 환경변수가 추가됐다면 `.env.local.example`에 placeholder가 추가됐다
- [ ] service_role 키는 클라이언트 번들에 포함되지 않는다 (`lib/supabase/server.ts` 또는 Route Handler 전용)
- [ ] AI 호출이 추가됐다면 `lib/storage/persist-asset.ts`로 외부 URL을 24h 내 rehost한다 (RI-3)
