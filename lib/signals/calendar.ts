export type CalendarSignal = {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string;
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  daysUntilNextHoliday: number;
  nextHolidayName?: string;
};

// 2026년 한국 공휴일 (Asia/Seoul 기준 MM-DD)
const HOLIDAYS_2026: { date: string; name: string }[] = [
  { date: '2026-01-01', name: '신정' },
  { date: '2026-02-16', name: '설날 연휴' },
  { date: '2026-02-17', name: '설날' },
  { date: '2026-02-18', name: '설날 연휴' },
  { date: '2026-03-01', name: '삼일절' },
  { date: '2026-05-05', name: '어린이날' },
  { date: '2026-05-24', name: '부처님오신날' },
  { date: '2026-06-06', name: '현충일' },
  { date: '2026-08-15', name: '광복절' },
  { date: '2026-09-24', name: '추석 연휴' },
  { date: '2026-09-25', name: '추석' },
  { date: '2026-09-26', name: '추석 연휴' },
  { date: '2026-10-03', name: '개천절' },
  { date: '2026-10-09', name: '한글날' },
  { date: '2026-12-25', name: '성탄절' },
];

function toSeoulDateString(date: Date): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .replace(/\. /g, '-')
    .replace('.', '')
    .trim();
}

function getSeoulParts(date: Date): { year: number; month: number; day: number; dow: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const dowMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    dow: dowMap[get('weekday')] ?? 0,
  };
}

export function getCalendarSignal(date: Date = new Date()): CalendarSignal {
  const { month, dow } = getSeoulParts(date);
  const todayStr = toSeoulDateString(date);

  const todayHoliday = HOLIDAYS_2026.find((h) => h.date === todayStr);
  const isHoliday = todayHoliday !== undefined;
  const isWeekend = dow === 0 || dow === 6;

  let season: CalendarSignal['season'];
  if (month >= 3 && month <= 5) season = 'spring';
  else if (month >= 6 && month <= 8) season = 'summer';
  else if (month >= 9 && month <= 11) season = 'autumn';
  else season = 'winter';

  // 다음 공휴일 계산
  const todayMs = date.getTime();
  let daysUntilNextHoliday = Infinity;
  let nextHolidayName: string | undefined;

  for (const h of HOLIDAYS_2026) {
    if (h.date <= todayStr) continue;
    const holidayDate = new Date(`${h.date}T00:00:00+09:00`);
    const diff = Math.ceil((holidayDate.getTime() - todayMs) / (1000 * 60 * 60 * 24));
    if (diff < daysUntilNextHoliday) {
      daysUntilNextHoliday = diff;
      nextHolidayName = h.name;
    }
  }

  return {
    dayOfWeek: dow as CalendarSignal['dayOfWeek'],
    isWeekend,
    isHoliday,
    holidayName: todayHoliday?.name,
    season,
    daysUntilNextHoliday: daysUntilNextHoliday === Infinity ? -1 : daysUntilNextHoliday,
    nextHolidayName,
  };
}
