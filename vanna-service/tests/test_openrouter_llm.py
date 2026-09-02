import os

import pytest

from app.openrouter_llm import (
    DEFAULT_MODEL,
    OPENROUTER_BASE_URL,
    build_openrouter_client,
    check_connection,
    get_model,
)


def test_get_model_defaults(monkeypatch):
    monkeypatch.delenv("OPENROUTER_MODEL", raising=False)
    assert get_model() == DEFAULT_MODEL


def test_get_model_reads_env(monkeypatch):
    monkeypatch.setenv("OPENROUTER_MODEL", "some/other-model")
    assert get_model() == "some/other-model"


def test_build_client_requires_api_key(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with pytest.raises(RuntimeError):
        build_openrouter_client()


def test_build_client_configures_base_url(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    client = build_openrouter_client()
    assert str(client.base_url) == f"{OPENROUTER_BASE_URL}/"


@pytest.mark.skipif(
    not os.environ.get("OPENROUTER_API_KEY"),
    reason="Requires a real OPENROUTER_API_KEY to make an actual OpenRouter call",
)
def test_check_connection_real_call():
    reply = check_connection()
    assert "OK" in reply.upper()
