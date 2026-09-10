"""
Monte Carlo pull simulator (see PROJECT.md section 2.3).

Draws `num_pulls` items from the table's weighted distribution, then --
if the table declares a pity rule -- walks the draws once to apply a
"hard pity" override: whenever a player would go `guaranteed_within_pulls`
pulls without the target rarity, the next pull is forced to be one of
the target-rarity items instead of whatever the natural draw gave.

The bulk weighted draw is vectorized with numpy (fast for 500k-1M pulls).
Pity application is inherently sequential (each pull's outcome depends on
whether the previous ones already delivered the target), so that part is
a plain Python loop -- but each iteration is a handful of cheap operations,
so it stays well under a second even at 1M pulls.

Natural vs. total rates: a *correctly configured* pity system necessarily
pushes a player's realized rate above the raw per-pull weight -- e.g. at a
true 1% base rate, ~40% of streams still haven't hit by pull 90 and get
pity-saved there, which alone inflates the realized rate well past 1%.
That's pity working as intended, not a compliance problem. So `item_rates`
/`rarity_rates` (compared against `advertised_rates` by the compliance
module) are natural-draws-only; pity-inclusive totals are reported
separately under `realized_item_rates` for "what a player actually
experiences," and pity's own promise is checked via
`max_pulls_observed_to_target` instead of blending it into the rate diff.
"""

from __future__ import annotations

import numpy as np
from pydantic import BaseModel

from app.schema import LootTable

DEFAULT_NUM_PULLS = 300_000
HISTOGRAM_BUCKETS = 10


class PityStats(BaseModel):
    target_rarity: str
    guaranteed_within_pulls: int
    natural_hits: int
    forced_hits: int
    max_pulls_observed_to_target: int | None
    # Histogram of "how many pulls it took to get the target rarity" each
    # time it was obtained, bucketed for charting (pity convergence chart).
    convergence_histogram: list[dict]


class SimulationResult(BaseModel):
    num_pulls: int
    # Natural draws only -- excludes pity-forced hits. Compare these
    # against advertised_rates for compliance.
    item_counts: dict[str, int]
    item_rates: dict[str, float]
    rarity_counts: dict[str, int]
    rarity_rates: dict[str, float]
    # What a player actually walks away with, pity included.
    realized_item_counts: dict[str, int]
    realized_item_rates: dict[str, float]
    pity: PityStats | None = None


def simulate(table: LootTable, num_pulls: int = DEFAULT_NUM_PULLS, seed: int | None = None) -> SimulationResult:
    if num_pulls <= 0:
        raise ValueError("num_pulls must be positive")

    rng = np.random.default_rng(seed)
    items = table.items
    n_items = len(items)
    weights = np.array([item.weight for item in items], dtype=np.float64)
    total_weight = weights.sum()
    if total_weight <= 0:
        raise ValueError("All item weights are zero or negative -- nothing can ever drop.")

    probs = weights / total_weight
    draws = rng.choice(n_items, size=num_pulls, p=probs)
    realized_counts = np.bincount(draws, minlength=n_items)

    pity_stats = None
    forced_mask = np.zeros(num_pulls, dtype=bool)
    if table.pity is not None:
        forced_mask, pity_stats = _apply_pity(draws, items, table.pity, weights, rng)

    natural_draws = draws[~forced_mask]
    natural_counts = np.bincount(natural_draws, minlength=n_items)
    natural_total = len(natural_draws)

    item_counts = {items[i].id: int(natural_counts[i]) for i in range(n_items)}
    item_rates = {item_id: (count / natural_total if natural_total else 0.0) for item_id, count in item_counts.items()}
    realized_item_counts = {items[i].id: int(realized_counts[i]) for i in range(n_items)}
    realized_item_rates = {item_id: count / num_pulls for item_id, count in realized_item_counts.items()}

    rarity_counts: dict[str, int] = {}
    for i, item in enumerate(items):
        rarity_counts[item.rarity] = rarity_counts.get(item.rarity, 0) + int(natural_counts[i])
    rarity_rates = {rarity: (count / natural_total if natural_total else 0.0) for rarity, count in rarity_counts.items()}

    return SimulationResult(
        num_pulls=num_pulls,
        item_counts=item_counts,
        item_rates=item_rates,
        rarity_counts=rarity_counts,
        rarity_rates=rarity_rates,
        realized_item_counts=realized_item_counts,
        realized_item_rates=realized_item_rates,
        pity=pity_stats,
    )


def _apply_pity(draws: np.ndarray, items, pity, weights: np.ndarray, rng: np.random.Generator):
    """Mutates `draws` in place to apply forced pity hits; returns (forced_mask, PityStats)."""
    target_indices = [i for i, item in enumerate(items) if item.rarity == pity.target_rarity]
    target_weights = weights[target_indices] if target_indices else np.array([])
    can_force = len(target_indices) > 0 and target_weights.sum() > 0
    if can_force:
        target_probs = target_weights / target_weights.sum()

    is_target = np.isin(draws, target_indices) if target_indices else np.zeros(len(draws), dtype=bool)
    forced_mask = np.zeros(len(draws), dtype=bool)

    guarantee = pity.guaranteed_within_pulls
    counter = 0
    natural_hits = 0
    forced_hits = 0
    gaps: list[int] = []  # pulls-to-target each time the target was obtained

    for i in range(len(draws)):
        hit = bool(is_target[i])

        if not hit and can_force and counter + 1 >= guarantee:
            draws[i] = int(rng.choice(target_indices, p=target_probs))
            forced_mask[i] = True
            hit = True
            forced_hits += 1
        elif hit:
            natural_hits += 1

        if hit:
            gaps.append(counter + 1)
            if pity.reset_on_trigger:
                counter = 0
            # else: counter keeps running even through a natural hit --
            # matches a (buggy) config where only forced pity resets it.
        else:
            counter += 1

    stats = PityStats(
        target_rarity=pity.target_rarity,
        guaranteed_within_pulls=guarantee,
        natural_hits=natural_hits,
        forced_hits=forced_hits,
        max_pulls_observed_to_target=max(gaps) if gaps else None,
        convergence_histogram=_histogram(gaps, guarantee),
    )
    return forced_mask, stats


def _histogram(gaps: list[int], guarantee: int) -> list[dict]:
    if not gaps:
        return []
    upper = max(guarantee, max(gaps))
    edges = np.linspace(0, upper, HISTOGRAM_BUCKETS + 1)
    counts, _ = np.histogram(gaps, bins=edges)
    return [
        {"range_start": round(float(edges[i]), 1), "range_end": round(float(edges[i + 1]), 1), "count": int(counts[i])}
        for i in range(len(counts))
    ]
