import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Sogra',
  description: '음식점 사장님 대상 AI 마케팅 자동화 SaaS',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
