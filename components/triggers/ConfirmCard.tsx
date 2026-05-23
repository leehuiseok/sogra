'use client'

import { useState } from 'react'

export interface ParsedOutput {
  event: string
  action: string
  when: string
  target: string | null
}

export interface ConfirmCardProps {
  parsed: ParsedOutput
  nluEventId: string
  onAction: (action: 'confirm' | 'edit' | 'reject', corrected?: ParsedOutput) => void
}

export default function ConfirmCard({ parsed, nluEventId: _nluEventId, onAction }: ConfirmCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<ParsedOutput>({ ...parsed })

  function handleEdit() {
    setIsEditing(true)
  }

  function handleSave() {
    onAction('edit', draft)
    setIsEditing(false)
  }

  return (
    <div className="border-l-4 border-orange-500 bg-orange-50 p-4 rounded-md">
      <p className="text-sm font-semibold text-gray-800 mb-2">이렇게 이해했어요. 맞나요?</p>

      {!isEditing ? (
        <ul className="text-sm text-gray-700 space-y-1 mb-4">
          <li>
            <span className="font-medium">상황:</span> {parsed.event}
          </li>
          <li>
            <span className="font-medium">행동:</span> {parsed.action}
          </li>
          <li>
            <span className="font-medium">시점:</span> {parsed.when}
          </li>
          {parsed.target && (
            <li>
              <span className="font-medium">대상:</span> {parsed.target}
            </li>
          )}
        </ul>
      ) : (
        <div className="space-y-2 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-0.5">상황</label>
            <input
              type="text"
              value={draft.event}
              onChange={(e) => setDraft((d) => ({ ...d, event: e.target.value }))}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-0.5">행동</label>
            <input
              type="text"
              value={draft.action}
              onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-0.5">시점</label>
            <input
              type="text"
              value={draft.when}
              onChange={(e) => setDraft((d) => ({ ...d, when: e.target.value }))}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-0.5">대상 (선택)</label>
            <input
              type="text"
              value={draft.target ?? ''}
              onChange={(e) =>
                setDraft((d) => ({ ...d, target: e.target.value || null }))
              }
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {isEditing ? (
          <button
            onClick={handleSave}
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold py-1.5 rounded transition-colors"
          >
            저장
          </button>
        ) : (
          <>
            <button
              onClick={() => onAction('confirm')}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold py-1.5 rounded transition-colors"
            >
              예 (확정)
            </button>
            <button
              onClick={() => onAction('reject')}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold py-1.5 rounded transition-colors"
            >
              아니오 (취소)
            </button>
            <button
              onClick={handleEdit}
              className="flex-1 bg-white hover:bg-gray-50 text-orange-500 border border-orange-300 text-sm font-semibold py-1.5 rounded transition-colors"
            >
              수정
            </button>
          </>
        )}
      </div>
    </div>
  )
}
