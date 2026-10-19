# CondoCook フェーズ1b 設計（反応・通知・ランキング）

RECIPE_SPEC.md の D20〜D23 を実装する。2026-10-19。マイグレーション `20261019000001_cook_reactions.sql`。

## 1. 反応（D20）
| 反応 | テーブル | 見える人 | 備考 |
|---|---|---|---|
| 作った | `recipe_cooks` | レシピが見える人 | 何度でも。一言（200字）・写真は任意。削除は本人と管理者。作ったら「作りたい」から外す |
| お気に入り | `recipe_favorites` | 本人だけ | 数（`recipes.favorite_count`）は全員に見える。誰が付けたかは出さない |
| 作りたい | `recipe_wants` | 本人だけ | 通知しない |
| コメント | `recipe_comments` | レシピが見える人 | 500字。削除は本人と管理者 |

- 数は `recipes.cooked_count`（作成者本人の分を除く。D22）と `favorite_count` をトリガーで更新する。反応では `updated_at` を変えない
- 「作った」の写真はレシピの写真と同じバケット（`recipe-photos`）の `cooks/<id>/` に置き、`/api/cook/cooked-photo/<id>` で見える人にだけ配信
- 作るモードの最後の画面から `?cooked=1` でレシピ画面を開くと「作った！」の入力がすぐ開く
- お気に入り・作りたいの一覧は `/cook?list=fav` / `?list=want`（マイから開く）

## 2. 通知（D23 の①〜③）
- 種類: `cook_cooked`（作成者へ）、`cook_favorite`（作成者へ）、`cook_comment`（作成者と、同じレシピに先にコメントした人へ。返事に気づけるように。今そのレシピが見えない人には送らない）、`cook_new_recipe`（初めてグループ公開したとき、同じグループの全員へ）
- 初めてのグループ公開は `recipes.published_at`（BEFORE トリガーで入れる）で判定する。家族だけ→グループ→家族だけ→グループと変えても通知は1回
- 設定: `notification_settings` に `cook_cooked` / `cook_reaction`（コメント・お気に入り）/ `cook_new_recipe`。CondoCook の「マイ」で切り替える
- アプリ内通知は DB トリガーで作り、プッシュはサーバーがその通知を読んで同じ相手に送る（`src/lib/cook/push.ts`。CondoFit の予定の通知と同じ作り）。CondoCook の通知は CondoCook だけの人にも送る
- ベルは CondoFit と CondoCook で分ける（`type like 'cook\_%'`）。「すべて既読」も表示している側だけ
- CondoCook の画面でも Service Worker を登録する（CondoCook だけを開いた端末でもプッシュを受け取れるように）

## 3. ランキング（D21・D22）
- `cook_monthly_ranking(p_month)`（呼んだ人の権限で読む）。月は JST
  - 作られたレシピ: その月に作った人の数（作成者本人を除く）
  - よく料理した人: その月の「作った」の回数（自分のレシピも数える）
  - レシピを登録した人: その月に初めてグループ公開したレシピの数
- グループ公開のレシピだけ（家族だけ・自分だけは数えない）。上位10件、同じ数は同じ順位
- 下部タブに「ランキング」を足した（レシピ・ランキング・登録・マイ）
