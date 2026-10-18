# CondoCook フェーズ1a 設計（レシピの登録・閲覧）

仕様: `RECIPE_SPEC.md`（決定事項 D1〜D28）。この文書は 1a の画面・DB・処理の設計。
状態: **確定**（2026-10-18）

---

## 1. 利用者の種類（D4・D5・D6）

### 1.1 CondoCook だけ使えるメンバー
- `group_members` に列 `apps text not null default 'all' check (apps in ('all', 'cook'))` を追加
  - `all`: CondoFit・CondoCook 両方（既存メンバー全員）
  - `cook`: CondoCook だけ（CondoFit メンバーでない家族）
- 既存の `is_member()` は **CondoFit 用の判定**のまま、`apps = 'all'` の人だけを対象にする（家族ユーザーがトレーニング記録などを読めないように）
- 新しく `is_cook_user()`（`apps` に関係なく有効なメンバー）を作り、CondoCook のテーブルの RLS はこちらを使う
- `users` の読み取り（名前・アイコン）は `is_cook_user()` でも読めるようにする。CondoFit 側のメンバー一覧・ランキングなどは `apps = 'all'` で絞る（既存クエリを確認して漏れを塞ぐ）

### 1.2 画面の振り分け
- `Member` 型に `apps: "all" | "cook"` を追加（`src/lib/auth/session.ts`）
- CondoFit 側 `(app)` レイアウト: `apps === "cook"` なら `/cook` へリダイレクト
- CondoCook 側 `cook` レイアウト: `requireCookUser()`（未ログインは `/login?next=/cook`）
- ログイン後の行き先: `proxy.ts` が未ログインで `/cook` 配下に来たら `/login?next=<元のパス>` に送り、ログイン後はそこへ戻す（`next` は自サイト内のパスだけ許可）。`apps === "cook"` の人は `next` がなければ `/cook`

### 1.3 家族ユーザーの作成（管理者）
- 管理画面に「家族のユーザーを作る」（名前・PIN・所属する家族）。招待リンクの参加処理（`join`）と同じ手順でユーザーを作り、`apps = 'cook'` で `group_members` に入れる
- 家族ユーザーのPINリセット・利用停止は既存の管理機能をそのまま使う
- 家族ユーザーも CondoFit メンバーと同じようにレシピを登録・公開できる（2026-10-18 確認）

### 1.4 家族（households）
- `households (id, group_id, name, created_at)`
- `household_members (household_id, user_id primary key, joined_at)` … 1人1家族（D5）
- 家族に入っていない人は、CondoCook を初めて開いたときに「1人の家族」を自動で作る（D6）。管理者があとで家族にまとめるときは、メンバーを移して空の家族を消す
- 管理画面: 家族の作成・名前変更・メンバーの出し入れ
- 関数 `my_household_id()`（RLS 用）

---

## 2. DB（新規テーブル）

### 2.1 食材マスタ（D7）
```
ingredients
  id uuid pk
  name text            -- 「鶏もも肉」
  aliases text[]       -- {とりもも, 鶏もも, チキン}
  category text        -- 肉・魚介・野菜・果物・卵乳製品・豆腐大豆・穀物麺・調味料・乾物・その他（売り場の分類にも使う）
  fridge_days int      -- 冷蔵の目安日数（フェーズ3で使用）
  freezer_days int
  is_staple boolean    -- 初期の「いつもある」候補（D9、フェーズ3で使用）
  created_by uuid      -- 利用者が追加したもの（null = 初期データ）
  merged_into uuid     -- 管理者が統合したら統合先
  active boolean
```
- 初期データ約300件はマイグレーションの seed で投入
- 利用者はレシピ登録中に食材を追加できる（`created_by` 付き）。管理者が統合・修正

### 2.2 レシピ（D14・D15・D16）
```
recipes
  id uuid pk
  owner_user_id uuid
  title text (1–60)
  visibility text  check in ('group', 'household', 'private')  default 'group'
  household_id uuid  -- 作成時の家族（visibility = household の判定用）
  servings int null, cook_minutes int null
  category_id uuid null, tags text[] default '{}'
  memo text null (〜1000)
  source_url text null, source_name text null   -- 出典（D12）
  photo_path text null, thumb_path text null     -- 自分で撮った写真のみ
  copied_from uuid null                          -- コピー元（D16）
  created_at, updated_at, deleted_at

recipe_categories      -- 管理者が追加・変更できる
  id, name, display_order, active
  初期値: 主菜・副菜・汁物・ご飯物・麺・おつまみ・デザート・その他

recipe_ingredients
  id, recipe_id, position int
  ingredient_id uuid null      -- 食材マスタに当てはめたもの
  name text                    -- 表示名（取り込んだ名前をそのまま）
  amount text                  -- 「300g」「大さじ2」「少々」（表示用の原文）
  quantity numeric null, unit text null   -- 換算用（D18）。数値にできた分だけ
  optional boolean default false
  section text null            -- 「A」「タレ」など材料のまとまり

recipe_steps
  id, recipe_id, position int, body text (1–500)
```
- RLS（見える範囲）: `group` → `is_cook_user()`、`household` → 作成者と同じ家族、`private` → 作成者のみ。下書きは持たず、登録画面の入力は端末に一時保存
- 編集は作成者のみ、削除（論理削除）は作成者と管理者（D16）
- 保存は1回の RPC `save_recipe(recipe jsonb)` でレシピ・材料・手順をまとめて置き換え（CondoFit の `save_training_session` と同じ方式）

### 2.3 写真
- 非公開バケット `recipe-photos`。端末側で縮小して2枚アップロード: 表示用（長辺1200px）とサムネイル（長辺240px・低画質、D17）
- 配信は `/api/cook/photo/[recipeId]?size=thumb|full`（見える範囲のチェック付き、アバターと同じ方式）
- 既存の `resizeToSquareJpeg` を参考に、正方形でない縮小関数を追加

---

## 3. URLからの取り込み（D12・D13）

1. 本人がURLを貼る → サーバーの処理（Server Action）で取得
   - `http(s)` のみ、社内・ローカルのアドレスへの接続は拒否、サイズ上限・タイムアウトあり
2. ページ内の構造化データ（JSON-LD の `@type: Recipe`）を探す → 料理名・材料・手順・何人分・時間を取り出す
3. 構造化データがない場合だけ、AI（Gemini 無料枠）に本文のテキストを渡して同じ形に整えてもらう。AIが使えないときは「取り込めませんでした。手入力してください」
4. 材料名を食材マスタに当てはめる: 名前・別名の一致 → 当たらないものだけまとめて1回 AI に聞く → それでもだめなら本人が候補から選ぶ／新しい食材として追加
5. 結果を登録画面に下書きとして入れる（写真は入れない。出典名・URLは自動で入る）。本人が直して登録

- AI の呼び出しは `src/lib/ai/` にまとめ、キー（`GEMINI_API_KEY`）が未設定なら AI なしで動く
- 分量の文字列から数値と単位を取り出す処理（「300g」→ 300・g、「大さじ1と1/2」→ 1.5・大さじ、「少々」→ なし）は自前の関数で行いテストする

---

## 4. 画面（`/cook` 配下）

CondoCook 専用のレイアウト・下部タブ（1a はレシピ・登録・マイの3つ。1b 以降でランキング・買い物・食材を足す）。CondoFit のタブやメニューは出さない（D25）。

| 下部タブ | パス | 内容 |
|---|---|---|
| レシピ | `/cook` | レシピ一覧。検索（料理名・食材名）、カテゴリで絞り込み、「みんな／家族／自分」の切り替え。各行にサムネイル・料理名・作成者アイコン・時間 |
| 登録 | `/cook/new` | 「URLから取り込む」か「手入力」を選んで登録画面へ |
| マイ | `/cook/me` | 自分のレシピ、名前・アイコン（既存画面へのリンク、家族ユーザー用に CondoCook 側にも用意）、ログアウト、管理者は管理画面 |

その他の画面:
- `/cook/r/[id]` レシピ詳細: 写真、料理名、作成者、出典リンク、「− N人分 ＋」と材料（換算表示 D18）、手順、メモ。「作る」ボタン。作成者には「編集」、他の人には「コピーしてアレンジ」
- `/cook/r/[id]/cook` 作るモード（D24）: 全画面。右半分タップで次・左半分で前、進み具合、手順ごとの材料、画面を消さない、タイマー、音声操作。最初の画面は材料一覧
- `/cook/r/[id]/edit`、`/cook/new/edit` 登録・編集画面: 料理名、写真、公開範囲、何人分、時間、カテゴリ、タグ、材料（並べ替え・なくても可・食材マスタの候補）、手順、メモ、出典
- `/cook/admin` 管理（管理者のみ）: 家族、家族ユーザーの作成、食材マスタ、カテゴリ

PWA:
- `/cook` 用のマニフェスト（名前 CondoCook、`start_url: /cook`、`scope: /cook`、別アイコン・テーマ色）。`cook` レイアウトのメタデータで差し替える（このバージョンの Next.js での指定方法は実装時にドキュメントで確認）
- Service Worker は既存の `/sw.js`（scope `/`）を共用。CondoCook 側でも登録する

---

## 5. 作るモードの細部（D24）
- 画面を消さない: Screen Wake Lock API。画面に戻ったら取り直す。非対応なら何もしない
- タイマー: 手順の本文から「N分」「N秒」「N〜M分」を見つけてボタンにする（範囲は長い方）。複数同時、終了時は音と振動（端末が対応していれば）。作るモードを出るまで保持
- 音声: Web Speech API の音声認識。「次」「つぎ」「戻る」「もどる」などを認識。対応していない端末ではボタンを出さない。オンにしている間だけマイクを使う
- 文字の大きさ: 手順は大きめ（1.5倍程度）。片手で持っても押しやすいよう、左右のタップ領域は画面全体

---

## 6. 1a で作らないもの
「作った」・お気に入り・「作りたい」・コメント・通知・ランキング（1b）、買い物リスト（2）、食材リスト・提案（3）。ただしテーブル設計は 1b 以降で足せる形にしておく。

---

## 7. テスト・確認
- DBテスト（`scripts/db-test.mjs`）:
  - 家族ユーザー（`apps = 'cook'`）が CondoFit のテーブル（トレーニング記録・予定・チェックインなど）を読めない
  - レシピの見える範囲（グループ／家族／自分だけ）と、編集・削除の権限
  - 家族の自動作成と、1人1家族
- ユニットテスト: 分量の文字列の解析、人数換算、JSON-LD の読み取り、タイマー用の時間の検出、`next` パラメータの検証
- 実機確認: iPhone・Android でホーム画面に追加、作るモード（画面が消えない・タイマー・音声）

## 8. 実装の順番（目安）
1. 利用者の種類・家族・ログインの振り分け（DB＋テスト先行。CondoFit 側の漏れ確認） … ✅ 2026-10-18（`20261018000003_cook_users_households.sql`。家族ユーザー作成・家族の管理画面は 8 で）
2. 食材マスタ（初期データ） … ✅ 2026-10-18（`20261018000004_cook_ingredients.sql` 309件、`src/lib/cook/ingredients.ts`。分類は 肉・魚介・野菜・果物・卵・乳製品・豆腐・大豆製品・米・パン・麺・調味料・乾物・粉・その他。管理画面は 8 で）
3. レシピの DB・RLS・保存 RPC
4. `/cook` のレイアウト・PWA・一覧・詳細
5. 登録・編集画面（手入力）、写真
6. URL取り込み、AI の当てはめ
7. 作るモード
8. 管理画面（家族・家族ユーザー・食材マスタ・カテゴリ）
