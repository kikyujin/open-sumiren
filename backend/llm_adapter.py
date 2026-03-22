"""Ollama LLM adapter for SUMIRE'n cells."""

import requests

OLLAMA_URL = "http://localhost:11434/api/generate"
DEFAULT_MODEL = "gemma3:27b"

SYSTEM_PROMPT = (
    "あなたはスプレッドシートのセルです。\n"
    "入力されたデータを処理し、セルに表示する短い値を返してください。\n"
    "長い説明は不要です。1024文字以内を目安に返答してください。"
)


def call_llm(prompt: str, model: str | None = None) -> str:
    """Send a prompt to Ollama and return the response text."""
    use_model = model or DEFAULT_MODEL
    print(f"[LLM] model={use_model}")
    try:
        resp = requests.post(
            OLLAMA_URL,
            json={
                "model": use_model,
                "prompt": prompt,
                "system": SYSTEM_PROMPT,
                "stream": False,
            },
            timeout=120,
        )
        resp.raise_for_status()
        return resp.json()["response"].strip()
    except requests.exceptions.ConnectionError:
        return "#ERROR: Ollama に接続できません（localhost:11434）"
    except requests.exceptions.Timeout:
        return "#ERROR: Ollama タイムアウト（120s）"
    except requests.exceptions.HTTPError as e:
        return f"#ERROR: Ollama {e.response.status_code}: {e.response.text[:200]}"
    except Exception as e:
        return f"#ERROR: {str(e)[:200]}"
