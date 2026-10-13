"""Clients for the language models used by summarizer B and the Q&A feature.

``OllamaClient`` talks to a local Ollama server (the default - nothing leaves the
machine, NFR6). ``ClaudeClient`` is the optional cloud comparison point and is
only constructed when explicitly enabled in settings (spec §8, §19).
"""

import json
from typing import Any, Protocol, cast

import httpx

from app.config import Settings


class LLMError(RuntimeError):
    pass


class LLMTruncated(LLMError):
    """The answer hit the output-length cap (usually a runaway, repeating generation)."""


class LLMClient(Protocol):
    name: str

    def complete_json(self, system: str, user: str, schema: dict[str, Any]) -> str: ...

    def complete_text(self, system: str, user: str) -> str: ...

    def release(self) -> None: ...


class OllamaClient:
    # The answer is streamed, so a long generation never hits a timeout; the read timeout only
    # covers silences, e.g. loading the model or reading a long prompt on a small GPU.
    def __init__(
        self,
        base_url: str,
        model: str,
        num_ctx: int,
        read_timeout_s: float = 900.0,
        max_output_tokens: int = 4096,
    ) -> None:
        self.name = f"ollama:{model}"
        self._model = model
        self._num_ctx = num_ctx
        # Without a cap a model can loop until the context window is full; Ollama then silently
        # drops the start of the conversation (the instructions and transcript) and keeps going.
        self._max_output_tokens = max_output_tokens
        self._http = httpx.Client(base_url=base_url, timeout=httpx.Timeout(read_timeout_s, connect=10.0))

    def _chat(self, system: str, user: str, fmt: dict[str, Any] | None) -> str:
        body: dict[str, Any] = {
            "model": self._model,
            "stream": True,
            "keep_alive": "2m",
            "options": {"num_ctx": self._num_ctx, "num_predict": self._max_output_tokens, "temperature": 0.2},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        }
        if fmt is not None:
            body["format"] = fmt  # Ollama constrains decoding to this JSON schema
        parts: list[str] = []
        truncated = False
        try:
            with self._http.stream("POST", "/api/chat", json=body) as resp:
                if resp.status_code != 200:
                    raise LLMError(f"Ollama returned {resp.status_code}: {resp.read().decode(errors='replace')[:300]}")
                for line in resp.iter_lines():
                    if not line.strip():
                        continue
                    event = json.loads(line)
                    if event.get("error"):
                        raise LLMError(f"Ollama error: {event['error']}")
                    parts.append(event.get("message", {}).get("content", ""))
                    if event.get("done"):
                        truncated = event.get("done_reason") == "length"
                        break
        except httpx.ConnectError as exc:
            raise LLMError(
                f"Could not reach Ollama at {self._http.base_url}. Is it running, and has "
                f"'ollama pull {self._model}' been run?"
            ) from exc
        except httpx.TimeoutException as exc:
            raise LLMError(
                "The local language model stopped responding for too long. The computer may be overloaded; "
                "press Retry - finished steps are kept."
            ) from exc
        except httpx.HTTPError as exc:
            raise LLMError(f"Lost the connection to Ollama: {exc}") from exc
        if truncated:
            raise LLMTruncated(f"The answer was cut off after {self._max_output_tokens} tokens.")
        return "".join(parts)

    def complete_json(self, system: str, user: str, schema: dict[str, Any]) -> str:
        return self._chat(system, user, schema)

    def complete_text(self, system: str, user: str) -> str:
        return self._chat(system, user, None)

    def release(self) -> None:
        """Unload the model from GPU memory so the next job's Whisper model fits."""
        try:
            self._http.post("/api/generate", json={"model": self._model, "keep_alive": 0})
        except httpx.HTTPError:
            pass


class ClaudeClient:
    """Claude via the Anthropic API: all LLM work in cloud mode, or the optional "cloud" summarizer.

    A whole meeting fits in one request (1M-token context), so there is no chunking and the
    minutes come back in a single call. The answer is streamed so long outputs never time out.
    """

    def __init__(self, api_key: str, model: str, effort: str = "low", max_output_tokens: int = 32_000) -> None:
        import anthropic

        self.name = f"anthropic:{model}"
        self._model = model
        self._effort = effort
        self._max_output_tokens = max_output_tokens
        self._client = anthropic.Anthropic(api_key=api_key)

    def _create(self, system: str, user: str, output_format: dict[str, Any] | None) -> str:
        import anthropic
        from anthropic.types.beta import BetaOutputConfigParam

        output_config = cast(BetaOutputConfigParam, {"effort": self._effort})
        if output_format is not None:
            output_config["format"] = cast(Any, output_format)
        try:
            with self._client.beta.messages.stream(
                model=self._model,
                max_tokens=self._max_output_tokens,
                # On a safety decline, let the API re-run the request on a suitable fallback model.
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
                output_config=output_config,
                system=system,
                messages=[{"role": "user", "content": user}],
            ) as stream:
                response = stream.get_final_message()
        except anthropic.AuthenticationError as exc:
            raise LLMError("Claude rejected the API key. Check ANTHROPIC_API_KEY in the settings.") from exc
        except anthropic.RateLimitError as exc:
            raise LLMError("Claude's rate limit was reached. Wait a minute, then press Retry.") from exc
        except anthropic.APIStatusError as exc:
            raise LLMError(f"Claude API error {exc.status_code}: {exc.message}") from exc
        except anthropic.APIConnectionError as exc:
            raise LLMError("Could not reach the Claude API. Check the server's internet connection.") from exc
        if response.stop_reason == "refusal":
            raise LLMError("The cloud model declined this request.")
        if response.stop_reason == "max_tokens":
            raise LLMTruncated(f"The answer was cut off after {self._max_output_tokens} tokens.")
        return "".join(block.text for block in response.content if block.type == "text")

    def complete_json(self, system: str, user: str, schema: dict[str, Any]) -> str:
        return self._create(system, user, {"type": "json_schema", "schema": schema})

    def complete_text(self, system: str, user: str) -> str:
        return self._create(system, user, None)

    def release(self) -> None:
        pass


def make_llm_client(settings: Settings, kind: str) -> LLMClient:
    if kind == "cloud" or settings.uses_cloud_ai:
        if not settings.anthropic_api_key:
            raise LLMError("Claude needs an API key. Add ANTHROPIC_API_KEY to the server settings.")
        if kind == "cloud" and not (settings.cloud_llm_enabled or settings.uses_cloud_ai):
            raise LLMError("The cloud LLM is disabled. Set CLOUD_LLM_ENABLED=true or AI_PROVIDER=cloud to use it.")
        return ClaudeClient(
            settings.anthropic_api_key,
            settings.cloud_llm_model,
            effort=settings.cloud_llm_effort,
            max_output_tokens=settings.cloud_llm_max_output_tokens,
        )
    return OllamaClient(
        settings.ollama_url,
        settings.ollama_model,
        settings.llm_context_tokens,
        max_output_tokens=settings.llm_max_output_tokens,
    )
