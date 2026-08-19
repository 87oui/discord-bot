# Discord bot

## Google Calendar → Discord 通知 (Cloudflare Workers)

### 機能

- Googleカレンダーの予定追加・日時変更・削除を15分ごとに検知してDiscordへ通知
- 毎朝6時にGoogleカレンダーの当日の予定をまとめて通知

### 構成

- Cloudflare Workers + Cron Triggers
- Workers KV（監視するカレンダーの設定・シンクトークン・スナップショット）
- Google Calendar API
- Discord Incoming Webhook

### セットアップ

#### 1. 依存関係

公式パッケージマネージャは **npm** です（`package-lock.json` が正）。`yarn` / `bun` / `pnpm` での install は使わないでください。

```bash
# （推奨）Aikido Safe Chain — install 前にマルウェアをブロック
# https://github.com/AikidoSec/safe-chain/releases の最新 VERSION に合わせる
curl -fsSL https://github.com/AikidoSec/safe-chain/releases/download/1.5.15/install-safe-chain.sh | sh
# ターミナル再起動後
npm safe-chain-verify

npm ci
npx wrangler login
```

サプライチェーン対策として `.npmrc` で `ignore-scripts=true` と `min-release-age=7` を有効にしています。lifecycle script が必要な依存を追加する場合は方針を見直してください。

#### 2. KV namespace

```bash
npx wrangler kv namespace create CALENDAR_KV
npx wrangler kv namespace create CALENDAR_KV --preview
```

出力された ID を `wrangler.toml` の `id` / `preview_id` に設定します。

#### 3. Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. Google Calendar APIを有効化
  - OAuth同意画面をExternal（または Internal）で設定
3. 認証情報 → OAuth クライアント ID（デスクトップ or Web）を作成
4. リダイレクトURI に `http://127.0.0.1:8787/oauth2callback` を追加
5. refresh_token を取得:

```bash
GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy npm run oauth
```

ブラウザで認可後、ターミナルに `refresh_token` が表示されます。

#### 4. Secrets

Cloudflare Workers に以下 4 つを登録します。各コマンド実行後、プロンプトに値を貼り付けてEnterしてください（入力内容は画面に表示されません）。

| Secret 名 | 値の入手元 |
|---|---|
| `GOOGLE_CLIENT_ID` | Google Cloud Console → 認証情報 → OAuthクライアントID |
| `GOOGLE_CLIENT_SECRET` | 同上（クライアントシークレット） |
| `GOOGLE_REFRESH_TOKEN` | Google OAuth設定後、`npm run oauth` 実行結果 |
| `DISCORD_WEBHOOK_URL` | Discord チャンネル設定 → 連携サービス → ウェブフック → URL をコピー |

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GOOGLE_REFRESH_TOKEN
npx wrangler secret put DISCORD_WEBHOOK_URL
```

登録確認:

```bash
npx wrangler secret list
```

ローカル開発（`npm run dev`）では、プロジェクト直下に `.dev.vars` を作成して同じキーを書きます。

```bash
## .dev.vars の例
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx
GOOGLE_REFRESH_TOKEN=xxxxx
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxxxx/xxxxx
```

#### 5. 監視カレンダーを KV に登録

カレンダーIDはGoogleカレンダー設定の「カレンダーの統合」から確認できます（プライマリはメールアドレス）。

```bash
cp calendars.example.json calendars.json
## calendars.json を編集して、監視したいカレンダーの id / name を書く

## wrangler.toml の binding 名で指定（namespace-id の手入力は不要）
## 本番 KV へ書き込む場合は --preview false
npx wrangler kv key put config:calendars --binding=CALENDAR_KV --path=calendars.json --remote --preview false
```

- 土日祝を除く平日の8:00〜16:00に完全に収まる予定以外はすべて通知（終日予定・土日祝・8時前開始・16時超終了などは通知対象）。
- `familyNotifyFilter` が未指定または `false` のカレンダーは従来どおり全予定が通知対象です。

`calendars.json` は個人のカレンダー ID を含むため `.gitignore` 済みです。  
先に「2. KV namespace」で作成した ID を `wrangler.toml` の `id` / `preview_id` に入れておいてください。

#### 6. デプロイ

```bash
npm run deploy
```

### Cron

| Cron (UTC) | 意味 |
|---|---|
| `*/15 * * * *` | 変更通知ポーリング |
| `0 21 * * *` | 朝マトメ（日本時間06:00） |

### 通知仕様

#### 変更通知

- 初回同期 / syncToken 失効時はスナップショット再構築のみ（通知なし）
- 検知対象: 追加 / 日時変更 / 削除
- タイトルのみの変更は通知せずスナップショットのみ更新

#### 当日の予定一覧

- 監視カレンダー全体の当日予定（日本時間）
- 0 件でも「今日は予定なし」を送信

### 開発

```bash
npm run typecheck
npm run test
npm run dev
```

### 運用ルール

- 「自分一人だけの個人的な予定」「仕事」など、用途に応じてカレンダーを分ける。
- できる限り予定の開始時間と終了時間を入力する。できれば場所も入れておくと出発・帰宅時間がわかって良い。
- 通知を確認したら既読の意味で好きなスタンプをつけると良さそう。
