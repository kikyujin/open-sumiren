"""
SUMIREn-Univer バックエンド
FastAPI + Ollama / Gemini
"""
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import json

from llm_adapter import call_llm
from xllm_adapter import generate_xllm, GEMINI_API_KEY

LLM_BACKEND = os.environ.get("LLM_BACKEND", "ollama")

app = FastAPI(title="SUMIREn-Univer API")

# CORS（Vite dev serverからのアクセス許可）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- データディレクトリ ---
DATA_DIR = Path.home() / "open-sumiren" / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


# ============================================
# /api/health
# ============================================
@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "llm_backend": LLM_BACKEND,
        "gemini_configured": bool(GEMINI_API_KEY),
    }


# ============================================
# /api/llm — LLM実行
# ============================================
class LLMRequest(BaseModel):
    prompt: str
    context: str = ""
    model: str | None = None

@app.post("/api/llm")
def api_llm(req: LLMRequest):
    """
    LLM実行。LLM_BACKEND に応じて Ollama または Gemini を使う。
    model はノートブックの llm_model メタデータから渡される。
    """
    if LLM_BACKEND == "gemini":
        result = generate_xllm(req.prompt, req.context)
    else:
        full_prompt = req.prompt
        if req.context:
            full_prompt = f"以下のデータを参照してください:\n\n{req.context}\n\n{req.prompt}"
        result = call_llm(full_prompt, model=req.model)

    return {"text": result}


# ============================================
# /api/xllm — クラウドLLM実行（常にGemini）
# ============================================
@app.post("/api/xllm")
def api_xllm(req: LLMRequest):
    """
    xLLM実行。常に Gemini API を使う。
    """
    result = generate_xllm(req.prompt, req.context)
    return {"text": result}


# ============================================
# /api/read — ローカルファイル読み取り
# ============================================
class ReadRequest(BaseModel):
    uri: str  # file:///path/to/file

MAX_FILE_SIZE = 100 * 1024  # 100KB

@app.post("/api/read")
def api_read(req: ReadRequest):
    """
    file:/// URI を受け取り、ローカルファイルの中身を返す。
    UTF-8テキストのみ。100KB上限。
    """
    uri = req.uri

    # file:/// スキーム処理
    if uri.startswith("file:///"):
        filepath = Path(uri[7:])  # file:///Users/... → /Users/...
    elif uri.startswith("/"):
        filepath = Path(uri)
    else:
        return {"error": f"Unsupported URI scheme: {uri}"}

    # パスの正規化（セキュリティ最低限）
    filepath = filepath.resolve()

    if not filepath.is_file():
        return {"error": f"File not found: {filepath}"}

    size = filepath.stat().st_size
    truncated = False
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            if size > MAX_FILE_SIZE:
                content = f.read(MAX_FILE_SIZE)
                truncated = True
            else:
                content = f.read()
    except UnicodeDecodeError:
        return {"error": f"Not a UTF-8 text file: {filepath}"}

    return {
        "content": content,
        "path": str(filepath),
        "size": size,
        "truncated": truncated,
    }


# ============================================
# /api/save — ノートブック保存（.sumiren形式）
# ============================================
class SaveRequest(BaseModel):
    name: str
    snapshot: dict

@app.post("/api/save")
def api_save(req: SaveRequest):
    """
    ノートブックを .sumiren 形式（メタデータ + スナップショット）で保存。
    """
    filepath = DATA_DIR / f"{req.name}.sumiren"

    now = datetime.now(timezone.utc).isoformat()
    created_at = now
    llm_model = "gemma3:27b"

    # 既存ファイルがあれば created_at と llm_model を引き継ぐ
    if filepath.exists():
        try:
            existing = json.loads(filepath.read_text(encoding="utf-8"))
            if "meta" in existing:
                created_at = existing["meta"].get("created_at", now)
                llm_model = existing["meta"].get("llm_model", llm_model)
        except (json.JSONDecodeError, KeyError):
            pass  # 壊れてたら新規扱い

    data = {
        "version": 1,
        "meta": {
            "name": req.name,
            "llm_model": llm_model,
            "created_at": created_at,
            "updated_at": now,
        },
        "snapshot": req.snapshot,
    }

    filepath.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"status": "ok", "name": req.name}


# ============================================
# /api/load — ノートブック読み込み（.sumiren優先、.jsonフォールバック）
# ============================================
@app.get("/api/load")
def api_load(name: str = "default"):
    """
    保存済みノートブックを読み込む。
    .sumiren を優先し、なければ旧形式 .json にフォールバック。
    """
    sumiren_path = DATA_DIR / f"{name}.sumiren"
    json_path = DATA_DIR / f"{name}.json"

    if sumiren_path.exists():
        try:
            data = json.loads(sumiren_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {"meta": None, "snapshot": None}
        return {
            "meta": data.get("meta", {}),
            "snapshot": data.get("snapshot", {}),
        }
    elif json_path.exists():
        # 旧形式フォールバック
        try:
            snapshot = json.loads(json_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {"meta": None, "snapshot": None}
        return {
            "meta": {
                "name": name,
                "llm_model": "gemma3:27b",
                "created_at": None,
                "updated_at": None,
            },
            "snapshot": snapshot,
        }
    else:
        return {"meta": None, "snapshot": None}


# ============================================
# /api/notebooks — ノートブック一覧
# ============================================
@app.get("/api/notebooks")
def api_notebooks():
    """
    data/ ディレクトリのノートブック一覧を返す。
    .sumiren を優先し、同名の .json があっても .sumiren のみ返す。
    """
    notebooks = []
    seen_names = set()

    # .sumiren ファイルを先に処理
    for p in sorted(DATA_DIR.glob("*.sumiren")):
        name = p.stem
        seen_names.add(name)
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            meta = data.get("meta", {})
            notebooks.append({
                "name": meta.get("name", name),
                "llm_model": meta.get("llm_model", "gemma3:27b"),
                "created_at": meta.get("created_at"),
                "updated_at": meta.get("updated_at"),
            })
        except (json.JSONDecodeError, KeyError):
            notebooks.append({
                "name": name,
                "llm_model": "gemma3:27b",
                "created_at": None,
                "updated_at": None,
            })

    # .json ファイル（.sumiren が同名で存在しないもののみ）
    for p in sorted(DATA_DIR.glob("*.json")):
        name = p.stem
        if name in seen_names:
            continue
        notebooks.append({
            "name": name,
            "llm_model": "gemma3:27b",
            "created_at": None,
            "updated_at": None,
        })

    # updated_at 降順（Noneは末尾）
    notebooks.sort(key=lambda n: n.get("updated_at") or "", reverse=True)

    return {"notebooks": notebooks}


# ============================================
# /api/notebooks/rename — ノートブック名前変更
# ============================================
class RenameRequest(BaseModel):
    old_name: str
    new_name: str

@app.post("/api/notebooks/rename")
def api_rename_notebook(req: RenameRequest):
    """ノートブックのファイル名と meta.name を変更する。"""
    old_path = DATA_DIR / f"{req.old_name}.sumiren"
    new_path = DATA_DIR / f"{req.new_name}.sumiren"

    if not old_path.exists():
        return JSONResponse({"error": "not found"}, status_code=404)
    if new_path.exists():
        return JSONResponse({"error": "already exists"}, status_code=409)

    old_path.rename(new_path)

    # ファイル内の meta.name も更新
    try:
        data = json.loads(new_path.read_text(encoding="utf-8"))
        if "meta" in data:
            data["meta"]["name"] = req.new_name
            data["meta"]["updated_at"] = datetime.now(timezone.utc).isoformat()
        new_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    except json.JSONDecodeError:
        pass

    return {"status": "ok", "old_name": req.old_name, "new_name": req.new_name}


# ============================================
# /api/notebooks/update_meta — メタデータ部分更新
# ============================================
class UpdateMetaRequest(BaseModel):
    name: str
    llm_model: str | None = None

@app.post("/api/notebooks/update_meta")
def api_update_notebook_meta(req: UpdateMetaRequest):
    """ノートブックのメタデータを部分更新する。"""
    filepath = DATA_DIR / f"{req.name}.sumiren"
    if not filepath.exists():
        return JSONResponse({"error": "not found"}, status_code=404)

    try:
        data = json.loads(filepath.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return JSONResponse({"error": "corrupted file"}, status_code=500)

    meta = data.get("meta", {})
    if req.llm_model is not None:
        meta["llm_model"] = req.llm_model
    meta["updated_at"] = datetime.now(timezone.utc).isoformat()
    data["meta"] = meta

    filepath.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"status": "ok", "name": req.name}


# ============================================
# /api/notebooks/{name} DELETE — ノートブック削除
# ============================================
@app.delete("/api/notebooks/{name}")
def api_delete_notebook(name: str):
    """ノートブックを削除する。"""
    filepath = DATA_DIR / f"{name}.sumiren"
    if not filepath.exists():
        return JSONResponse({"error": "not found"}, status_code=404)

    filepath.unlink()
    return {"status": "ok", "name": name}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9300)
