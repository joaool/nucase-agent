import os

import pytest
from dotenv import load_dotenv
from fastapi.testclient import TestClient

# Loads OPENROUTER_API_KEY/OPENROUTER_MODEL from vanna-service/.env (gitignored, holds no
# per-tenant or vanna_app secrets) so the real end-to-end test below doesn't need the API key
# typed on the command line. VANNA_DATABASE_URL is intentionally NOT expected to come from
# here for that test — pass it inline as an env var when running against a real target (e.g.
# the Railway tunnel with a freshly-generated vanna_app password), never persisted to a file.
load_dotenv()

from app.main import GenerateSqlRequest, app  # noqa: E402

client = TestClient(app)

# Real generation needs a live VANNA_DATABASE_URL (Railway's Postgres, trained — see
# train.py) and a real OPENROUTER_API_KEY. Gated the same way server/'s
# executionGuard.test.ts gates its live-Azure integration tests: skip by default, run for
# real when the env is actually configured, never fake it with a mock.
canRunIntegration = bool(os.environ.get("VANNA_DATABASE_URL"))


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_generate_sql_request_has_no_company_field():
    # Decision 4: Vanna must never receive company_id. Confirm the request schema genuinely
    # has no such field, not just that this test forgot to pass one.
    assert set(GenerateSqlRequest.model_fields.keys()) == {"question"}


@pytest.mark.skipif(
    not canRunIntegration,
    reason="VANNA_DATABASE_URL not set — set it (Railway Postgres, trained) to run this against real Vanna output",
)
def test_generate_sql_real_end_to_end():
    # The Phase 7 acceptance test's generation half (server/src/agent/vannaClient.ts +
    # executionGuard.ts cover the rest — see SKILL.md).
    response = client.post(
        "/generate-sql",
        json={"question": "What is the credit limit for client CL0001?"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["stub"] is False
    sql = body["sql"].upper()
    assert "SELECT" in sql
    assert "CLIENTES" in sql
    # Never company_id or any tenant identifier — Vanna was never trained on one and was
    # never given one in the request, so it has no way to produce this, but assert it anyway.
    assert "COMPANY_ID" not in sql
