# clasp-sheet-cli

Google Apps Script + clasp run を使って、ローカルから Google Sheets を操作するための CLI です。

Local CLI for manipulating Google Sheets through Google Apps Script via clasp run.

## Overview / 概要

- Spreadsheet の業務ロジックは Apps Script 側だけに置く
- Node 側は CLI 入力、設定、実行、整形のみ担当
- Google Sheets REST API は使わず clasp run を使う

Why this approach:

- OAuth クライアント実装を CLI 側に持たずに済む
- スプレッドシート処理を Apps Script に集約できる
- ローカル自動化に向いた最小構成を保てる

## Advantages / 既存ツール比較での利点

- Google Sheets REST API クライアント実装が不要
- サービスアカウント運用や API キー管理が不要
- Sheets API クライアント方式と比べて、専用 GCP プロジェクトの新規作成なしで始めやすい
  - Apps Script + clasp の標準フローで実行できる
- Spreadsheet ロジックを Apps Script 側に固定でき、CLI は薄く保てる
- clasp run ベースなのでローカル自動化に組み込みやすい

注意:

- clasp run の利用には Apps Script API の有効化が必要です

## Architecture / 構成

```text
.
├── apps-script/
│   ├── Code.js
│   ├── Spreadsheet.js
│   ├── Utils.js
│   └── appsscript.json
├── src/
│   ├── cli.ts
│   ├── config.ts
│   ├── clasp.ts
│   ├── commands/
│   │   └── index.ts
│   └── types.ts
├── README.md
├── package.json
└── tsconfig.json
```

将来 MCP / Apps Script Execution API / HTTP に切り替えられるよう、コマンドは抽象実行インターフェースに依存しています。

## Quickstart

最短で動かす手順です。

```bash
# 0) clone
git clone https://github.com/shase/clasp-sheet-cli.git
cd clasp-sheet-cli

# 1) install tools
npm install -g @google/clasp
clasp --version
clasp login

# 2) install and build CLI
npm install
npm run build
npm link

# 3) create Apps Script project
cd apps-script
clasp create --type standalone --title "clasp-sheet-cli-backend"
clasp push

# 4) get scriptId
cat .clasp.json

cd ..

# 5) initialize config
sheet init \
  --clasp-project ./apps-script \
  --script-id <SCRIPT_ID> \
  --spreadsheet-id <SPREADSHEET_ID> \
  --default-sheet Sheet1

# 6) diagnostics
sheet doctor
sheet status
sheet list
```

Quick test:

```bash
sheet read --sheet Sheet1 --range A1:C5
```

## Installation / インストール

Prerequisites:

- Node.js 20+
- npm
- Google account
- clasp
- Apps Script API enabled

```bash
npm install -g @google/clasp
npm install
npm run build
```

ローカルコマンドとして使う場合:

```bash
npm link
```

## Initial Setup / 初期設定

1. clasp ログイン

```bash
clasp login
```

2. apps-script 配下でプロジェクト作成または clone

```bash
cd apps-script
clasp create --type standalone --title "sheet-clasp-backend"
# or
clasp clone <SCRIPT_ID>
```

3. apps-script/.clasp.json に scriptId があることを確認
4. Apps Script ソースを反映して push

```bash
clasp push
```

5. Apps Script API を有効化
6. 初回は Apps Script 側で認可を完了
7. プロジェクトルートで設定ファイル作成

```bash
sheet init \
  --clasp-project ./apps-script \
  --script-id <SCRIPT_ID> \
  --spreadsheet-id <SPREADSHEET_ID> \
  --default-sheet Sales
```

8. 診断

```bash
sheet doctor
sheet status
```

## Usage / 使い方

```bash
sheet list

sheet read --sheet Sales --range A1:C20

sheet append --sheet Sales --json rows.json
cat rows.json | sheet append --sheet Sales
sheet append --sheet Sales --inline '[["2026-01-01",1200,"ok"]]'

sheet update --sheet Sales --range B2:D10 --json values.json
sheet clear --sheet Sales --range A2:Z100

sheet create Inventory
sheet delete OldSheet
```

JSON 入力は次の 3 方式に対応:

- --json <path>
- stdin
- --inline <json>

## Troubleshooting / トラブルシュート

- clasp が見つからない
  - npm install -g @google/clasp
- clasp 未ログイン
  - clasp login
- scriptId 不一致
  - .sheet-tool.json と apps-script/.clasp.json を一致させる
- 実行エラー
  - clasp push、Apps Script API 有効化、認可の再実行
- spreadsheet アクセス不可
  - spreadsheetId と共有権限を確認
- range エラー
  - A1 記法を確認

## Development / 開発

```bash
npm run build
npm run typecheck
npm run dev -- --help
```

拡張手順:

1. Apps Script 側に関数追加
2. clasp push
3. src/commands/index.ts にコマンド追加
4. Node 側に業務ロジックを持たせない
