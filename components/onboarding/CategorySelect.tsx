'use client'

export type CategorySelectProps = {
  value: string
  onChange: (value: string) => void
}

const CATEGORIES = [
  { id: 'cafe', label: '카페', emoji: '☕' },
  { id: 'restaurant', label: '음식점', emoji: '🍽️' },
  { id: 'delivery', label: '배달전문', emoji: '🛵' },
]

export default function CategorySelect({ value, onChange }: CategorySelectProps) {
  return (
    <div className="flex flex-col gap-3">
      {CATEGORIES.map((cat) => (
        <button
          key={cat.id}
          type="button"
          onClick={() => onChange(cat.id)}
          className={`flex items-center gap-4 p-4 rounded-lg border-2 text-left transition-all ${
            value === cat.id
              ? 'ring-2 ring-orange-500 border-orange-500 bg-orange-50'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <span className="text-3xl" aria-hidden="true">{cat.emoji}</span>
          <span className="text-base font-medium text-gray-800">{cat.label}</span>
        </button>
      ))}
    </div>
  )
}
