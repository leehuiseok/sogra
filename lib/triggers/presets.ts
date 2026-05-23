export interface TriggerPreset {
  key: string
  event: string
  action: string
  whenText: string
  labelKo: string
  descriptionKo: string
  sortOrder: number
}

export const PRESETS: readonly TriggerPreset[] = [
  {
    key: 'rain',
    event: 'rain',
    action: 'promote',
    whenText: 'today',
    labelKo: '비/우천 우산 + 따뜻한 메뉴',
    descriptionKo: '비 오는 날 따뜻한 메뉴 강조 콘텐츠',
    sortOrder: 1,
  },
  {
    key: 'heat',
    event: 'heat',
    action: 'promote',
    whenText: 'today',
    labelKo: '폭염 시원한 메뉴',
    descriptionKo: '30도 이상 더위에 시원한 음료/면 강조',
    sortOrder: 2,
  },
  {
    key: 'weekday_lunch',
    event: 'lunch',
    action: 'promote',
    whenText: 'weekday',
    labelKo: '평일 직장인 런치',
    descriptionKo: '평일 11시~14시 직장인 점심 타겟',
    sortOrder: 3,
  },
  {
    key: 'weekend_dinner',
    event: 'dinner',
    action: 'promote',
    whenText: 'weekend',
    labelKo: '주말 가족 저녁',
    descriptionKo: '주말 17시~21시 가족 모임 타겟',
    sortOrder: 4,
  },
  {
    key: 'holiday',
    event: 'holiday',
    action: 'announce',
    whenText: 'upcoming',
    labelKo: '연휴/명절 영업안내',
    descriptionKo: '공휴일 영업/휴무 안내 + 명절 메뉴',
    sortOrder: 5,
  },
]

export function getPresetByKey(key: string): TriggerPreset | undefined {
  return PRESETS.find((p) => p.key === key)
}
