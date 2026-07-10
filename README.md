# clasp-sheet-cli

Google Apps Script の **Web アプリ(HTTP)** 経由で、ローカルから Google Sheets を操作する CLI です。

Local CLI for manipulating Google Sheets through a Google Apps Script **Web App** over HTTP.

実行コマンド名は `sheet` です。

## Overview / 概要

- Spreadsheet の業務ロジックは Apps Script 側だけに置く
- Node 側は CLI 入力・設定・HTTP 実行・整形のみ担当
- Google Sheets REST API は使わない
- **実行は Apps Script Web アプリ(`doPost`/`doGet`)への HTTP 呼び出し** — `clasp run` / `scripts.run` は使わない

Apps Script は「Spreadsheet を操作するバックエンド」、CLI は「それを叩く薄いフロント」という関係です。両者は次の RPC 契約でやり取りします。

```text
request  : { "fn": "<関数名>", "params": [ ... ], "token": "<任意>" }
response : { "ok": true,  "result": <値> }
         | { "ok": false, "error": "<メッセージ>" }
```

## Why HTTP (GCP-less) / なぜ Web アプリ方式か

`clasp run`（Apps Script API の `scripts.run`）は、**呼び出し側 OAuth クライアントと対象スクリプトが同一の標準 GCP プロジェクトに属していること**を要求します。そのため実質的に「専用 GCP プロジェクトの作成 + 紐付け + `clasp login --creds`」が必須になり、"GCP レス" とは言えません。

本ツールは実行を **Web アプリのデプロイ + HTTP 呼び出し** に置き換えることで、これを回避します。

- ✅ 専用 GCP プロジェクトの作成・紐付けが不要
- ✅ `scripts.run` / `clasp login --creds` / OAuth クライアント JSON が不要
- ✅ Google Sheets REST API クライアント / サービスアカウント / API キーが不要
- ✅ Spreadsheet ロジックを Apps Script 側に集約でき、CLI は薄いまま
- ✅ HTTP なのでローカル自動化・CI に組み込みやすい

> `clasp`（`create` / `push` / `deploy`）でコードを配信するために、アカウント単位の **Apps Script API 有効化**（<https://script.google.com/home/usersettings>）は必要です。これは *コード管理* のためであり、*実行* のための GCP プロジェクトとは別物です。

## Access model / アクセスと認証（重要）

Web アプリは `apps-script/appsscript.json` の `webapp` 設定でアクセス範囲が決まります。組織（Google Workspace）のポリシー次第で選べる範囲が変わります。

| access | 誰が呼べるか | CLI 側の認証 | 備考 |
|---|---|---|---|
| `ANYONE_ANONYMOUS` | URL を知る全員（匿名） | 不要（`auth: none`） | 手軽。ただし**管理者が禁止していることが多い** |
| `DOMAIN` | デプロイ者と同じ組織ドメインのユーザー | **必要**（`auth: clasp`） | 匿名が禁止の組織向け。本 README の既定 |
| `MYSELF` | デプロイ者本人のみ | **必要**（`auth: clasp`） | 最も限定的 |

`DOMAIN` / `MYSELF` では、呼び出しに **`Authorization: Bearer <アクセストークン>`** が必要です。本ツールは `--auth clasp` を指定すると、**既存の `clasp login` の資格情報（`~/.clasprc.json`）からトークンを取得**し、失効時は refresh_token で自動更新します（追加の GCP/OAuth 設定は不要）。

> ⚠️ **アカウント整合に注意**
> `DOMAIN` の判定基準は「**スクリプトをデプロイしたアカウントのドメイン**」＝ **`clasp` がログインしているアカウント**です。
> 複数の Google アカウント（例: グループ会社を跨いで複数保有）を使っている場合、**`clasp` のログイン先アカウント**と、**対象スプレッドシートにアクセスできるアカウント**を一致させてください。ズレていると呼び出しが `401`（ドメイン不一致）になります。
> `--auth clasp` は `clasp` と同じアカウントのトークンを使うため、まず `clasp` を正しいアカウントでログインしておくのが確実です。

## Architecture / 構成

```text
.
├── apps-script/            # バックエンド (Apps Script)
│   ├── Code.js             #   公開関数 (ping / readRange / appendRows ...)
│   ├── Spreadsheet.js      #   Spreadsheet 操作の実体
│   ├── Utils.js            #   バリデーション等
│   ├── WebApp.js           #   HTTP エントリポイント (doPost/doGet → RPC ディスパッチ)
│   └── appsscript.json     #   scopes + webapp デプロイ設定
├── src/                    # フロント (CLI)
│   ├── cli.ts
│   ├── config.ts           #   .sheet-tool.json の読み書き
│   ├── webapp.ts           #   Web アプリ実行アダプタ (HTTP)
│   ├── auth.ts             #   clasp 資格情報からトークン取得/自動更新
│   ├── commands/
│   │   └── index.ts
│   └── types.ts
├── README.md
├── package.json
└── tsconfig.json
```

コマンドは抽象実行インターフェース `ExecutionAdapter` に依存し、実行は **HTTP 実行 (`WebAppExecutionAdapter`)** に一本化されています（将来 MCP や別方式へ差し替えられる構造は維持）。

## Prerequisites / 前提

- Node.js 20+
- npm
- Google アカウント（複数ある場合は用途に合うものを `clasp login` に使う）
- clasp（`npm install -g @google/clasp`）
- Apps Script API の有効化（アカウント単位。`clasp` でのコード配信に必要）
  - <https://script.google.com/home/usersettings> でトグル ON

## Quickstart

`DOMAIN` アクセス + `--auth clasp` を前提とした、最短で動かす手順です。

```bash
# 0) clone
git clone https://github.com/shase/clasp-sheet-cli.git
cd clasp-sheet-cli

# 1) clasp を用意してログイン（対象シートにアクセスできるアカウントで）
npm install -g @google/clasp
clasp --version
clasp login

# 2) CLI をビルドしてリンク
npm install
npm run build
npm link

# 3) バックエンドの Apps Script を作成して push
cd apps-script
clasp create --type standalone --title "clasp-sheet-cli-backend"
clasp push -f          # WebApp.js とマニフェスト(webapp設定)を反映

# 4) スコープを認可（初回のみ）
#    エディタを開き、関数「ping」を1回実行して OAuth 同意を承認する
clasp open

# 5) Web アプリとしてデプロイし、exec URL を取得
clasp deploy --description "web app"
#    出力の Deployment ID (AKfyc...) から URL を組み立てる:
#      https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec

# 6) 設定を初期化（--web-app-url で HTTP モード、--auth clasp で Bearer 認証）
cd ..
sheet init \
  --clasp-project ./apps-script \
  --script-id <SCRIPT_ID> \
  --spreadsheet-id <SPREADSHEET_ID> \
  --default-sheet <SHEET_NAME> \
  --web-app-url "https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec" \
  --auth clasp

# 7) 診断 → 読み取り
sheet doctor
sheet read --range A1:C5
```

> `<SCRIPT_ID>` は `apps-script/.clasp.json` の `scriptId`（`cat apps-script/.clasp.json`）。
> `<SHEET_NAME>` はタブ名。日本語 UI の新規シートは `Sheet1` ではなく `シート1` のことがあるので、`sheet list` で実際の名前を確認してください。
> コードを更新したら `clasp push -f` の後、**同じ URL を維持するには** `clasp deploy -i <DEPLOYMENT_ID>` で同一デプロイを再デプロイ（`-i` なしだと新しい URL になります）。

## Configuration / 設定ファイル

`sheet init` はプロジェクトルートに `.sheet-tool.json` を生成します（`scriptId` / `spreadsheetId` / URL を含むため **`.gitignore` 済み**）。

```json
{
  "claspProjectPath": "./apps-script",
  "scriptId": "<SCRIPT_ID>",
  "spreadsheetId": "<SPREADSHEET_ID>",
  "defaultSheet": "シート1",
  "webAppUrl": "https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec",
  "auth": "clasp"
}
```

| フィールド | 必須 | 説明 |
|---|---|---|
| `claspProjectPath` | ✔ | Apps Script プロジェクトのパス（`clasp push`/`deploy` の対象） |
| `scriptId` | ✔ | Apps Script のスクリプト ID |
| `spreadsheetId` | ✔ | 操作対象のスプレッドシート ID |
| `defaultSheet` |  | `--sheet` 省略時に使うシート名 |
| `webAppUrl` | ✔ | 呼び出す Web アプリの `/exec` URL |
| `auth` |  | `clasp`（Bearer トークンを clasp 資格情報から付与）/ `none`（既定・ヘッダなし） |
| `token` |  | 各呼び出しに付与する共有シークレット（後述） |

## Usage / 使い方

```bash
sheet list

sheet read --sheet Sales --range A1:C20
sheet read --range A1:C20                 # --sheet 省略時は defaultSheet

sheet append --sheet Sales --json rows.json
cat rows.json | sheet append --sheet Sales
sheet append --sheet Sales --inline '[["2026-01-01",1200,"ok"]]'

sheet update --sheet Sales --range B2:D10 --json values.json
sheet clear  --sheet Sales --range A2:Z100

sheet create Inventory
sheet delete OldSheet

sheet status      # 設定とバックエンド疎通を表示
sheet doctor      # 環境診断
```

JSON 入力は 3 方式に対応: `--json <path>` / stdin / `--inline <json>`。

## Security / セキュリティ

- **`.sheet-tool.json` / `apps-script/.clasp.json` はコミットしない**（`.gitignore` 済み）。exec URL・scriptId・ローカルパスを含みます。
- 資格情報（`~/.clasprc.json`）はホーム配下にあり本リポジトリには含まれません。`--auth clasp` は実行時にそこから読み、**トークンを設定ファイルに保存しません**。
- `DOMAIN` / `MYSELF` アクセスにしておけば、URL が漏れても組織外/他人からは呼べません（`ANYONE_ANONYMOUS` は避ける）。
- さらに保護したい場合は**共有シークレット**を併用:
  - スクリプトの **Script Property** に `SHEET_TOOL_TOKEN = <任意の値>`（エディタ → プロジェクトの設定 → スクリプト プロパティ）
  - `sheet init` に `--token <同じ値>` を付ける
  - `SHEET_TOOL_TOKEN` があると、一致する `token` の無い呼び出しは `unauthorized` で拒否されます。
- 使い終わったデプロイは削除: `clasp undeploy <DEPLOYMENT_ID>`

## Corporate proxy / TLS 傍受環境（任意）

社内ネットワークが TLS を傍受して独自 CA を挿入している場合（Cloudflare WARP / Zscaler 等）、Node の HTTP や `clasp` が
`self-signed certificate in certificate chain` で失敗することがあります。その場合のみ、CA バンドルを Node に渡します。

```bash
# macOS: キーチェーンの全ルート CA を書き出す
mkdir -p ~/.certs
security find-certificate -a -p /Library/Keychains/System.keychain > ~/.certs/macos-ca.pem
security find-certificate -a -p /System/Library/Keychains/SystemRootCertificates.keychain >> ~/.certs/macos-ca.pem

# このシェル（子プロセスにも継承）で有効化。恒久化するなら ~/.zshrc に追記
export NODE_EXTRA_CA_CERTS="$HOME/.certs/macos-ca.pem"
```

該当しない環境では不要です。

## Troubleshooting / トラブルシュート

| 症状 | 対処 |
|---|---|
| `webapp-ping` が fail / `HTTP 401` | **ドメイン不一致が最有力**。`clasp` のログインアカウントと対象シートのアカウントを一致させる（`--auth clasp` は clasp と同じアカウントのトークンを使う） |
| レスポンスが JSON でない / HTML が返る | 認可未完了、またはアクセスが想定と違う。手順4の認可（ping 実行）とデプロイの access 設定を確認 |
| `ANYONE access has been disabled by your domain administrator` | 匿名公開が組織で禁止。`appsscript.json` を `"access": "DOMAIN"` にして再デプロイし、`--auth clasp` を使う |
| `unauthorized` | `SHEET_TOOL_TOKEN` と config の `token` を一致させる |
| `Sheet not found` | タブ名違い。`sheet list` で実名を確認（例: `シート1`） |
| `Unable to open spreadsheet` | `spreadsheetId` と、デプロイユーザーの共有権限を確認 |
| range エラー | A1 記法を確認（例 `A1:C20`） |
| `self-signed certificate in certificate chain` | 上記「Corporate proxy」の `NODE_EXTRA_CA_CERTS` を設定 |
| clasp が見つからない / 未ログイン | `npm install -g @google/clasp` / `clasp login` |

## Development / 開発

```bash
npm run build       # tsc でビルド
npm run typecheck
npm run dev -- --help
```

機能追加の手順:

1. `apps-script/` に関数を追加（`Code.js` に公開関数、`Spreadsheet.js` に実体）
2. `apps-script/WebApp.js` の `DISPATCH_` に関数を登録
3. `clasp push -f` → 必要なら `clasp deploy -i <ID>` で再デプロイ
4. `src/commands/index.ts` に CLI サブコマンドを追加
5. **Node 側に業務ロジックを持たせない**（入出力と実行制御のみ）

## Architecture Philosophy / アーキテクチャ思想

- **境界の固定**: Spreadsheet の業務ロジックは Apps Script に集約し、CLI は入出力と実行制御だけを担当する
- **実行方式の交換可能性**: コマンドは抽象実行インターフェースに依存し、HTTP / 将来の MCP など別方式へ差し替え可能
- **運用コスト最小化**: GCP プロジェクト・REST API クライアント・追加認証実装を避け、初期セットアップ負荷を下げる
- **可観測性と自己診断**: `doctor` / `status` で環境問題を先に検出し、エラー時は復旧手順を提示する
- **ローカルファースト**: npm 公開前提にせず、個人開発や自動化ジョブで即利用できる構成を維持する
