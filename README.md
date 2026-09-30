# CondoFit

同じマンションの仲間で使う、ゆるいFit（LIFEfit新羽店）モチベーション共有アプリ。

- 本番: https://condofit-one.vercel.app（稼働確認: `/api/health`）
- 仕様: [`CONDOFIT_SPEC_LATEST.md`](CONDOFIT_SPEC_LATEST.md)
- 実装時の決定事項: [`docs/DECISIONS.md`](docs/DECISIONS.md)

## セットアップ

1. Supabase プロジェクトを作成し、`supabase/migrations/` を適用する
   ```sh
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
2. `.env.example` を `.env.local` にコピーして値を入れる
   - `PIN_PEPPER` は長いランダム文字列（例: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`）。**運用開始後に変更すると全員ログインできなくなる**
   - `GYM_LAT` / `GYM_LNG` に LIFEfit 新羽店の座標。未設定の間はチェックインできない
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` は `npx web-push generate-vapid-keys` で生成
   - `CRON_SECRET` はランダム文字列
   - Supabase の SQL エディタで、定期処理（15分確認通知・通知の期限削除）の呼び先を Vault に登録する
     ```sql
     select vault.create_secret('https://<アプリのドメイン>', 'condofit_app_origin');
     select vault.create_secret('<CRON_SECRET と同じ値>', 'condofit_cron_secret');
     ```
3. 最初の管理者を作成する
   ```sh
   npm run admin:create -- <表示名> <4桁PIN>
   ```
4. 起動
   ```sh
   npm install
   npm run dev
   ```
5. 管理者でログイン → 設定 → 管理者メニューから招待URLを発行し、LINE等で共有する

## テスト

```sh
npm test        # PIN等の単体テスト + DB（RLS・トリガー・通知ルール）テスト
npm run test:db # DBテストのみ（PGlite上でマイグレーションを検証。Docker不要）
```
