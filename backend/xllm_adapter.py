# ============================================================
# xLLM Adapter — クラウドLLMアダプタ
# ============================================================
# このファイルは xLLM 関数（=xLLM(...)）のバックエンドです。
# デフォルトでは Google Gemini API を使いますが、
# 別のLLMプロバイダに差し替えたい場合はこのファイルを編集してください。
#
# 必要なのは generate_xllm(prompt, context) → str を維持することだけです。
# ============================================================

import os
import requests

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-2.5-flash-lite"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"


def generate_xllm(prompt: str, context: str = "") -> str:
    """
    クラウド LLM でテキスト生成。

    別のプロバイダに差し替える場合、この関数のシグネチャ（引数と戻り値）を
    維持してください。呼び出し元は prompt(str) と context(str) を渡し、
    結果の文字列を受け取ります。エラー時は "#ERROR: ..." を返してください。
    """
    print(f"[xLLM] model={GEMINI_MODEL}")

    if not GEMINI_API_KEY:
        return "#ERROR: GEMINI_API_KEY が設定されていません"

    full_prompt = f"{context}\n\n{prompt}".strip() if context else prompt

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": full_prompt}
                ]
            }
        ]
    }

    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
    }

    try:
        resp = requests.post(
            GEMINI_URL,
            json=payload,
            headers=headers,
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()

        candidates = data.get("candidates", [])
        if not candidates:
            return "#ERROR: Gemini からの応答が空です"

        parts = candidates[0].get("content", {}).get("parts", [])
        text_parts = [p["text"] for p in parts if "text" in p]
        return "\n".join(text_parts) if text_parts else "#ERROR: テキスト応答なし"

    except requests.exceptions.Timeout:
        return "#ERROR: Gemini API タイムアウト（120s）"
    except requests.exceptions.HTTPError as e:
        return f"#ERROR: Gemini API {e.response.status_code}: {e.response.text[:200]}"
    except Exception as e:
        return f"#ERROR: {str(e)[:200]}"
