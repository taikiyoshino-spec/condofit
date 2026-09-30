-- 種目マスタ初期データ（LIFEfit大倉山店ベースの初期候補）
-- 新羽店の設備確定後に管理者画面から調整する。

insert into public.body_parts (name, display_order) values
  ('胸', 10),
  ('背中', 20),
  ('肩', 30),
  ('腕', 40),
  ('脚', 50),
  ('お腹', 60),
  ('有酸素', 70),
  ('フリーウェイト', 80)
on conflict (name) do nothing;

insert into public.exercises (name, body_part_id, type, display_order)
select v.name, bp.id, v.type, v.display_order
from (values
  ('ランニングマシン',               '有酸素',         'cardio', 10),
  ('アップライトバイク',             '有酸素',         'cardio', 20),
  ('チェストプレス',                 '胸',             'weight', 10),
  ('ペックフライ',                   '胸',             'weight', 20),
  ('レッグプレス',                   '脚',             'weight', 10),
  ('プローンレッグカール',           '脚',             'weight', 20),
  ('レッグエクステンション',         '脚',             'weight', 30),
  ('アブダクター×アダクター',        '脚',             'weight', 40),
  ('プレートレッグプレス',           '脚',             'weight', 50),
  ('ラットプル',                     '背中',           'weight', 10),
  ('アシストチンニング×ディップス',  '背中',           'weight', 20),
  ('バックエクステンション',         '背中',           'weight', 30),
  ('プレートローイング',             '背中',           'weight', 40),
  ('プリチャーカール',               '腕',             'weight', 10),
  ('ショルダープレス',               '肩',             'weight', 10),
  ('アブドミナル',                   'お腹',           'weight', 10),
  ('アブベンチ',                     'お腹',           'weight', 20),
  ('ファンクショナルトレーナー',     'フリーウェイト', 'weight', 10),
  ('パワーラック',                   'フリーウェイト', 'weight', 20),
  ('スミスマシン',                   'フリーウェイト', 'weight', 30),
  ('アジャスタブルベンチ',           'フリーウェイト', 'weight', 40)
) as v(name, body_part, type, display_order)
join public.body_parts bp on bp.name = v.body_part
on conflict do nothing;
