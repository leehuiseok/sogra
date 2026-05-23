'use client'

export type OverseasConsentCheckboxProps = {
  checked: boolean
  onChange: (checked: boolean) => void
}

const THIRD_PARTIES = [
  { name: 'OpenAI / Anthropic', country: '미국' },
  { name: 'Runway', country: '미국' },
  { name: 'Meta', country: '미국' },
  { name: 'Toss Payments', country: '한국' },
  { name: 'Inngest', country: '미국' },
]

export default function OverseasConsentCheckbox({ checked, onChange }: OverseasConsentCheckboxProps) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
      <p className="text-sm text-gray-700 mb-3">
        <span className="font-semibold text-red-600">[필수]</span>{' '}
        서비스 제공을 위해 일부 정보가 미국 소재 업체(OpenAI/Anthropic·Runway·Inngest)에 전송됩니다.
        동의하지 않으면 서비스 이용이 불가합니다.
      </p>

      <details className="mb-4">
        <summary className="text-xs text-orange-600 cursor-pointer hover:underline select-none">
          제3자 제공 업체 상세 보기
        </summary>
        <ul className="mt-2 space-y-1">
          {THIRD_PARTIES.map((party) => (
            <li key={party.name} className="text-xs text-gray-600 flex justify-between">
              <span>{party.name}</span>
              <span className="text-gray-400">{party.country}</span>
            </li>
          ))}
        </ul>
      </details>

      <label htmlFor="overseas-consent" className="flex items-center gap-2 cursor-pointer">
        <input
          id="overseas-consent"
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-required="true"
          className="w-4 h-4 accent-orange-500"
        />
        <span className="text-sm font-medium text-gray-800">
          해외 업체로의 정보 전송에 동의합니다.
        </span>
      </label>
    </div>
  )
}
