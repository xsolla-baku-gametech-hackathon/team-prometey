"""
TrueLoot API -- multi-user SaaS shape (PROJECT.md section 8).

    POST /auth/signup                     create an account
    POST /auth/login                      get a JWT
    GET  /user/me                         current user info
    PUT  /user/password                   change the current user's password

    GET    /tables                        list the current user's saved tables
    POST   /tables                        save a new loot table (plan-gated count)
    GET    /tables/{id}                   table detail (config)
    PUT    /tables/{id}                   overwrite a saved table's name/config
    DELETE /tables/{id}                   remove a saved table

    POST /tables/{id}/audit               validate + simulate + compliance-check,
                                           persist the run (plan-gated pull count)
    GET  /tables/{id}/history             past runs for a table (free tier: latest only)

    GET   /admin/users                    list every user + their table count (admin only)
    PATCH /admin/users/{id}/plan          change a user's plan (admin only)

    GET /samples                          bundled demo tables, for "start from a template"
    GET /plans                            plan tiers + limits, for the pricing page
    GET /regions                          compliance rule packs, for the audit region selector
    GET /health                           liveness check

Every /tables, /admin, and /auth-adjacent route (other than signup/login)
requires a bearer JWT; /admin/* additionally requires the user's is_admin
flag (see app.auth.sync_admin_flag -- admin access is an env-configured
email allowlist, not a self-serve role). Core audit logic (schema/
validator/simulate/compliance) is untouched from the original single-page
build -- this layer only adds persistence, ownership, and plan limits
around it.
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.auth import (
    create_access_token,
    get_current_admin_user,
    get_current_user,
    hash_password,
    sync_admin_flag,
    verify_password,
)
from app.compliance import ComplianceReport, compute_compliance
from app.db import get_session, init_db
from app.db_models import AuditRun, LootTableRecord, User
from app.plans import PLAN_LIMITS, limits_for
from app.regions import DEFAULT_REGION, REGIONS, region_for
from app.schema import LootTable
from app.simulate import SimulationResult, simulate
from app.validator import Issue, has_blocking_errors, validate_table

SAMPLES_DIR = Path(__file__).parent.parent / "samples"

app = FastAPI(title="TrueLoot")

# Wide-open CORS: stateless-per-request API auth (bearer JWT, no cookies),
# and the frontend runs on a different port/origin in dev and possibly a
# different domain entirely once deployed.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/plans")
def get_plans() -> dict[str, dict]:
    return {name: limits.model_dump() for name, limits in PLAN_LIMITS.items()}


@app.get("/regions")
def get_regions() -> dict[str, dict]:
    return {region_id: rule.model_dump() for region_id, rule in REGIONS.items()}


@app.get("/samples")
def list_samples() -> dict[str, dict]:
    samples = {}
    for path in sorted(SAMPLES_DIR.glob("*.json")):
        with open(path) as f:
            samples[path.stem] = json.load(f)
    return samples


# ── Auth ─────────────────────────────────────────────────────────────────


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    plan: str
    is_admin: bool


class AuthResponse(BaseModel):
    access_token: str
    user: UserOut


def _user_out(user: User) -> UserOut:
    return UserOut(id=user.id, email=user.email, plan=user.plan, is_admin=user.is_admin)


@app.post("/auth/signup", response_model=AuthResponse)
def signup(req: SignupRequest, db: Session = Depends(get_session)) -> AuthResponse:
    if db.query(User).filter(User.email == req.email).first() is not None:
        raise HTTPException(400, "An account with this email already exists.")

    user = User(email=req.email, password_hash=hash_password(req.password), plan="free")
    db.add(user)
    db.commit()
    db.refresh(user)
    user = sync_admin_flag(user, db)
    return AuthResponse(access_token=create_access_token(user), user=_user_out(user))


@app.post("/auth/login", response_model=AuthResponse)
def login(req: LoginRequest, db: Session = Depends(get_session)) -> AuthResponse:
    user = db.query(User).filter(User.email == req.email).first()
    if user is None or not verify_password(req.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password.")
    user = sync_admin_flag(user, db)
    return AuthResponse(access_token=create_access_token(user), user=_user_out(user))


@app.get("/user/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)) -> UserOut:
    return _user_out(current_user)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=72)


@app.put("/user/password")
def change_password(
    req: ChangePasswordRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_session)
) -> dict:
    if not verify_password(req.current_password, current_user.password_hash):
        raise HTTPException(401, "Current password is incorrect.")
    current_user.password_hash = hash_password(req.new_password)
    db.commit()
    return {"changed": True}


# ── Loot tables (protected CRUD) ───────────────────────────────────────────


class TableCreateRequest(BaseModel):
    name: str
    table: LootTable


class TableSummary(BaseModel):
    id: str
    name: str
    table_id: str
    created_at: str
    updated_at: str
    last_status: str | None  # latest audit's overall_status, or "blocked" / None -- dashboard status dot


class TableDetail(BaseModel):
    id: str
    name: str
    table: LootTable
    created_at: str
    updated_at: str


def _get_owned_table(table_record_id: str, current_user: User, db: Session) -> LootTableRecord:
    record = db.get(LootTableRecord, table_record_id)
    if record is None or record.user_id != current_user.id:
        raise HTTPException(404, "Loot table not found.")
    return record


def _table_summary(record: LootTableRecord) -> TableSummary:
    last_run = max(record.audit_runs, key=lambda r: r.created_at, default=None)
    last_status = None
    if last_run is not None:
        last_status = "blocked" if last_run.blocked else last_run.overall_status
    config = json.loads(record.config_json)
    return TableSummary(
        id=record.id,
        name=record.name,
        table_id=config.get("table_id", record.name),
        created_at=record.created_at.isoformat(),
        updated_at=record.updated_at.isoformat(),
        last_status=last_status,
    )


def _table_detail(record: LootTableRecord) -> TableDetail:
    return TableDetail(
        id=record.id,
        name=record.name,
        table=LootTable.model_validate_json(record.config_json),
        created_at=record.created_at.isoformat(),
        updated_at=record.updated_at.isoformat(),
    )


@app.get("/tables", response_model=list[TableSummary])
def list_tables(current_user: User = Depends(get_current_user), db: Session = Depends(get_session)) -> list[TableSummary]:
    records = (
        db.query(LootTableRecord)
        .filter(LootTableRecord.user_id == current_user.id)
        .order_by(LootTableRecord.updated_at.desc())
        .all()
    )
    return [_table_summary(r) for r in records]


@app.post("/tables", response_model=TableDetail)
def create_table(
    req: TableCreateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_session)
) -> TableDetail:
    limits = limits_for(current_user.plan)
    if limits.max_tables is not None:
        count = db.query(LootTableRecord).filter(LootTableRecord.user_id == current_user.id).count()
        if count >= limits.max_tables:
            raise HTTPException(
                403,
                f"Your {current_user.plan} plan allows up to {limits.max_tables} saved loot table(s). "
                "Upgrade to save more.",
            )

    record = LootTableRecord(
        user_id=current_user.id,
        name=req.name,
        config_json=req.table.model_dump_json(),
        advertised_rates_json=json.dumps(req.table.advertised_rates),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _table_detail(record)


@app.get("/tables/{table_record_id}", response_model=TableDetail)
def get_table(
    table_record_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_session)
) -> TableDetail:
    return _table_detail(_get_owned_table(table_record_id, current_user, db))


@app.put("/tables/{table_record_id}", response_model=TableDetail)
def update_table(
    table_record_id: str,
    req: TableCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> TableDetail:
    record = _get_owned_table(table_record_id, current_user, db)
    record.name = req.name
    record.config_json = req.table.model_dump_json()
    record.advertised_rates_json = json.dumps(req.table.advertised_rates)
    db.commit()
    db.refresh(record)
    return _table_detail(record)


@app.delete("/tables/{table_record_id}")
def delete_table(
    table_record_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_session)
) -> dict:
    record = _get_owned_table(table_record_id, current_user, db)
    db.delete(record)
    db.commit()
    return {"deleted": True}


# ── Audit ────────────────────────────────────────────────────────────────


class AuditRequestBody(BaseModel):
    num_pulls: int | None = None
    # None means "use the chosen region's own practical-tolerance floor" --
    # only set this to override that floor manually.
    tolerance: float | None = None
    seed: int | None = None
    region: str | None = None  # region pack id (app.regions.REGIONS); defaults to "global"


class AuditRunOut(BaseModel):
    id: str
    validation_issues: list[Issue]
    blocked: bool
    simulation: SimulationResult | None = None
    compliance: ComplianceReport | None = None
    created_at: str
    region: str


def _run_and_persist(record: LootTableRecord, body: AuditRequestBody, current_user: User, db: Session) -> AuditRunOut:
    table = LootTable.model_validate_json(record.config_json)
    limits = limits_for(current_user.plan)
    requested = body.num_pulls or limits.max_pulls
    num_pulls = min(requested, limits.max_pulls)

    region_id = body.region or DEFAULT_REGION
    if region_id not in REGIONS:
        raise HTTPException(422, f"Unknown region '{region_id}'. Must be one of: {', '.join(REGIONS)}.")

    issues = validate_table(table)
    blocked = has_blocking_errors(issues)

    sim: SimulationResult | None = None
    report: ComplianceReport | None = None
    overall_status = "red" if blocked else "green"

    if not blocked:
        try:
            sim = simulate(table, num_pulls=num_pulls, seed=body.seed)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        report = compute_compliance(table, sim, region=region_for(region_id), tolerance=body.tolerance)
        overall_status = report.overall_status

    run = AuditRun(
        loot_table_id=record.id,
        simulated_rates_json=sim.model_dump_json() if sim else "null",
        validation_flags_json=json.dumps([i.model_dump() for i in issues]),
        compliance_flags_json=report.model_dump_json() if report else "null",
        pity_convergence_json=json.dumps(sim.pity.convergence_histogram) if sim and sim.pity else None,
        pull_count=num_pulls,
        overall_status=overall_status,
        blocked=blocked,
        region=region_id,
    )
    db.add(run)

    # Free tier keeps only the latest run per table (per the pricing table's
    # "Audit history per table: Last run only").
    if not limits.full_history:
        for old_run in list(record.audit_runs):
            db.delete(old_run)

    db.commit()
    db.refresh(run)

    return AuditRunOut(
        id=run.id,
        validation_issues=issues,
        blocked=blocked,
        simulation=sim,
        compliance=report,
        created_at=run.created_at.isoformat(),
        region=run.region,
    )


@app.post("/tables/{table_record_id}/audit", response_model=AuditRunOut)
def run_audit(
    table_record_id: str,
    body: AuditRequestBody = AuditRequestBody(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> AuditRunOut:
    record = _get_owned_table(table_record_id, current_user, db)
    return _run_and_persist(record, body, current_user, db)


@app.get("/tables/{table_record_id}/history", response_model=list[AuditRunOut])
def get_history(
    table_record_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_session)
) -> list[AuditRunOut]:
    record = _get_owned_table(table_record_id, current_user, db)
    runs = sorted(record.audit_runs, key=lambda r: r.created_at, reverse=True)
    return [
        AuditRunOut(
            id=run.id,
            validation_issues=[Issue(**i) for i in json.loads(run.validation_flags_json)],
            blocked=run.blocked,
            simulation=(
                SimulationResult.model_validate_json(run.simulated_rates_json)
                if run.simulated_rates_json != "null"
                else None
            ),
            compliance=(
                ComplianceReport.model_validate_json(run.compliance_flags_json)
                if run.compliance_flags_json != "null"
                else None
            ),
            created_at=run.created_at.isoformat(),
            region=run.region,
        )
        for run in runs
    ]


# ── Admin (ops dashboard) ───────────────────────────────────────────────
#
# Not a self-serve role -- access comes from the TRUELOOT_ADMIN_EMAILS
# allowlist (see app.auth.sync_admin_flag). This is the internal tool that
# makes the pricing page's "Upgrade" / "Contact Sales" buttons real: since
# there's no payment processor wired up (PROJECT.md section 4), a manual
# plan change here is how a sales-assisted upgrade actually takes effect.


class AdminUserOut(BaseModel):
    id: str
    email: str
    plan: str
    is_admin: bool
    created_at: str
    table_count: int


class AdminPlanUpdateRequest(BaseModel):
    plan: str


def _admin_user_out(user: User) -> AdminUserOut:
    return AdminUserOut(
        id=user.id,
        email=user.email,
        plan=user.plan,
        is_admin=user.is_admin,
        created_at=user.created_at.isoformat(),
        table_count=len(user.tables),
    )


@app.get("/admin/users", response_model=list[AdminUserOut])
def admin_list_users(
    admin: User = Depends(get_current_admin_user), db: Session = Depends(get_session)
) -> list[AdminUserOut]:
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [_admin_user_out(u) for u in users]


@app.patch("/admin/users/{user_id}/plan", response_model=AdminUserOut)
def admin_update_user_plan(
    user_id: str,
    req: AdminPlanUpdateRequest,
    admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_session),
) -> AdminUserOut:
    if req.plan not in PLAN_LIMITS:
        raise HTTPException(422, f"Unknown plan '{req.plan}'. Must be one of: {', '.join(PLAN_LIMITS)}.")

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "User not found.")

    user.plan = req.plan
    db.commit()
    db.refresh(user)
    return _admin_user_out(user)
