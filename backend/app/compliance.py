"""
Compliance diff: advertised vs. simulated rates (see PROJECT.md section 2.4).

Flags each item green/yellow/red by how far its simulated (natural,
non-pity-forced -- see simulate.py's module docstring) rate has drifted
from the advertised rate, plus a separate check on whether pity actually
delivers its promised guarantee at all.

A fixed percentage-point tolerance alone isn't enough: Monte Carlo
sampling noise for a mid-frequency item (say a 25% drop rate) at 300k
pulls has a standard error of ~0.14 percentage points on its own, which
would make a *correctly configured* table randomly flag yellow/red purely
from sampling variance -- a false positive that would undermine trust in
every real flag. So the effective tolerance is whichever is larger: the
configured percentage-point tolerance, or 3 standard errors of the
advertised rate at this sample size (i.e. "only flag a deviation big
enough that it's actually distinguishable from noise, not just smaller
than our regulatory tolerance floor").
"""

from __future__ import annotations

import math

from pydantic import BaseModel

from app.schema import LootTable
from app.simulate import SimulationResult

DEFAULT_TOLERANCE = 0.001  # +/- 0.1 percentage points, per PROJECT.md's example
NOISE_SIGMA = 3  # how many standard errors of sampling noise to tolerate before trusting a deviation is real


class ItemFlag(BaseModel):
    item_id: str
    advertised_rate: float
    simulated_rate: float
    delta: float
    effective_tolerance: float
    status: str  # "green" | "yellow" | "red"


class PityFlag(BaseModel):
    status: str  # "green" | "red"
    message: str


class ComplianceReport(BaseModel):
    tolerance: float
    item_flags: list[ItemFlag]
    pity_flag: PityFlag | None
    overall_status: str  # worst of item_flags + pity_flag


def _sampling_standard_error(rate: float, num_pulls: int) -> float:
    if num_pulls <= 0:
        return 0.0
    return math.sqrt(max(rate, 1e-9) * (1 - rate) / num_pulls)


def _status_for_delta(abs_delta: float, effective_tolerance: float) -> str:
    if abs_delta <= effective_tolerance:
        return "green"
    if abs_delta <= effective_tolerance * 2:
        return "yellow"
    return "red"


def _worst(statuses: list[str]) -> str:
    if "red" in statuses:
        return "red"
    if "yellow" in statuses:
        return "yellow"
    return "green"


def compute_compliance(table: LootTable, sim: SimulationResult, tolerance: float = DEFAULT_TOLERANCE) -> ComplianceReport:
    item_flags: list[ItemFlag] = []
    for item_id, advertised in table.advertised_rates.items():
        simulated = sim.item_rates.get(item_id)
        if simulated is None:
            continue  # no matching item -- already surfaced by the validator as orphan_advertised_rate
        delta = simulated - advertised
        effective_tolerance = max(tolerance, NOISE_SIGMA * _sampling_standard_error(advertised, sim.num_pulls))
        item_flags.append(
            ItemFlag(
                item_id=item_id,
                advertised_rate=advertised,
                simulated_rate=simulated,
                delta=delta,
                effective_tolerance=effective_tolerance,
                status=_status_for_delta(abs(delta), effective_tolerance),
            )
        )

    pity_flag = _pity_flag(table, sim)

    statuses = [f.status for f in item_flags]
    if pity_flag is not None:
        statuses.append(pity_flag.status)

    return ComplianceReport(
        tolerance=tolerance,
        item_flags=item_flags,
        pity_flag=pity_flag,
        overall_status=_worst(statuses) if statuses else "green",
    )


def _pity_flag(table: LootTable, sim: SimulationResult) -> PityFlag | None:
    if table.pity is None or sim.pity is None:
        return None

    if sim.pity.max_pulls_observed_to_target is None:
        return PityFlag(
            status="red",
            message=(
                f"pity promises '{table.pity.target_rarity}' within {table.pity.guaranteed_within_pulls} pulls, "
                "but it was never obtained -- naturally or via pity -- across the whole simulation."
            ),
        )

    if sim.pity.max_pulls_observed_to_target > table.pity.guaranteed_within_pulls:
        return PityFlag(
            status="red",
            message=(
                f"Observed a gap of {sim.pity.max_pulls_observed_to_target} pulls before "
                f"'{table.pity.target_rarity}', exceeding the {table.pity.guaranteed_within_pulls}-pull guarantee."
            ),
        )

    return PityFlag(
        status="green",
        message=(
            f"pity delivered '{table.pity.target_rarity}' within its "
            f"{table.pity.guaranteed_within_pulls}-pull guarantee every time ({sim.pity.forced_hits} pity saves)."
        ),
    )
