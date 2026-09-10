"""
Static validation for a loot table (see PROJECT.md section 2.2).

Runs before any simulation. Each issue is tagged with a severity:
    "error"   -- the data is broken enough that simulation would be
                 meaningless or would crash; the caller should not run it.
    "warning" -- the config is suspicious but simulation can still run and
                 will usually make the consequence visible on its own
                 (e.g. a mistyped pity target shows up as pity never firing).

Never silently drop or skip a bad table -- always return a specific,
actionable issue instead (per the build spec's "never a silent failure").
"""

from __future__ import annotations

from pydantic import BaseModel

from app.schema import LootTable

ADVERTISED_RATE_SUM_TOLERANCE = 0.005


class Issue(BaseModel):
    severity: str  # "error" | "warning"
    code: str
    message: str
    item_id: str | None = None


def validate_table(table: LootTable) -> list[Issue]:
    issues: list[Issue] = []
    issues += _check_duplicate_ids(table)
    issues += _check_unreachable_items(table)
    issues += _check_advertised_rate_coverage(table)
    issues += _check_advertised_rate_range(table)
    issues += _check_advertised_rate_sum(table)
    issues += _check_pity(table)
    issues += _check_nested_table_self_reference(table)
    return issues


def has_blocking_errors(issues: list[Issue]) -> bool:
    return any(i.severity == "error" for i in issues)


def _check_duplicate_ids(table: LootTable) -> list[Issue]:
    seen: set[str] = set()
    dupes: set[str] = set()
    for item in table.items:
        if item.id in seen:
            dupes.add(item.id)
        seen.add(item.id)
    return [
        Issue(
            severity="error",
            code="duplicate_item_id",
            message=f"Item id '{item_id}' appears more than once. Each item must have a unique id.",
            item_id=item_id,
        )
        for item_id in sorted(dupes)
    ]


def _check_unreachable_items(table: LootTable) -> list[Issue]:
    return [
        Issue(
            severity="warning",
            code="unreachable_item",
            message=f"Item '{item.id}' has weight {item.weight} and can never drop.",
            item_id=item.id,
        )
        for item in table.items
        if item.weight <= 0
    ]


def _check_advertised_rate_coverage(table: LootTable) -> list[Issue]:
    item_ids = {item.id for item in table.items}
    advertised_ids = set(table.advertised_rates)
    issues = [
        Issue(
            severity="warning",
            code="missing_advertised_rate",
            message=f"Item '{item_id}' has no advertised_rates entry -- compliance can't be checked for it.",
            item_id=item_id,
        )
        for item_id in sorted(item_ids - advertised_ids)
    ]
    issues += [
        Issue(
            severity="warning",
            code="orphan_advertised_rate",
            message=f"advertised_rates has an entry for '{item_id}', but no item with that id exists.",
            item_id=item_id,
        )
        for item_id in sorted(advertised_ids - item_ids)
    ]
    return issues


def _check_advertised_rate_range(table: LootTable) -> list[Issue]:
    return [
        Issue(
            severity="error",
            code="advertised_rate_out_of_range",
            message=f"advertised_rates['{item_id}'] = {rate}, which is not a valid probability in [0, 1].",
            item_id=item_id,
        )
        for item_id, rate in table.advertised_rates.items()
        if not (0.0 <= rate <= 1.0)
    ]


def _check_advertised_rate_sum(table: LootTable) -> list[Issue]:
    total = sum(table.advertised_rates.values())
    drift = abs(total - 1.0)
    if drift > ADVERTISED_RATE_SUM_TOLERANCE:
        return [
            Issue(
                severity="warning",
                code="advertised_rate_sum_drift",
                message=f"advertised_rates sums to {total:.4f}, not 1.0 (drift {drift:.4f}). Likely a rounding or copy-paste error.",
            )
        ]
    return []


def _check_pity(table: LootTable) -> list[Issue]:
    if table.pity is None:
        return []
    issues: list[Issue] = []

    if table.pity.guaranteed_within_pulls <= 0:
        issues.append(
            Issue(
                severity="error",
                code="pity_nonpositive_guarantee",
                message=f"pity.guaranteed_within_pulls = {table.pity.guaranteed_within_pulls}, must be a positive number of pulls.",
            )
        )

    target_items = [item for item in table.items if item.rarity == table.pity.target_rarity]
    if not target_items:
        issues.append(
            Issue(
                severity="warning",
                code="pity_target_rarity_not_found",
                message=(
                    f"pity.target_rarity is '{table.pity.target_rarity}', but no item has that exact rarity "
                    "(check for a typo or case mismatch) -- the pity guarantee can never actually trigger."
                ),
            )
        )
    elif all(item.weight <= 0 for item in target_items):
        issues.append(
            Issue(
                severity="warning",
                code="pity_dead_condition",
                message=(
                    f"Every item of rarity '{table.pity.target_rarity}' has weight 0 -- pity has nothing "
                    "reachable to award, so the guarantee can never actually trigger."
                ),
            )
        )

    return issues


def _check_nested_table_self_reference(table: LootTable) -> list[Issue]:
    return [
        Issue(
            severity="error",
            code="nested_table_self_reference",
            message=f"Item '{item.id}' references ref_table_id '{item.ref_table_id}', which is this table's own id -- infinite loop.",
            item_id=item.id,
        )
        for item in table.items
        if item.ref_table_id is not None and item.ref_table_id == table.table_id
    ]
