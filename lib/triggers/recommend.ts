import { PRESETS, type TriggerPreset } from './presets'
import { getWeatherSignal } from '@/lib/signals/weather'
import { getCalendarSignal } from '@/lib/signals/calendar'

export interface Recommendation {
  presetKey: string
  score: number
  reason: string
  preset: TriggerPreset
}

function getSeoulHour(): number {
  return parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
    10,
  )
}

export async function recommendTriggers(input: {
  city?: string
}): Promise<Recommendation[]> {
  const [weather, calendar] = await Promise.all([
    getWeatherSignal(input.city ?? 'Seoul'),
    Promise.resolve(getCalendarSignal()),
  ])

  const hour = getSeoulHour()
  const dow = calendar.dayOfWeek
  const isWeekday = dow >= 1 && dow <= 5
  const isWeekend = dow === 0 || dow === 6

  const scores: Array<{ presetKey: string; score: number; reason: string }> = []

  // rain
  if (weather.condition === 'rain') {
    scores.push({ presetKey: 'rain', score: 0.9, reason: '오늘 비 예보' })
  } else {
    scores.push({ presetKey: 'rain', score: 0.0, reason: '' })
  }

  // heat
  if (weather.condition === 'heat') {
    scores.push({ presetKey: 'heat', score: 0.9, reason: '오늘 폭염 날씨' })
  } else if (weather.temperatureC >= 28) {
    scores.push({ presetKey: 'heat', score: 0.5, reason: `오늘 기온 ${Math.round(weather.temperatureC)}도` })
  } else {
    scores.push({ presetKey: 'heat', score: 0.0, reason: '' })
  }

  // weekday_lunch
  if (isWeekday && hour >= 10 && hour <= 13) {
    scores.push({ presetKey: 'weekday_lunch', score: 0.7, reason: '평일 점심 시간대' })
  } else if (isWeekday) {
    scores.push({ presetKey: 'weekday_lunch', score: 0.3, reason: '평일' })
  } else {
    scores.push({ presetKey: 'weekday_lunch', score: 0.3, reason: '평일 아님' })
  }

  // weekend_dinner
  if (isWeekend && hour >= 16 && hour <= 20) {
    scores.push({ presetKey: 'weekend_dinner', score: 0.8, reason: '주말 저녁 가족 시간대' })
  } else if (isWeekend) {
    scores.push({ presetKey: 'weekend_dinner', score: 0.4, reason: '주말' })
  } else {
    scores.push({ presetKey: 'weekend_dinner', score: 0.0, reason: '' })
  }

  // holiday
  const days = calendar.daysUntilNextHoliday
  if (days >= 0 && days <= 7) {
    const score = Math.max(0, 0.8 - days / 10)
    const name = calendar.nextHolidayName ?? '공휴일'
    scores.push({
      presetKey: 'holiday',
      score,
      reason: days === 0 ? `오늘 ${name}` : `${days}일 후 ${name}`,
    })
  } else {
    scores.push({ presetKey: 'holiday', score: 0.0, reason: '' })
  }

  const recommendations: Recommendation[] = scores
    .filter((s) => s.score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => {
      const preset = PRESETS.find((p) => p.key === s.presetKey)!
      return { presetKey: s.presetKey, score: s.score, reason: s.reason, preset }
    })

  return recommendations
}
