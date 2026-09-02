# Railway + Vanna migration, Phase 5 (see .claude/skills/railway-vanna-migration/SKILL.md,
# decision 2). LLM connector pointed at OpenRouter — mirrors
# server/src/config/openrouter.ts exactly: OpenRouter exposes an OpenAI-compatible Chat
# Completions API, so the official `openai` SDK is reused here too rather than a bespoke HTTP
# client, and the same OPENROUTER_API_KEY / OPENROUTER_MODEL env vars are reused (decision 2 —
# don't add a second AI provider or credential for this).
#
# Deliberately NOT wired into the /generate-sql endpoint yet (see app/main.py) — this client
# exists here, built and independently testable (see tests/test_openrouter_llm.py), so it's
# ready to hand to a real Vanna LLM mixin once Phase 7's training sub-step needs one. It is not
# itself a Vanna object and doesn't import the `vanna` package at all.
from __future__ import annotations

import os

from openai import OpenAI

DEFAULT_MODEL = "anthropic/claude-sonnet-4.5"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


def build_openrouter_client() -> OpenAI:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError(
            "OPENROUTER_API_KEY is not set — see vanna-service/.env.example."
        )
    return OpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=api_key,
        default_headers={
            # Same attribution headers server/src/config/openrouter.ts sends — optional but
            # harmless. See https://openrouter.ai/docs/quickstart.
            "HTTP-Referer": os.environ.get("CLIENT_ORIGIN", "http://localhost:5173"),
            "X-Title": "Nucase Agent (Vanna service)",
        },
    )


def get_model() -> str:
    return os.environ.get("OPENROUTER_MODEL", DEFAULT_MODEL)


def check_connection() -> str:
    """Minimal smoke test: makes one real chat completion call and returns the reply text.

    Not called by any HTTP route in Phase 5 — exists purely so this connector can be verified
    on its own, independently of /generate-sql (which never calls it yet). Raises rather than
    swallowing errors, since this is a diagnostic entry point, not user-facing.
    """
    client = build_openrouter_client()
    response = client.chat.completions.create(
        model=get_model(),
        messages=[{"role": "user", "content": "Reply with exactly: OK"}],
        max_tokens=5,
    )
    return response.choices[0].message.content or ""
