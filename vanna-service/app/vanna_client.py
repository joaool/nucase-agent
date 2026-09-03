# Railway + Vanna migration, Phase 7 (see .claude/skills/railway-vanna-migration/SKILL.md).
# Constructs the real Vanna object this service trains and (once wired into /generate-sql)
# generates SQL from. Built against `vanna.legacy` (OpenAI_Chat + PG_VectorStore) — see the
# Phase 7 entry in SKILL.md for the researched reasoning behind that choice over vanna.core/agents.
#
# NEVER holds an on-prem/Azure SQL credential — only Postgres (for the vector store) and the
# OpenRouter LLM connector. This class is only ever used for train()/generate_sql(); nothing
# here calls run_sql()/ask()/VannaFlaskApp — see app/main.py's module docstring for why that
# matters.
from __future__ import annotations

import os

from vanna.legacy.base import VannaBase
from vanna.legacy.openai import OpenAI_Chat
from vanna.legacy.pgvector import PG_VectorStore

from .openrouter_llm import build_openrouter_client, get_model


class NucaseVanna(OpenAI_Chat, PG_VectorStore):
    def __init__(self, config: dict | None = None):
        PG_VectorStore.__init__(self, config=config)
        OpenAI_Chat.__init__(self, client=build_openrouter_client(), config=config)


def build_vanna_client() -> VannaBase:
    """Constructs NucaseVanna from env vars. Raises if VANNA_DATABASE_URL is unset — there is
    no default to fall back to, since silently pointing at nothing would be worse than failing
    loudly here."""
    connection_string = os.environ.get("VANNA_DATABASE_URL")
    if not connection_string:
        raise RuntimeError(
            "VANNA_DATABASE_URL is not set — see vanna-service/.env.example."
        )

    # OpenRouter's OpenAI-compatible /embeddings endpoint (confirmed working via a real curl
    # call — see SKILL.md Phase 7 entry) instead of vanna's default local HuggingFace/torch
    # embedding model, reusing the same OPENROUTER_API_KEY (decision 2).
    from langchain_openai import OpenAIEmbeddings

    embedding_function = OpenAIEmbeddings(
        model="openai/text-embedding-3-small",
        openai_api_base="https://openrouter.ai/api/v1",
        openai_api_key=os.environ["OPENROUTER_API_KEY"],
    )

    return NucaseVanna(
        config={
            "connection_string": connection_string,
            "embedding_function": embedding_function,
            "model": get_model(),
        }
    )


_client: VannaBase | None = None


def get_vanna_client() -> VannaBase:
    """Lazily builds and caches a single NucaseVanna instance for the life of the process —
    mirrors the Node side's per-process pooling pattern (e.g. connectionResolver.ts). Deliberately
    lazy, not built at import time: importing this module (or app.main, which imports it
    transitively) must not require VANNA_DATABASE_URL/OPENROUTER_API_KEY to be set — only
    actually calling this does, so app.main's module import stays test-safe without live infra."""
    global _client
    if _client is None:
        _client = build_vanna_client()
    return _client
