# services/ai.py
import logging
from typing import List, Optional

import httpx
from google import genai
from google.genai import types as genai_types

from apps.api.core.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Gemini Client
# ---------------------------------------------------------------------------

class GeminiClient:
    """
    Wraps google-genai SDK.
    - generate(): text generation via Gemini Pro/Flash
    - embed(): text embedding via text-embedding-004 (768-dim)
    """

    DEFAULT_MODEL = "gemini-2.0-flash"
    EMBED_MODEL = "models/text-embedding-004"

    def __init__(self, api_key: str) -> None:
        self._client = genai.Client(api_key=api_key)

    async def generate(
        self,
        prompt: str,
        model: str = DEFAULT_MODEL,
        system_instruction: Optional[str] = None,
        temperature: float = 0.2,
        max_output_tokens: int = 4096,
    ) -> str:
        config = genai_types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            system_instruction=system_instruction,
        )
        response = await self._client.aio.models.generate_content(
            model=model,
            contents=prompt,
            config=config,
        )
        return response.text or ""

    async def embed(self, text: str) -> List[float]:
        response = await self._client.aio.models.embed_content(
            model=self.EMBED_MODEL,
            contents=text,
        )
        return response.embeddings[0].values


# ---------------------------------------------------------------------------
# Featherless Client  (OpenAI-compatible REST)
# ---------------------------------------------------------------------------

class FeatherlessClient:
    """
    Wraps the Featherless AI OpenAI-compatible API.
    Default model: Qwen/Qwen3-Coder-30B-A3B-Instruct
    """

    DEFAULT_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct"

    def __init__(self, api_key: str, base_url: str) -> None:
        self._http = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=120.0,
        )

    async def generate(
        self,
        prompt: str,
        model: str = DEFAULT_MODEL,
        system_instruction: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 4096,
    ) -> str:
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        response = await self._http.post(
            "/chat/completions",
            json={
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]

    async def aclose(self) -> None:
        await self._http.aclose()


# ---------------------------------------------------------------------------
# Module-level singletons
# ---------------------------------------------------------------------------

_gemini: Optional[GeminiClient] = None
_featherless: Optional[FeatherlessClient] = None


def get_gemini_client() -> GeminiClient:
    global _gemini
    if _gemini is None:
        _gemini = GeminiClient(api_key=settings.GEMINI_API_KEY)
    return _gemini


def get_featherless_client() -> FeatherlessClient:
    global _featherless
    if _featherless is None:
        _featherless = FeatherlessClient(
            api_key=settings.FEATHERLESS_API_KEY,
            base_url=settings.FEATHERLESS_BASE_URL,
        )
    return _featherless
