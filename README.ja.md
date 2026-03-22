# SUMIRE-n

**LLMをスプレッドシートのセルで動かすローカルツール。**

Excelが `=SUM()` で計算を民主化したように、
SUMIRE-n は `=LLM()` で「あれどうなってたっけ？」を民主化します。

セルに `=LLM(B2, "要約して", D2)` と書いて ▶ を押すだけ。LLMがローカルファイルを読み込み、結果をセルに書き戻します。LLMの知識は不要 — セルに書くだけです。

> **SUMIRE-n**: **S**tructured **U**nified **M**ap for **I**nterlinked **R**eferences and **E**xecution - **N**otebook

[English README](README.md)

![screenshot](docs/screenshot.png)

---

## 特徴

- **セルで `=LLM()`** — `=SUM()` と同じ感覚で、セルからローカルLLM（Ollama）を実行
- **セルで `=xLLM()`** — より高品質なクラウドLLM（Gemini API）も利用可能
- **ファイル参照** — セルにファイルパス（`file:///path/to/spec.md`）を書けば、LLM実行時に自動で読み込み
- **複数ノートブック** — プロジェクトごとに `.sumiren` ファイルで管理
- **デスクトップビュー** — 全ノートブックを一覧表示（React Flow）
- **完全ローカル** — データは手元に。クラウドは不要（xLLM 使用時を除く）

---

## クイックスタート

### 必要なもの

| ソフトウェア | バージョン | 必須 |
|------------|-----------|------|
| Node.js | 18以上 | ✅ |
| Python | 3.12以上（3.12で動作確認済み） | ✅ |
| Ollama | 0.18以上 | ⚡ ローカルLLM用（`=LLM()`） |
| Gemini APIキー | — | ⚡ クラウドLLM用（`=xLLM()`） |

Ollama と Gemini APIキーは**どちらか一方**があれば動きます。UIだけ試す場合は両方なくてもOKです。

### 1. クローン & インストール

```bash
git clone https://github.com/kikyujin/open-sumiren.git
cd open-sumiren

# フロントエンド
cd frontend
npm install
cd ..

# バックエンド
cd backend
python3 -m venv .venv
source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

### 2. LLMのセットアップ（どちらか、または両方）

#### 方法A: Ollama でローカルLLM（推奨）

[ollama.com/download](https://ollama.com/download) から Ollama をインストールし、モデルを取得:

```bash
# 推奨モデル
ollama pull gemma3:27b     # 27B — RAM 16GB以上、最高品質
ollama pull gemma3:12b     # 12B — RAM 8GB以上、バランス型
```

他の Ollama モデルでも動く可能性がありますが、動作確認はしていません。

設定は不要。Ollama はデフォルトで `localhost:11434` で起動します。

#### 方法B: Gemini API でクラウドLLM

[Google AI Studio](https://aistudio.google.com/apikey) で無料のAPIキーを取得し、設定:

```bash
cp backend/.env.example backend/.env
# backend/.env を編集してキーを設定:
# GEMINI_API_KEY=AIza-xxxxxxxx
```

**すべての** LLM呼び出しを Gemini で行う場合（Ollama不要）:

```bash
# backend/.env
GEMINI_API_KEY=AIza-xxxxxxxx
LLM_BACKEND=gemini
```

### 3. 起動

```bash
./run.sh
```

または個別に起動:

```bash
# ターミナル1: バックエンド
cd backend
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 9300 --reload

# ターミナル2: フロントエンド
cd frontend
npm run dev
```

ブラウザで [http://localhost:5173](http://localhost:5173) を開きます。

### 4. はじめての操作

起動すると空のデスクトップが表示されます。以下の手順で始めてください:

1. 背景を**右クリック** →「📓 新規ノートブック」→ 名前を入力（例: `my-project`）
2. 表示されたノートブックカードを**ダブルクリック**してシートを開く
3. セルに以下を入力:

| | A | B | C |
|---|---|---|---|
| 1 | hello world | translate in Chinese | |
| 2 | | `=LLM(A1, B1, C1)` | |

4. **B2**（数式セル）を選択した状態で右上の **▶ LLM実行** をクリック — C1 に **你好世界** と表示されます
5. **Cmd+S**（または Ctrl+S）で保存

**次のステップ:** セルにファイルパス（例: `file:///Users/you/project/README.md`）を入力し、`=LLM()` で要約してみましょう。

---

## 使い方

### LLM式の書き方

```
=LLM(input, "prompt", output)
```

| 引数 | 説明 |
|------|------|
| `input` | データやファイルパスが入ったセル参照。複数指定可 |
| `"prompt"` | LLMへの指示。日本語はセル参照で渡す（下記注意参照） |
| `output` | 結果の書き込み先セル。数式は残るので再実行可能 |

**例:**

```
=LLM(B2, C2, D2)           — B2の内容をC2のプロンプトで処理、結果をD2へ
=LLM(B2, B5, C2, D2)       — 複数入力（B2, B5）、プロンプトC2、出力D2
=xLLM(B2, C2, D2)          — 同じ文法でGemini APIを使用
```

**ファイル参照:** セルに `file:///Users/you/project/README.md` のようなパスを書くと、LLM実行時にファイル内容が自動で読み込まれます。

**⚠️ 日本語プロンプトの注意:** Univer v0.18 のバグにより、数式内に直接日本語を書くと正しく動きません。プロンプトは別セルに書いてセル参照で渡してください。

### デスクトップ & ノートブック

- **デスクトップ**（`/`）: ノートブックをカード一覧で表示。右クリックで新規作成・名前変更・削除
- **シート**（`/notebook/{name}`）: スプレッドシート画面。数式を書いて ▶ でLLM実行
- ノートブックは `data/` ディレクトリに `.sumiren` ファイルとして保存されます

---

## 環境変数

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `GEMINI_API_KEY` | — | Gemini APIキー。`=xLLM()` に必要 |
| `LLM_BACKEND` | `ollama` | `=LLM()` のバックエンド。`gemini` にすると全てGeminiで動作 |

---

## クラウドLLMの差し替え

SUMIRE-n はデフォルトで `=xLLM()` に Gemini を使いますが、`backend/xllm_adapter.py` を編集するだけで任意のLLMプロバイダに差し替えできます。

ファイル内に OpenAI や Anthropic Claude への差し替え方法がコメントで書かれています。ルールは1つだけ: `generate_xllm(prompt, context) → str` の関数シグネチャを維持してください。

---

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| スプレッドシートUI | [Univer](https://univer.ai/) 0.18（canvasベース、Apache-2.0） |
| デスクトップビュー | [React Flow](https://reactflow.dev/) v12 |
| フロントエンド | React 19, Vite 8, TypeScript |
| バックエンド | FastAPI 0.115, Python 3.12 |
| ローカルLLM | [Ollama](https://ollama.com/) |
| クラウドLLM | Google Gemini API（REST） |

---

## プロジェクト構成

```
open-sumiren/
├── frontend/           # React + Univer + Vite
│   └── src/
│       ├── pages/      # Desktop.tsx, Sheet.tsx
│       └── components/ # NotebookNode.tsx
├── backend/            # FastAPI
│   ├── main.py         # APIエンドポイント
│   ├── llm_adapter.py  # Ollama アダプタ
│   └── xllm_adapter.py # Gemini アダプタ（他プロバイダに差し替え可能）
├── data/               # ノートブック保存先（.sumiren）
└── run.sh              # 一括起動
```

---

## ロードマップ

- [x] **Phase 0**: セルでLLMが動く（Univer + FastAPI + Ollama）
- [x] **Phase 1**: 複数ノートブック、デスクトップビュー、クラウドLLM、OSS公開
- [ ] **Phase 2**: チェーン実行、ヘルスチェック、代表値
- [ ] **Phase 3**: ノートブック間セル参照、エッジ可視化

詳細は [docs/roadmap.md](docs/roadmap.md) を参照。

---

## ライセンス

Apache License 2.0。[LICENSE](LICENSE) を参照。

---

## クレジット

[@kikyujin](https://github.com/kikyujin) + 🦊 エルマー
