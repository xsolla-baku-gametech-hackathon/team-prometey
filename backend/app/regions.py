"""
Multi-region compliance rule packs.

Real gambling/disclosure law does not reduce to a single numeric formula --
Belgium, the Netherlands, China, and South Korea each regulate loot boxes
differently (classification-as-gambling vs. disclosure-only mandates), and
none of them literally specify "flag anything more than a chi-square p of
0.01 percentage points off." These packs are illustrative defaults for how
strict an audit should be per market, meant to be tuned by legal counsel --
not a claim of legal certification. That said, the knobs are real and the
statistics behind them (see compliance.py) are not: this is a genuine
per-region significance threshold and practical-tolerance floor, not a
cosmetic label swap.
"""

from __future__ import annotations

from pydantic import BaseModel


class RegionRule(BaseModel):
    id: str
    label: str
    # Significance level (pre-Bonferroni-correction) for the item rate
    # z-test -- lower means "flag smaller deviations as non-chance."
    alpha: float
    # Practical-tolerance floor, in probability units (e.g. 0.0005 = 0.05pp)
    # -- a deviation this small or smaller is never flagged red, no matter
    # how statistically significant, because at large enough sample sizes
    # *any* nonzero deviation becomes "significant" without being a real
    # business problem.
    min_pp_floor: float
    # Extra pulls tolerated past pity's own guaranteed_within_pulls before
    # the pity flag turns red (0 = strict, no slack).
    pity_grace_pulls: int
    note: str


REGIONS: dict[str, RegionRule] = {
    "global": RegionRule(
        id="global",
        label="Global (default)",
        alpha=0.01,
        min_pp_floor=0.001,
        pity_grace_pulls=0,
        note="Baseline tolerance -- no specific jurisdiction's law applied.",
    ),
    "belgium": RegionRule(
        id="belgium",
        label="Belgium",
        alpha=0.005,
        min_pp_floor=0.0005,
        pity_grace_pulls=0,
        note=(
            "Belgium's Gaming Commission has treated paid loot boxes as unlicensed "
            "gambling; modeled here as the strictest pack (tighter significance "
            "threshold and tolerance floor), not a citation to a specific statute."
        ),
    ),
    "netherlands": RegionRule(
        id="netherlands",
        label="Netherlands",
        alpha=0.01,
        min_pp_floor=0.0007,
        pity_grace_pulls=0,
        note=(
            "The Dutch gambling authority's loot-box fine against EA was later "
            "overturned on appeal, so enforcement precedent is weaker than "
            "Belgium's -- modeled here as moderately strict."
        ),
    ),
    "china": RegionRule(
        id="china",
        label="China",
        alpha=0.01,
        min_pp_floor=0.001,
        pity_grace_pulls=0,
        note=(
            "China mandates public probability disclosure for loot mechanics "
            "(the disclosed number must be accurate), which this maps to an "
            "accuracy check on advertised_rates rather than a gambling ban."
        ),
    ),
    "south_korea": RegionRule(
        id="south_korea",
        label="South Korea",
        alpha=0.01,
        min_pp_floor=0.001,
        pity_grace_pulls=0,
        note=(
            "Korea's amended Game Industry Promotion Act requires probability "
            "disclosure similarly to China -- same accuracy-check framing."
        ),
    ),
}

DEFAULT_REGION = "global"


def region_for(region_id: str | None) -> RegionRule:
    return REGIONS.get(region_id or DEFAULT_REGION, REGIONS[DEFAULT_REGION])
