import base64
import io
import json
import time
from functools import lru_cache
from typing import Any

from flask import current_app
from google import genai
from google.genai import types
from PIL import Image, UnidentifiedImageError


class GeminiError(RuntimeError):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


@lru_cache(maxsize=1)
def _client(api_key: str | None):
    if not api_key:
        raise GeminiError("GEMINI_API_KEY is not configured")
    return genai.Client(api_key=api_key)


def _status_from_error(error: Exception) -> int | None:
    for attr in ("status_code", "code"):
        value = getattr(error, attr, None)
        if isinstance(value, int):
            return value
    text = str(error)
    if "503" in text or "UNAVAILABLE" in text:
        return 503
    if "429" in text or "RESOURCE_EXHAUSTED" in text:
        return 429
    if "401" in text or "403" in text or "API key" in text:
        return 401
    return None


def _friendly_error(error: Exception) -> GeminiError:
    status_code = _status_from_error(error)
    if status_code == 429:
        return GeminiError("Gemini quota or rate limit reached", 429)
    if status_code == 503:
        return GeminiError("Gemini is currently overloaded", 503)
    if status_code == 401:
        return GeminiError("Gemini API key is invalid or unauthorized", 401)
    return GeminiError(f"Gemini API request failed: {error}", status_code)


def _image_from_bytes(image_bytes: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(image_bytes))
        image.load()
        return image
    except UnidentifiedImageError as exc:
        raise GeminiError("Uploaded file is not a valid image", 400) from exc


def generate_text(
    prompt: str,
    *,
    system_instruction: str | None = None,
    image_bytes: bytes | None = None,
    image_mime_type: str | None = None,
    temperature: float = 0.4,
    model: str | None = None,
) -> str:
    api_key = current_app.config.get("GEMINI_API_KEY")
    client = _client(api_key)
    selected_model = model or current_app.config.get("GEMINI_MODEL", "gemini-2.5-flash")
    contents: list[Any] = []

    if image_bytes:
        contents.append(_image_from_bytes(image_bytes))
    contents.append(prompt)

    config = types.GenerateContentConfig(
        temperature=temperature,
        system_instruction=system_instruction,
    )

    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model=selected_model,
                contents=contents,
                config=config,
            )
            text = response.text or ""
            return text.strip()
        except Exception as exc:
            gemini_error = _friendly_error(exc)
            if gemini_error.status_code in {429, 503} and attempt < 2:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise gemini_error from exc

    raise GeminiError("Gemini API request failed")


def generate_image(
    prompt: str,
    *,
    model: str = "gemini-2.5-flash-image",
) -> str:
    """Generate an image with Gemini and return as base64 data URL (data:image/...;base64,...)."""
    api_key = current_app.config.get("GEMINI_API_KEY")
    client = _client(api_key)

    config = types.GenerateContentConfig(
        response_modalities=["IMAGE", "TEXT"],
    )

    try:
        response = client.models.generate_content(
            model=model,
            contents=[prompt],
            config=config,
        )
    except Exception as exc:
        raise _friendly_error(exc) from exc

    for candidate in (response.candidates or []):
        for part in (candidate.content.parts or []):
            if part.inline_data is not None:
                raw = part.inline_data.data
                mime_type = part.inline_data.mime_type or "image/png"
                b64 = base64.b64encode(raw).decode("utf-8") if isinstance(raw, bytes) else raw
                return f"data:{mime_type};base64,{b64}"

    raise GeminiError("Gemini 未回傳圖片內容")


def generate_json(
    prompt: str,
    *,
    system_instruction: str | None = None,
    image_bytes: bytes | None = None,
    image_mime_type: str | None = None,
    temperature: float = 0.2,
    model: str | None = None,
) -> dict[str, Any] | list[Any]:
    text = generate_text(
        prompt,
        system_instruction=system_instruction,
        image_bytes=image_bytes,
        image_mime_type=image_mime_type,
        temperature=temperature,
        model=model,
    )
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise GeminiError("Gemini returned invalid JSON") from exc
