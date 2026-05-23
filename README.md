# Sogra v1

음식점 사장님 대상 AI 마케팅 자동화 SaaS. 상황 버튼 하나로 포스터+릴스+SNS 글 3종 생성 → 최종 산출물 다운로드/캡션 복사 → 사장님이 직접 SNS에 업로드하는 흐름입니다.

## 기술 스택

- **Frontend/Backend:** Next.js 14 App Router + TypeScript
- **DB/Auth:** Supabase (PostgreSQL + RLS)
- **스타일:** Tailwind CSS
- **비동기 잡 큐:** Inngest
- **결제:** Toss Payments

## 로컬 실행

### 1. 환경변수 설정

```bash
cp .env.local.example .env.local
# .env.local 파일을 열어 각 API 키 입력
```

### 2. 의존성 설치

```bash
pnpm install
```

### 3. Supabase 로컬 시작

```bash
supabase start
supabase db reset
```

### 4. 개발 서버 실행

```bash
pnpm dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 접속.

### 5. Inngest 개발 서버 실행 (별도 터미널)

```bash
npx inngest-cli@latest dev
```

## 주요 환경변수

| 변수명 | 설명 |
|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (서버 전용) |
| `INNGEST_SIGNING_KEY` | Inngest signing key |
자세한 내용은 `.env.local.example` 참조.
