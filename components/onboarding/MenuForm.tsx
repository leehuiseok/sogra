'use client'

export type MenuItem = {
  name: string
  desc?: string
  price?: number
}

export type MenuFormProps = {
  value: MenuItem[]
  onChange: (value: MenuItem[]) => void
}

const EMPTY_ROWS = 3

export default function MenuForm({ value, onChange }: MenuFormProps) {
  const rows: MenuItem[] = [
    ...value,
    ...Array.from({ length: Math.max(0, EMPTY_ROWS - value.length) }, () => ({ name: '', desc: '', price: undefined })),
  ].slice(0, EMPTY_ROWS)

  function updateRow(index: number, field: keyof MenuItem, fieldValue: string | number | undefined) {
    const next = rows.map((row, i) => (i === index ? { ...row, [field]: fieldValue } : row))
    onChange(next.filter((row) => row.name.trim() !== ''))
  }

  return (
    <div className="space-y-4">
      {rows.map((row, index) => (
        <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-2">
          <p className="text-xs font-semibold text-gray-500 mb-2">메뉴 {index + 1}</p>

          <div>
            <label htmlFor={`menu-name-${index}`} className="block text-xs font-medium text-gray-600 mb-1">
              메뉴 이름 <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <input
              id={`menu-name-${index}`}
              type="text"
              value={row.name}
              onChange={(e) => updateRow(index, 'name', e.target.value)}
              aria-required="true"
              maxLength={50}
              placeholder="예: 아메리카노"
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
            />
          </div>

          <div>
            <label htmlFor={`menu-desc-${index}`} className="block text-xs font-medium text-gray-600 mb-1">
              설명 (선택)
            </label>
            <input
              id={`menu-desc-${index}`}
              type="text"
              value={row.desc ?? ''}
              onChange={(e) => updateRow(index, 'desc', e.target.value)}
              maxLength={200}
              placeholder="예: 깊고 진한 원두를 사용한 아메리카노"
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
            />
          </div>

          <div>
            <label htmlFor={`menu-price-${index}`} className="block text-xs font-medium text-gray-600 mb-1">
              가격 (선택)
            </label>
            <input
              id={`menu-price-${index}`}
              type="number"
              value={row.price ?? ''}
              onChange={(e) => updateRow(index, 'price', e.target.value === '' ? undefined : Number(e.target.value))}
              min={0}
              placeholder="예: 4500"
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
            />
          </div>
        </div>
      ))}
    </div>
  )
}
