# Vanna Service

Python (FastAPI) service that will eventually generate SQL Server queries
from natural-language questions via [Vanna](https://vanna.ai/), as part of
the Railway + Vanna migration — see
`.claude/skills/railway-vanna-migration/SKILL.md`, especially the Phase 5
and Phase 7 entries, before changing anything here.

**Phase 5 status: scaffolding only.** `/generate-sql` returns a hardcoded
stub response — no real Vanna instance is constructed yet, and this service
doesn't import the `vanna` package at all. Real generation starts with
Phase 7's training sub-step.

## Structure

```
app/
  main.py            FastAPI app, /health and /generate-sql routes
  openrouter_llm.py   OpenRouter LLM connector (built + tested on its own,
                       not wired into any route yet)
tests/                pytest suite
```

## 1. Prerequisites

- Python 3.11+

## 2. Set up a virtual environment and install dependencies

```
cd vanna-service
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
```

## 3. Configure environment

```
cp .env.example .env   # fill in OPENROUTER_API_KEY (same key server/.env.example uses)
```

## 4. Run the service

```
uvicorn app.main:app --reload --port 8001
```

`GET /health` → `{"status": "ok"}`. `POST /generate-sql` with
`{"question": "..."}` → a stubbed response (see `app/main.py`'s module
docstring for why).

## 5. Run tests

```
pytest
```

One test (`test_check_connection_real_call`) makes a real OpenRouter API
call and is skipped automatically unless `OPENROUTER_API_KEY` is set in the
environment the tests run in.
