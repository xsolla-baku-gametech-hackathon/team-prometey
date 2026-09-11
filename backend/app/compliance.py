"""
Compliance diff: advertised vs. simulated rates (see PROJECT.md section 2.4).

Flags each item green/yellow/red using a proper one-sample proportion
z-test against the advertised rate (treated as the null hypothesis),
not a bare percentage-point cutoff. A fixed pp tolerance alone isn't
enough: Monte Carlo sampling noise for a mid-frequency item (say a 25%
drop rate) at 300k pulls has a standard error of ~0.14 percentage
points on its own, which would make a *correctly configured* table
randomly flag yellow/red purely from sampling variance.

Two refinements on top of the raw z-test, because a naive per-item
p < 0.05 check has real statistical problems at this table's scale:

  1. Bonferroni correction. Testing N items each at alpha=0.05
     inflates the whole table's false-positive rate to roughly
     1-(1-0.05)^N, not 5% -- e.g. ~18.5% for four items. So the
     per-item significance threshold used is `region.alpha / N`,
     controlling the table-wide false-positive rate at ~region.alpha
     instead.

  2. A practical-tolerance floor (`region.min_pp_floor`). At large
     enough sample sizes (1M+ pulls), *any* nonzero deviation becomes
     statistically significant without being a real business problem.
     A deviation at or below the floor is never flagged red regardless
     of its p-value.

`region` (see app.regions) supplies both knobs per jurisdiction, plus a
pity grace-period. Each item's 95% Wilson score confidence interval is
also reported for display -- a tighter, more defensible uncertainty
band than a symmetric normal approximation, especially for low-
probability items like a 1% legendary rate.

For any item that isn't green, a suggested corrected weight is also
computed: the exact weight that would make this item's advertised
rate achievable given every other item's current weight, solving
`advertised_rate = w' / (other_weight + w')` for `w'`.
"""

from __future__ import annotations

import math

from pydantic import BaseModel

from app.regions import RegionRule, region_for
from app.schema import LootTable
from app.simulate import SimulationResult

DEFAULT_TOLERANCE = 0.001  # +/- 0.1 percentage points -- fallback when no region-specific floor applies
CI_Z = 1.96  # z-critical for a 95% Wilson score interval, used for display regardless of the region's test alpha


class ItemFlag(BaseModel):
    item_id: str
    advertised_rate: float
    simulated_rate: float
    delta: float
    effective_tolerance: float  # the practical-tolerance floor actually applied (region.min_pp_floor, or an override)
    status: str  # "green" | "yellow" | "red"
    # One-sample proportion z-test of simulated_rate against advertised_rate
    # as the null hypothesis (see module docstring for the Bonferroni note).
    # Defaulted (rather than required) so audit runs persisted before this
    # field existed still deserialize -- there's no migrations tool here,
    # so old rows just read back with neutral placeholder stats.
    z_score: float = 0.0
    p_value: float = 1.0
    # 95% Wilson score confidence interval on the simulated rate.
    ci_low: float = 0.0
    ci_high: float = 1.0
    # Exact weight that would hit advertised_rate given every other item's
    # current weight -- only set when status != "green".
    suggested_weight: float | None = None


class PityFlag(BaseModel):
    status: str  # "green" | "red"
    message: str


class ComplianceReport(BaseModel):
    tolerance: float
    region_id: str = "global"  # same backward-compat reasoning as ItemFlag's new fields above
    alpha: float = 0.0  # Bonferroni-adjusted per-item significance threshold actually used
    item_flags: list[ItemFlag]
    pity_flag: PityFlag | None
    overall_status: str  # worst of item_flags + pity_flag


def _normal_cdf(z: float) -> float:
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def _z_test(p_hat: float, p0: float, n: int) -> tuple[float, float]:
    """One-sample proportion z-test: is p_hat significantly different from the null p0?

    Returns (z, two_tailed_p_value). p0 at the boundary (0 or 1) makes the
    null standard error zero -- handled as a direct pass/fail instead of a
    division by zero, since "advertised as impossible/certain" is either
    matched exactly or it isn't; no test statistic needed.
    """
    if n <= 0:
        return 0.0, 1.0
    if p0 <= 0.0 or p0 >= 1.0:
        return (math.inf, 0.0) if p_hat != p0 else (0.0, 1.0)
    se0 = math.sqrt(p0 * (1 - p0) / n)
    if se0 == 0:
        return 0.0, 1.0
    z = (p_hat - p0) / se0
    p_value = 2 * (1 - _normal_cdf(abs(z)))
    return z, p_value


def _wilson_interval(p_hat: float, n: int, z: float = CI_Z) -> tuple[float, float]:
    if n <= 0:
        return p_hat, p_hat
    denom = 1 + z * z / n
    center = (p_hat + z * z / (2 * n)) / denom
    margin = (z * math.sqrt(p_hat * (1 - p_hat) / n + z * z / (4 * n * n))) / denom
    return max(0.0, center - margin), min(1.0, center + margin)


def _suggested_weight(table: LootTable, item_id: str, advertised_rate: float) -> float | None:
    if not (0.0 < advertised_rate < 1.0):
        return None
    item = next((it for it in table.items if it.id == item_id), None)
    if item is None:
        return None
    other_weight = sum(it.weight for it in table.items) - item.weight
    if other_weight <= 0:
        return None
    return round(advertised_rate * other_weight / (1 - advertised_rate), 4)


def _status_for(delta_abs: float, p_value: float, alpha: float, min_pp_floor: float) -> str:
    if delta_abs <= min_pp_floor:
        return "green"
    if p_value < alpha:
        return "red"
    if p_value < min(alpha * 5, 0.10):
        return "yellow"
    return "green"


def _worst(statuses: list[str]) -> str:
    if "red" in statuses:
        return "red"
    if "yellow" in statuses:
        return "yellow"
    return "green"


def compute_compliance(
    table: LootTable,
    sim: SimulationResult,
    region: RegionRule | str | None = None,
    tolerance: float | None = None,
) -> ComplianceReport:
    rule = region if isinstance(region, RegionRule) else region_for(region)
    min_pp_floor = tolerance if tolerance is not None else rule.min_pp_floor

    n_tests = max(1, len(table.advertised_rates))
    alpha = rule.alpha / n_tests  # Bonferroni correction across all items tested on this table

    item_flags: list[ItemFlag] = []
    for item_id, advertised in table.advertised_rates.items():
        simulated = sim.item_rates.get(item_id)
        if simulated is None:
            continue  # no matching item -- already surfaced by the validator as orphan_advertised_rate
        delta = simulated - advertised
        z, p_value = _z_test(simulated, advertised, sim.num_pulls)
        ci_low, ci_high = _wilson_interval(simulated, sim.num_pulls)
        status = _status_for(abs(delta), p_value, alpha, min_pp_floor)
        item_flags.append(
            ItemFlag(
                item_id=item_id,
                advertised_rate=advertised,
                simulated_rate=simulated,
                delta=delta,
                effective_tolerance=min_pp_floor,
                status=status,
                z_score=z,
                p_value=p_value,
                ci_low=ci_low,
                ci_high=ci_high,
                suggested_weight=_suggested_weight(table, item_id, advertised) if status != "green" else None,
            )
        )

    pity_flag = _pity_flag(table, sim, rule)

    statuses = [f.status for f in item_flags]
    if pity_flag is not None:
        statuses.append(pity_flag.status)

    return ComplianceReport(
        tolerance=min_pp_floor,
        region_id=rule.id,
        alpha=alpha,
        item_flags=item_flags,
        pity_flag=pity_flag,
        overall_status=_worst(statuses) if statuses else "green",
    )


def _pity_flag(table: LootTable, sim: SimulationResult, rule: RegionRule) -> PityFlag | None:
    if table.pity is None or sim.pity is None:
        return None

    allowed = table.pity.guaranteed_within_pulls + rule.pity_grace_pulls

    if sim.pity.max_pulls_observed_to_target is None:
        return PityFlag(
            status="red",
            message=(
                f"pity promises '{table.pity.target_rarity}' within {table.pity.guaranteed_within_pulls} pulls, "
                "but it was never obtained -- naturally or via pity -- across the whole simulation."
            ),
        )

    if sim.pity.max_pulls_observed_to_target > allowed:
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
