# Railway + Vanna migration, Phase 5 (see .claude/skills/railway-vanna-migration/SKILL.md) —
# scaffolding only. /generate-sql returns a hardcoded stub response for now, not real Vanna
# output: training needs pgvector storage, which doesn't exist until Phase 7 (see that entry's
# "training sub-step"). No `vanna` package import happens anywhere in this service yet — see
# app/openrouter_llm.py's module docstring for why, and for a real discovery worth knowing
# before Phase 7 starts: the installed `vanna` package is now a 2.x release with a restructured
# API surface (`vanna.legacy` preserves the 0.x-style `generate_sql()`/`ask()`/`VannaFlaskApp`
# this skill's guardrails are written against; a separate `vanna.core`/`vanna.agents`
# architecture also exists and is unexplored) — Phase 7 needs to explicitly choose between them
# before writing any real generation code, not assume `vanna.legacy` is still the only option.
#
# Permanent implementation note (not just confirmed once and forgotten — see SKILL.md's Phase 5
# entry for the full version): whichever surface Phase 7 picks, this endpoint must end up
# calling a SQL-*generation*-only method (`generate_sql()` in the legacy API) — never `ask()`,
# and this service must never mount Vanna's own built-in web app (`VannaFlaskApp` in the legacy
# API, or any Phase-7-chosen equivalent in the new one). Both execute SQL against a live
# database by default — they're built for Vanna's own end-user chat UI, not a generation-only
# backend API — so using either naively would silently violate the "Vanna never executes"
# guardrail. Whatever Vanna object Phase 7 constructs must never be given a live database
# connection (no on-prem/Azure SQL credentials, no Postgres credentials) — it has no legitimate
# reason to hold one if only a generate-only method is ever called on it.
#
# This endpoint never receives or forwards a company/tenant identifier (decision 4) —
# GenerateSqlRequest below has no such field, by design, not oversight. Connection routing
# happens entirely in the Node backend (server/src/tenant/connectionResolver.ts); Vanna only
# ever sees a natural-language question and (once trained) shared schema context.
from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Nucase Vanna Service")


class GenerateSqlRequest(BaseModel):
    question: str


class GenerateSqlResponse(BaseModel):
    sql: str
    stub: bool
    note: str


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/generate-sql", response_model=GenerateSqlResponse)
async def generate_sql(request: GenerateSqlRequest) -> GenerateSqlResponse:
    # Deliberately ignores request.question for now — see module docstring above. Once Phase
    # 7's training sub-step lands, this becomes a real call to a Vanna generate-only method.
    del request
    return GenerateSqlResponse(
        sql="SELECT 1 AS stub",
        stub=True,
        note="Training is not yet configured (Phase 7) — this is a placeholder response, not real Vanna output.",
    )
