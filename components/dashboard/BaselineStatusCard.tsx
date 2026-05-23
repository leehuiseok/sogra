// components/dashboard/BaselineStatusCard.tsx
// 베이스라인 인사이트 상태 카드 — 가입 직후 30일 IG 데이터 4분기 표시 (Plan §AC-11 / RI-5)
//
// status 별 한국어 UX 메시지:
//   - captured       : "베이스라인 캡처 완료" + 평균 likes/reach/saves 표시
//   - insufficient   : "30일 데이터가 누적되면 측정을 시작해요"
//   - new_account    : "사용 시작 30일 후 측정 가능"
//   - not_applicable : "비즈니스 계정 전환 후 측정 시작"
//
// Step 6 통합 시 대시보드에 mount.

import type { Database } from '@/lib/supabase/types'

type BaselineRow = Database['public']['Tables']['baseline_insight_windows']['Row']

export interface BaselineStatusCardProps {
  // 아직 캡처 시도조차 안 된 매장은 row 가 없을 수 있음 → null 허용
  baseline: BaselineRow | null
}

const STATUS_COPY: Record<
  BaselineRow['status'] | 'pending',
  { title: string; description: string; tone: 'positive' | 'neutral' | 'muted' }
> = {
  captured: {
    title: '베이스라인 캡처 완료',
    description: '최근 30일 평균을 기준선으로 측정을 시작합니다.',
    tone: 'positive',
  },
  insufficient: {
    title: '아직 측정 준비 중',
    description: '30일 데이터가 누적되면 측정을 시작해요.',
    tone: 'neutral',
  },
  new_account: {
    title: '계정 사용 기간이 짧아요',
    description: '사용 시작 30일 후 측정 가능합니다.',
    tone: 'neutral',
  },
  not_applicable: {
    title: '비즈니스 계정이 필요해요',
    description: '비즈니스 계정 전환 후 측정 시작.',
    tone: 'muted',
  },
  pending: {
    title: '베이스라인 측정 대기 중',
    description: '곧 자동으로 데이터를 수집합니다.',
    tone: 'muted',
  },
}

export function BaselineStatusCard({ baseline }: BaselineStatusCardProps) {
  const statusKey: BaselineRow['status'] | 'pending' =
    baseline?.status ?? 'pending'
  const copy = STATUS_COPY[statusKey]

  return (
    <section
      data-status={statusKey}
      data-tone={copy.tone}
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 16,
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
          {copy.title}
        </h3>
        <p style={{ margin: 0, fontSize: 13, color: '#4b5563' }}>
          {baseline?.status_reason ?? copy.description}
        </p>
      </header>

      {baseline?.status === 'captured' && (
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
            margin: 0,
          }}
        >
          <Metric label="평균 좋아요" value={baseline.baseline_likes_avg} />
          <Metric label="평균 도달" value={baseline.baseline_reach_avg} />
          <Metric label="평균 저장" value={baseline.baseline_saves_avg} />
        </dl>
      )}

      {baseline?.status === 'insufficient' &&
        typeof baseline.posts_sampled === 'number' && (
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
            지난 30일 게시물 {baseline.posts_sampled}개 · 10개 이상 누적되면
            기준선이 캡처돼요.
          </p>
        )}

      {baseline?.status === 'new_account' &&
        typeof baseline.ig_account_age_days === 'number' && (
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
            계정 사용 {baseline.ig_account_age_days}일째 · 30일 이후 자동 측정
            시작.
          </p>
        )}
    </section>
  )
}

function Metric({
  label,
  value,
}: {
  label: string
  value: number | null
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: '8px 10px',
        background: '#f9fafb',
        borderRadius: 8,
      }}
    >
      <dt style={{ fontSize: 11, color: '#6b7280' }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111827' }}>
        {value === null ? '—' : formatNumber(value)}
      </dd>
    </div>
  )
}

function formatNumber(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}K`
  }
  // 소수 첫 자리까지 (정수면 정수 표기)
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
