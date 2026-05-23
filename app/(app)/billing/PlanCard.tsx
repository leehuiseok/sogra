const PLAN_FEATURES = [
  '포스터 30장/월',
  '릴스 5개/월 (60일 부스트 크레딧 3회 포함)',
  '캡션 무제한',
  '최종 산출물 다운로드와 캡션 복사',
]

export default function PlanCard() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-gray-900">소그라 스탠다드</h3>
          <p className="text-xs text-gray-500 mt-0.5">v1 단일 플랜</p>
        </div>
        <div className="text-right">
          <span className="text-xl font-bold text-gray-900">49,000원</span>
          <span className="text-sm text-gray-500">/월</span>
        </div>
      </div>
      <ul className="space-y-2">
        {PLAN_FEATURES.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-gray-700">
            <svg
              className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            {feature}
          </li>
        ))}
      </ul>
    </div>
  )
}
