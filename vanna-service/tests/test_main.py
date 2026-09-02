from fastapi.testclient import TestClient

from app.main import GenerateSqlRequest, app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_generate_sql_returns_stub():
    response = client.post("/generate-sql", json={"question": "How many clients does Aurora have?"})
    assert response.status_code == 200
    body = response.json()
    assert body["stub"] is True
    assert "sql" in body
    assert "note" in body


def test_generate_sql_request_has_no_company_field():
    # Decision 4: Vanna must never receive company_id. Confirm the request schema genuinely
    # has no such field, not just that this test forgot to pass one.
    assert set(GenerateSqlRequest.model_fields.keys()) == {"question"}
