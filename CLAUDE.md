# Open SUMIRE'n

LLMをスプレッドシートのセル内で実行できるローカルツール。
Univer（canvasベースOSSスプレッドシート）+ FastAPI + Ollama構成。

## ディレクトリ構成

```
open-sumiren/
├── backend/              # FastAPI (port 9300)
│   ├── main.py           # エンドポイント定義
│   ├── llm_adapter.py    # Ollama接続（LLM関数用）
│   ├── xllm_adapter.py   # Gemini API接続（xLLM関数用）
│   ├── requirements.txt  # fastapi, uvicorn, requests, python-dotenv
│   ├── .env              # 環境変数（git管理外）
│   ├── .env.example      # .env テンプレート
│   └── .venv/            # Python 3.12 仮想環境
├── frontend/             # Univer + React + Vite (port 5173)
│   ├── src/
│   │   ├── main.tsx      # エントリポイント
│   │   ├── App.tsx       # React Router定義（/ と /notebook/:name）
│   │   ├── pages/
│   │   │   ├── Desktop.tsx  # デスクトップ画面（React Flow）
│   │   │   └── Sheet.tsx    # シート画面（Univer + LLM実行 + 保存/復元）
│   │   └── components/
│   │       └── NotebookNode.tsx  # ノートブックノード（React Flow カスタムノード）
│   ├── index.html
│   ├── vite.config.ts    # /api → localhost:9300 プロキシ
│   └── tsconfig.json
├── frontend-v1/          # 旧フロント（React Flow + 自作セルエディタ）リネーム済み
├── data/                 # ノートブック保存ディレクトリ
│   ├── *.sumiren         # ノートブック（version + meta + snapshot のJSON）
│   ├── *.json            # 旧形式（loadでフォールバック対応、次回saveで.sumirenに移行）
│   └── canvas.json       # 旧フロントのデータ（残置）
├── cli/                  # CLI（未整備）
└── run.sh                # フロント+バックエンド一括起動
```

## APIエンドポイント

| メソッド | パス | 機能 |
|---------|------|------|
| GET | `/api/health` | ヘルスチェック |
| POST | `/api/llm` | LLM実行（Ollama or Gemini、LLM_BACKENDで切替） |
| POST | `/api/xllm` | xLLM実行（常にGemini API） |
| POST | `/api/read` | file:/// URI → ローカルファイル内容返却（UTF-8, 100KB上限） |
| POST | `/api/save` | ノートブック保存（.sumiren形式） |
| GET | `/api/load?name=xxx` | ノートブック読み込み（.sumiren優先、.jsonフォールバック） |
| GET | `/api/notebooks` | ノートブック一覧（メタデータ付き） |
| POST | `/api/notebooks/rename` | ノートブック名前変更 |
| POST | `/api/notebooks/update_meta` | メタデータ部分更新（llm_model等） |
| DELETE | `/api/notebooks/{name}` | ノートブック削除 |

## LLM式の書式

```
=LLM(input1, ..., prompt, output)    — ローカル or Gemini（LLM_BACKEND次第）
=xLLM(input1, ..., prompt, output)   — 常に Gemini API
```

- **最低2引数必須**: prompt, output
- **最後の引数** = output（出力先セル、必須）
- **最後から2番目** = prompt（セル参照 or 文字列リテラル）
- **それ以外** = input（入力ソース、0個以上）

### 例

```
=LLM("hello", A1)                     # promptのみ、出力先A1
=LLM(B2, C2, D2)                      # input=B2, prompt=C2(セル参照), output=D2
=LLM(B2, "summarize", D2)             # input=B2, prompt文字列, output=D2
=LLM(B2, B5, B7, C7, E7)              # 複数input, prompt=C7, output=E7
```

### 注意

- 数式内に日本語文字列リテラルを書かない（Univer v0.18.0のバグ回避）。プロンプトは別セルに書いてセル参照する
- inputセルの値がファイルパス（`file:///` または `/` で始まる）の場合、`/api/read` 経由でファイル内容に自動展開される
- 複数inputは `【入力: セル名】` ヘッダー付きで結合されてLLMに渡される

## 起動方法

```bash
./run.sh
```

または個別に：

```bash
# バックエンド
cd backend
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 9300 --reload

# フロントエンド
cd frontend
npm run dev
```

ブラウザで http://localhost:5173 を開く。

## 開発状況

- Phase 0: Univer + FastAPI基盤 ✅
- Phase 0.1: 数式保持（案B: 出力先セル指定方式） ✅
- Phase 0.2: file:/// URI解決 ✅
- Phase 0.3: プロンプトのセル参照対応（日本語バグ回避） ✅
- Phase 0.4: 複数入力ソース対応 + 汎用パーサー ✅
- Phase 1.1: React Router導入（デスクトップ / シート 2画面構成） ✅
- Phase 1.2: 保存フォーマット拡張（.sumiren形式 + ノートブック一覧API） ✅
- Phase 1.3: デスクトップ画面（React Flow） ✅
- Phase 1.4: デスクトップメニュー（新規ノートブック作成） ✅
- Phase 1.5: ノードメニュー（名前変更、LLMモデル設定、削除） ✅
- Phase 1.6: xLLM関数（Gemini API）+ llm_model反映 ✅
- Phase 1.7: シートメニューUI改善（タブタイトル、自動保存） ✅

## 技術スタック

- **フロントエンド**: Univer 0.18.0 / React 19 / Vite 8 / TypeScript / react-router-dom / @xyflow/react (React Flow v12)
- **バックエンド**: FastAPI 0.115 / Python 3.12
- **LLM**: Ollama (gemma3:27b, localhost:11434) / Gemini API (gemini-2.5-flash-lite, REST直叩き)

## 環境変数

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `GEMINI_API_KEY` | — | Gemini APIキー。xLLM / LLM(gemini)に必要 |
| `LLM_BACKEND` | `ollama` | LLM関数のバックエンド。`ollama` or `gemini` |
