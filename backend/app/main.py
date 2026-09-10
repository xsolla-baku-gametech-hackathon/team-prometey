"""
Loot Table Balance Auditor API (see PROJECT.md section 4).

Endpoints:
    POST /audit    validate + simulate + compliance-check a loot table
    GET  /samples  list bundled sample tables, for the frontend's
                   buggy/fixed dropdown
    GET  /health   liveness check

Stateless: every request carries the full loot table and gets a full
result back. No database -- nothing to persist for the MVP.
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.compliance import DEFAULT_TOLERANCE, ComplianceReport, compute_compliance
from app.schema import LootTable
from app.simulate import DEFAULT_NUM_PULLS, SimulationResult, simulate
from app.validator import Issue, has_blocking_errors, validate_table

SAMPLES_DIR = Path(__file__).parent.parent / "samples"

app = FastAPI(title="Loot Table Balance Auditor")

# Wide-open CORS: this is a stateless hackathon API with no auth/session
# cookies to protect, and the frontend runs on a different port/origin
# during local dev (and possibly a different domain entirely once deployed).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AuditRequest(BaseModel):
    table: LootTable
    num_pulls: int = DEFAULT_NUM_PULLS
    tolerance: float = DEFAULT_TOLERANCE
    seed: int | None = None


class AuditResponse(BaseModel):
    validation_issues: list[Issue]
    blocked: bool
    simulation: SimulationResult | None = None
    compliance: ComplianceReport | None = None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/audit", response_model=AuditResponse)
def audit(req: AuditRequest) -> AuditResponse:
    issues = validate_table(req.table)

    if has_blocking_errors(issues):
        # Never silently proceed on broken data -- report exactly why we
        # stopped instead of running a simulation on nonsense.
        return AuditResponse(validation_issues=issues, blocked=True)

    try:
        sim = simulate(req.table, num_pulls=req.num_pulls, seed=req.seed)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    report = compute_compliance(req.table, sim, tolerance=req.tolerance)
    return AuditResponse(validation_issues=issues, blocked=False, simulation=sim, compliance=report)


@app.get("/samples")
def list_samples() -> dict[str, dict]:
    samples = {}
    for path in sorted(SAMPLES_DIR.glob("*.json")):
        with open(path) as f:
            samples[path.stem] = json.load(f)
    return samples
