'use client'

export type StoreInfoValue = {
  storeName: string
  address: string
  addressDetail?: string
}

export type StoreInfoFormProps = {
  value: StoreInfoValue
  onChange: (value: StoreInfoValue) => void
}

export default function StoreInfoForm({ value, onChange }: StoreInfoFormProps) {
  function update(field: keyof StoreInfoValue, fieldValue: string) {
    onChange({ ...value, [field]: fieldValue })
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="store-name" className="block text-sm font-medium text-gray-700 mb-1">
          매장 이름 <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <input
          id="store-name"
          type="text"
          value={value.storeName}
          onChange={(e) => update('storeName', e.target.value)}
          required
          aria-required="true"
          maxLength={100}
          placeholder="예: 소그라 카페 홍대점"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      <div>
        <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
          매장 주소 <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <input
          id="address"
          type="text"
          value={value.address}
          onChange={(e) => update('address', e.target.value)}
          required
          aria-required="true"
          maxLength={300}
          placeholder="예: 서울시 마포구 홍대로 123"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      <div>
        <label htmlFor="address-detail" className="block text-sm font-medium text-gray-700 mb-1">
          상세 주소
        </label>
        <input
          id="address-detail"
          type="text"
          value={value.addressDetail ?? ''}
          onChange={(e) => update('addressDetail', e.target.value)}
          placeholder="예: 2층 201호"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>
    </div>
  )
}
