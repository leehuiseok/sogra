-- seed/triggers.sql
-- trigger_presets 카탈로그 시드 (음식점 도메인 5종)
-- lib/triggers/presets.ts 상수와 key 1:1 대응
-- idempotent: ON CONFLICT (key) DO UPDATE

INSERT INTO trigger_presets (key, event, action, when_text, label_ko, description_ko, sort_order)
VALUES
  ('rain',           'rain',    'promote',  'today',    '비/우천 우산 + 따뜻한 메뉴',  '비 오는 날 따뜻한 메뉴 강조 콘텐츠',           1),
  ('heat',           'heat',    'promote',  'today',    '폭염 시원한 메뉴',             '30도 이상 더위에 시원한 음료/면 강조',          2),
  ('weekday_lunch',  'lunch',   'promote',  'weekday',  '평일 직장인 런치',             '평일 11시~14시 직장인 점심 타겟',               3),
  ('weekend_dinner', 'dinner',  'promote',  'weekend',  '주말 가족 저녁',               '주말 17시~21시 가족 모임 타겟',                 4),
  ('holiday',        'holiday', 'announce', 'upcoming', '연휴/명절 영업안내',           '공휴일 영업/휴무 안내 + 명절 메뉴',             5)
ON CONFLICT (key) DO UPDATE SET
  event          = EXCLUDED.event,
  action         = EXCLUDED.action,
  when_text      = EXCLUDED.when_text,
  label_ko       = EXCLUDED.label_ko,
  description_ko = EXCLUDED.description_ko,
  sort_order     = EXCLUDED.sort_order;
