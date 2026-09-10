"""
Plan tiers and gating (see PROJECT.md section 4).

No real payment processing for the hackathon MVP -- gating is just a
field check against these limits. "Upgrade" in the UI is a disabled/
"contact us" action, not a real charge.
"""

from __future__ import annotations

from pydantic import BaseModel


class PlanLimits(BaseModel):
    max_tables: int | None  # None = unlimited
    max_pulls: int
    export: bool
    full_history: bool


PLAN_LIMITS: dict[str, PlanLimits] = {
    "free": PlanLimits(max_tables=1, max_pulls=100_000, export=False, full_history=False),
    "studio": PlanLimits(max_tables=10, max_pulls=1_000_000, export=True, full_history=True),
    # "1M+" in the pricing copy -- kept meaningfully above Studio's cap so the
    # tier actually differs server-side, not just in marketing text.
    "enterprise": PlanLimits(max_tables=None, max_pulls=5_000_000, export=True, full_history=True),
}


def limits_for(plan: str) -> PlanLimits:
    return PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])
