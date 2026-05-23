'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      if (signInError.message.includes('Invalid login credentials')) {
        setError('이메일 또는 비밀번호가 올바르지 않습니다.')
      } else if (signInError.message.includes('Email not confirmed')) {
        setError('이메일 인증이 완료되지 않았습니다. 받은 편지함을 확인해 주세요.')
      } else {
        setError('로그인 중 오류가 발생했습니다. 다시 시도해 주세요.')
      }
      setLoading(false)
      return
    }

    router.push('/onboarding/1')
  }

  return (
    <div className="bg-white p-8 rounded-lg shadow w-full max-w-md">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">다시 오셨군요!</h1>
      <p className="text-gray-500 text-sm mb-6">계속해서 매장을 관리해보세요.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            이메일
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-required="true"
            placeholder="example@email.com"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            비밀번호
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            aria-required="true"
            placeholder="비밀번호를 입력해 주세요"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-semibold py-2 px-4 rounded-md transition-colors"
        >
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-4">
        아직 계정이 없으신가요?{' '}
        <Link href="/signup" className="text-orange-500 hover:underline font-medium">
          무료로 시작하기
        </Link>
      </p>
    </div>
  )
}
