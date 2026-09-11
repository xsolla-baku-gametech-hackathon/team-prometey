"""
Seeds a demo account for the hackathon demo script (PROJECT.md section 11 /
build-spec section 25): a `demo@example.com` account, already on the Studio
plan (so both tables fit under the plan's saved-table limit), with two
loot tables pre-audited so the "FAIL -> FIX -> PASS" story is visible the
moment someone logs in -- no manual setup needed during the demo.

Run with:
    python -m app.seed_demo

Idempotent: running it again updates the existing demo user/tables in
place rather than duplicating them.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from app.auth import hash_password
from app.compliance import compute_compliance
from app.db import SessionLocal, init_db
from app.db_models import AuditRun, LootTableRecord, User
from app.plans import limits_for
from app.schema import LootTable
from app.simulate import simulate
from app.validator import has_blocking_errors, validate_table

SAMPLES_DIR = Path(__file__).parent.parent / "samples"

DEMO_EMAIL = "demo@example.com"
# Never hardcode a real secret -- require it from the environment, with a
# clearly-labeled insecure fallback for local hackathon demo use only.
DEMO_PASSWORD = os.environ.get("TRUELOOT_DEMO_PASSWORD", "demo-loot-2026")
DEMO_SEED = 42


def _load_sample(name: str) -> LootTable:
    with open(SAMPLES_DIR / f"{name}.json") as f:
        return LootTable.model_validate(json.load(f))


def _upsert_table(db, user: User, name: str, table: LootTable) -> LootTableRecord:
    record = db.query(LootTableRecord).filter(LootTableRecord.user_id == user.id, LootTableRecord.name == name).first()
    if record is None:
        record = LootTableRecord(user_id=user.id, name=name, config_json="", advertised_rates_json="")
        db.add(record)
    record.config_json = table.model_dump_json()
    record.advertised_rates_json = json.dumps(table.advertised_rates)
    db.commit()
    db.refresh(record)

    # Reset audit history so re-running the seed script always leaves a
    # single, fresh, deterministic run behind (matches free-tier's
    # "latest run only" semantics and keeps the demo predictable).
    for old_run in list(record.audit_runs):
        db.delete(old_run)
    db.commit()

    return record


def _run_and_save_audit(db, record: LootTableRecord, user: User, seed: int = DEMO_SEED) -> None:
    table = LootTable.model_validate_json(record.config_json)
    limits = limits_for(user.plan)

    issues = validate_table(table)
    blocked = has_blocking_errors(issues)

    sim = None
    report = None
    overall_status = "red" if blocked else "green"
    if not blocked:
        sim = simulate(table, num_pulls=limits.max_pulls, seed=seed)
        report = compute_compliance(table, sim, region="global")
        overall_status = report.overall_status

    run = AuditRun(
        loot_table_id=record.id,
        simulated_rates_json=sim.model_dump_json() if sim else "null",
        validation_flags_json=json.dumps([i.model_dump() for i in issues]),
        compliance_flags_json=report.model_dump_json() if report else "null",
        pity_convergence_json=json.dumps(sim.pity.convergence_histogram) if sim and sim.pity else None,
        pull_count=limits.max_pulls,
        overall_status=overall_status,
        blocked=blocked,
    )
    db.add(run)
    db.commit()


def seed() -> None:
    init_db()
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == DEMO_EMAIL).first()
        if user is None:
            user = User(email=DEMO_EMAIL, password_hash=hash_password(DEMO_PASSWORD), plan="studio")
            db.add(user)
        else:
            user.password_hash = hash_password(DEMO_PASSWORD)
            user.plan = "studio"
        db.commit()
        db.refresh(user)

        buggy = _upsert_table(db, user, "Starter Chest -- Buggy", _load_sample("starter_chest_buggy"))
        _run_and_save_audit(db, buggy, user)

        # Several runs (not just one) so the Drift Analysis panel on this
        # table's history page has real data the moment someone logs in,
        # instead of needing a live "click Run Audit three times" detour
        # during a demo. Different seeds give genuine Monte Carlo variation
        # run-to-run, same as a real user re-auditing the same table.
        fixed = _upsert_table(db, user, "Starter Chest -- Fixed", _load_sample("starter_chest_clean"))
        for seed in (40, 41, 42, 43):
            _run_and_save_audit(db, fixed, user, seed=seed)

        print(f"Seeded demo account: {DEMO_EMAIL} / (password from TRUELOOT_DEMO_PASSWORD, default set)")
        print("  - Starter Chest -- Buggy: audited, expect FAIL")
        print("  - Starter Chest -- Fixed: audited 4x, expect PASS with drift-analysis data")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
