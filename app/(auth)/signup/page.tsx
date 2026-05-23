'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('비밀번호는 최소 8자 이상이어야 합니다.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/onboarding/1`,
      },
    })

    if (signUpError) {
      if (signUpError.message.includes('already registered')) {
        setError('이미 가입된 이메일 주소입니다.')
      } else if (signUpError.message.includes('invalid email')) {
        setError('올바른 이메일 주소를 입력해 주세요.')
      } else {
        setError('회원가입 중 오류가 발생했습니다. 다시 시도해 주세요.')
      }
      setLoading(false)
      return
    }

    router.push('/onboarding/1')
  }

  return (
    <div className="bg-white p-8 rounded-lg shadow w-full max-w-md">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">사장님, 환영합니다!</h1>
      <p className="text-gray-500 text-sm mb-6">소그라로 매장 마케팅을 시작해보세요.</p>

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
            placeholder="8자 이상 입력해 주세요"
            minLength={8}
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
          {loading ? '가입 중...' : '무료로 시작하기'}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-4">
        이미 계정이 있으신가요?{' '}
        <Link href="/login" className="text-orange-500 hover:underline font-medium">
          로그인
        </Link>
      </p>
    </div>
  )
}
