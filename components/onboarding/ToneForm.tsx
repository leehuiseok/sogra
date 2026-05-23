'use client'

import { useState } from 'react'

export type ToneFormProps = {
  value: string[]
  onChange: (value: string[]) => void
}

const TONE_CHIPS = ['친근한', '재미있는', '정직한', '세련된', '따뜻한', '유머러스한', '단정한', '감각적인']
const MAX_TONES = 3

export default function ToneForm({ value, onChange }: ToneFormProps) {
  const [customInput, setCustomInput] = useState('')

  function toggleChip(tone: string) {
    if (value.includes(tone)) {
      onChange(value.filter((t) => t !== tone))
    } else if (value.length < MAX_TONES) {
      onChange([...value, tone])
    }
  }

  function addCustom() {
    const trimmed = customInput.trim()
    if (!trimmed || value.includes(trimmed) || value.length >= MAX_TONES) return
    onChange([...value, trimmed])
    setCustomInput('')
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">최대 3개까지 선택할 수 있습니다.</p>

      <div className="flex flex-wrap gap-2">
        {TONE_CHIPS.map((tone) => {
          const selected = value.includes(tone)
          const disabled = !selected && value.length >= MAX_TONES

          return (
            <button
              key={tone}
              type="button"
              onClick={() => toggleChip(tone)}
              disabled={disabled}
              aria-pressed={selected}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                selected
                  ? 'bg-orange-500 border-orange-500 text-white'
                  : disabled
                  ? 'bg-gray-100 border-gray-200 text-gray-300 cursor-not-allowed'
                  : 'bg-white border-gray-300 text-gray-700 hover:border-orange-400'
              }`}
            >
              {tone}
            </button>
          )
        })}
      </div>

      {value.length < MAX_TONES && (
        <div className="flex gap-2">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())}
            placeholder="직접 입력 (예: 고급스러운)"
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <button
            type="button"
            onClick={addCustom}
            disabled={!customInput.trim()}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-200 text-white text-sm font-medium rounded-md transition-colors"
          >
            추가
          </button>
        </div>
      )}

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {value.map((tone) => (
            <span key={tone} className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 text-xs px-3 py-1 rounded-full">
              {tone}
              <button
                type="button"
                onClick={() => onChange(value.filter((t) => t !== tone))}
                aria-label={`${tone} 제거`}
                className="hover:text-orange-900"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
