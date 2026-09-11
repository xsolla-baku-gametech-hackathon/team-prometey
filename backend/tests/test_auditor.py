"""
Bug-injection self-test suite (see PROJECT.md section 2.5 / build order step 3).

Takes the known-good starter_chest_clean table, deliberately mutates it one
bug at a time, and asserts the auditor actually catches each planted bug.
This is both a regression test suite and a live demo asset: "we didn't just
build a checker, we proved it catches real planted bugs."
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from app.compliance import compute_compliance
from app.schema import LootTable
from app.simulate import simulate
from app.validator import has_blocking_errors, validate_table

SAMPLES_DIR = Path(__file__).parent.parent / "samples"


def _load(name: str) -> dict:
    with open(SAMPLES_DIR / f"{name}.json") as f:
        return json.load(f)


@pytest.fixture
def clean_table_dict() -> dict:
    return _load("starter_chest_clean")


def codes(issues) -> set[str]:
    return {i.code for i in issues}


# ── Clean table: no false positives ─────────────────────────────────────


def test_clean_table_has_no_validation_issues(clean_table_dict):
    table = LootTable.model_validate(clean_table_dict)
    assert validate_table(table) == []


def test_clean_table_compliance_is_all_green(clean_table_dict):
    table = LootTable.model_validate(clean_table_dict)
    sim = simulate(table, num_pulls=300_000, seed=123)
    report = compute_compliance(table, sim)
    assert report.overall_status == "green"
    assert all(f.status == "green" for f in report.item_flags)
    assert report.pity_flag.status == "green"


def test_clean_table_pity_never_exceeds_its_own_guarantee(clean_table_dict):
    table = LootTable.model_validate(clean_table_dict)
    sim = simulate(table, num_pulls=300_000, seed=123)
    assert sim.pity.max_pulls_observed_to_target is not None
    assert sim.pity.max_pulls_observed_to_target <= table.pity.guaranteed_within_pulls


# ── Planted bugs: static validator ──────────────────────────────────────


def test_catches_duplicate_item_id(clean_table_dict):
    mutated = copy.deepcopy(clean_table_dict)
    mutated["items"].append(dict(mutated["items"][0]))  # duplicate the first item's id
    table = LootTable.model_validate(mutated)
    issues = validate_table(table)
    assert "duplicate_item_id" in codes(issues)
    assert has_blocking_errors(issues)


def test_catches_unreachable_item(clean_table_dict):
    mutated = copy.deepcopy(clean_table_dict)
    mutated["items"][0]["weight"] = 0
    table = LootTable.model_validate(mutated)
    issues = validate_table(table)
    assert "unreachable_item" in codes(issues)


def test_catches_missing_advertised_rate(clean_table_dict):
    mutated = copy.deepcopy(clean_table_dict)
    del mutated["advertised_rates"]["epic_sword"]
    table = LootTable.model_validate(mutated)
    issues = validate_table(table)
    assert "missing_advertised_rate" in codes(issues)


def test_catches_orphan_advertised_rate(clean_table_dict):
    mutated = copy.deepcopy(clean_table_dict)
    mutated["advertised_rates"]["mythic_sword"] = 0.001
    table = LootTable.model_validate(mutated)
    issues = validate_table(table)
    assert "orphan_advertised_rate" in codes(issues)


def test_catches_advertised_rate_out_of_range(clean_table_dict):
    mutated = copy.deepcopy(clean_table_dict)
    mutated["advertised_rates"]["epic_sword"] = 1.5
    table = LootTable.model_validate(mutated)
    issues = validate_table(table)
    assert "advertised_rate_out_of_range" in codes(issues)
    assert has_blocking_errors(issues)


def test_catches_advertised_rate_sum_drift(clean_table_dict):
    mutated = copy.deepcopy(clean_table_dict)
    mutated["advertised_rates"]["common_sword"] = 0.75  # was 0.69 -- sum now drifts well past 1.0
    table = LootTable.model_validate(mutated)
    issues = validate_table(table)
    assert "advertised_rate_sum_drift" in codes(issues)


def test_catches_pity_nonpositive_guarantee(clean_table_dict):
    mutated = copy.deepcopy(clean_table_dict)
    mutated["pity"]["guaranteed_within_pulls"] = 0
    table = LootTable.model_validate(mutated)
    issues = validate_table(table)
    assert "pity_nonpositive_guarantee" in codes(issues)
    assert has_blocking_errors(issues)


def test_catches_pity_target_rarity_typo(clean_table_dict):
    mutated = copy.deepcopy(clean_table_dict)
    mutated["pity"]["target_rarity"] = "Legendary"  # case-typo vs items' "legendary"
    table = LootTable.model_validate(mutated)
    issues = validate_table(table)
    assert "pity_target_rarity_not_found" in codes(issues)


def test_catches_pity_dead_condition(clean_table_dict):
    mutated = copy.deepcopy(clean_table_dict)
    for item in mutated["items"]:
        if item["rarity"] == "legendary":
            item["weight"] = 0
    table = LootTable.model_validate(mutated)
    issues = validate_table(table)
    assert "pity_dead_condition" in codes(issues)


def test_catches_nested_table_self_reference(clean_table_dict):
    mutated = copy.deepcopy(clean_table_dict)
    mutated["items"][0]["ref_table_id"] = mutated["table_id"]
    table = LootTable.model_validate(mutated)
    issues = validate_table(table)
    assert "nested_table_self_reference" in codes(issues)
    assert has_blocking_errors(issues)


# ── Planted bugs: only visible through simulation + compliance ─────────


def test_catches_advertised_rate_diverging_from_true_odds(clean_table_dict):
    # Weight bumped without updating the advertised rate to match -- a
    # realistic "balance patch, forgot to update marketing copy" bug.
    # Not something static validation can catch (both values are
    # individually "valid"); only the simulation reveals the mismatch.
    mutated = copy.deepcopy(clean_table_dict)
    for item in mutated["items"]:
        if item["id"] == "legendary_sword":
            item["weight"] = 14  # was 10 -- true rate becomes ~1.4%, advertised stays 1%
    table = LootTable.model_validate(mutated)
    sim = simulate(table, num_pulls=300_000, seed=99)
    report = compute_compliance(table, sim)
    legendary_flag = next(f for f in report.item_flags if f.item_id == "legendary_sword")
    assert legendary_flag.status == "red"
    assert report.overall_status == "red"


def test_catches_pity_that_never_actually_triggers(clean_table_dict):
    mutated = copy.deepcopy(clean_table_dict)
    mutated["pity"]["target_rarity"] = "Legendary"  # typo breaks pity entirely
    table = LootTable.model_validate(mutated)
    sim = simulate(table, num_pulls=300_000, seed=99)
    report = compute_compliance(table, sim)
    assert report.pity_flag.status == "red"
    assert sim.pity.forced_hits == 0


# ── The pre-built buggy sample: every planted bug caught together ──────


def test_buggy_sample_table_is_flagged_end_to_end():
    table = LootTable.model_validate(_load("starter_chest_buggy"))
    validation_issues = validate_table(table)
    assert "advertised_rate_sum_drift" in codes(validation_issues)
    assert "pity_target_rarity_not_found" in codes(validation_issues)

    sim = simulate(table, num_pulls=300_000, seed=99)
    report = compute_compliance(table, sim)
    assert report.overall_status == "red"
    assert report.pity_flag.status == "red"


def test_duplicate_and_unreachable_sample_table():
    table = LootTable.model_validate(_load("bug_duplicate_and_unreachable"))
    issues = validate_table(table)
    assert "duplicate_item_id" in codes(issues)
    assert "unreachable_item" in codes(issues)
    assert has_blocking_errors(issues)


# ── Statistical rigor: Wilson intervals, z-test, region packs ──────────


def test_wilson_interval_contains_point_estimate_and_narrows_with_n():
    from app.compliance import _wilson_interval

    for n in (1_000, 100_000, 1_000_000):
        low, high = _wilson_interval(0.25, n)
        assert low < 0.25 < high

    narrow_low, narrow_high = _wilson_interval(0.25, 1_000_000)
    wide_low, wide_high = _wilson_interval(0.25, 1_000)
    assert (narrow_high - narrow_low) < (wide_high - wide_low)


def test_z_test_p_value_shrinks_as_deviation_or_sample_size_grows():
    from app.compliance import _z_test

    _, p_small_n = _z_test(0.011, 0.01, 10_000)
    _, p_large_n = _z_test(0.011, 0.01, 1_000_000)
    assert p_large_n < p_small_n  # same relative deviation, more data -> more confident it's real

    _, p_small_delta = _z_test(0.0101, 0.01, 300_000)
    _, p_large_delta = _z_test(0.02, 0.01, 300_000)
    assert p_large_delta < p_small_delta


def test_bonferroni_correction_divides_alpha_by_item_count(clean_table_dict):
    table = LootTable.model_validate(clean_table_dict)
    sim = simulate(table, num_pulls=300_000, seed=123)
    report = compute_compliance(table, sim, region="global")
    from app.regions import REGIONS

    assert report.alpha == pytest.approx(REGIONS["global"].alpha / len(table.advertised_rates))


def test_region_pack_flags_a_drift_global_tolerates(clean_table_dict):
    # A small, realistic balance-patch drift (legendary weight 10 -> 11,
    # ~0.09pp) sits inside global's looser practical-tolerance floor but
    # outside Belgium's tighter one -- the region pack should be the
    # deciding factor, not a coincidence of the underlying stats.
    mutated = copy.deepcopy(clean_table_dict)
    for item in mutated["items"]:
        if item["id"] == "legendary_sword":
            item["weight"] = 11
    table = LootTable.model_validate(mutated)
    sim = simulate(table, num_pulls=1_000_000, seed=7)

    global_report = compute_compliance(table, sim, region="global")
    belgium_report = compute_compliance(table, sim, region="belgium")

    global_flag = next(f for f in global_report.item_flags if f.item_id == "legendary_sword")
    belgium_flag = next(f for f in belgium_report.item_flags if f.item_id == "legendary_sword")
    assert global_flag.status == "green"
    assert belgium_flag.status == "red"


def test_suggested_weight_fixes_the_flagged_item(clean_table_dict):
    # Plant the same drift as the diverging-odds test, take the suggested
    # weight it computes, apply it, and confirm the item is actually
    # green afterward -- proves the algebra is correct end-to-end, not
    # just plausible-looking.
    mutated = copy.deepcopy(clean_table_dict)
    for item in mutated["items"]:
        if item["id"] == "legendary_sword":
            item["weight"] = 14
    broken_table = LootTable.model_validate(mutated)
    sim = simulate(broken_table, num_pulls=300_000, seed=99)
    report = compute_compliance(broken_table, sim, region="global")
    flag = next(f for f in report.item_flags if f.item_id == "legendary_sword")
    assert flag.status == "red"
    assert flag.suggested_weight is not None

    fixed = copy.deepcopy(mutated)
    for item in fixed["items"]:
        if item["id"] == "legendary_sword":
            item["weight"] = flag.suggested_weight
    fixed_table = LootTable.model_validate(fixed)
    fixed_sim = simulate(fixed_table, num_pulls=1_000_000, seed=99)
    fixed_report = compute_compliance(fixed_table, fixed_sim, region="global")
    fixed_flag = next(f for f in fixed_report.item_flags if f.item_id == "legendary_sword")
    assert fixed_flag.status == "green"


def test_suggested_weight_is_none_for_compliant_items(clean_table_dict):
    table = LootTable.model_validate(clean_table_dict)
    sim = simulate(table, num_pulls=300_000, seed=123)
    report = compute_compliance(table, sim, region="global")
    assert all(f.suggested_weight is None for f in report.item_flags if f.status == "green")


def test_pity_grace_period_forgives_a_small_overshoot(clean_table_dict):
    from app.regions import RegionRule

    table = LootTable.model_validate(clean_table_dict)
    sim = simulate(table, num_pulls=300_000, seed=123)
    strict = RegionRule(id="t", label="t", alpha=0.01, min_pp_floor=0.001, pity_grace_pulls=0, note="")

    # Force an artificial overshoot to exercise the grace period without
    # depending on simulation internals.
    sim.pity.max_pulls_observed_to_target = table.pity.guaranteed_within_pulls + 2

    strict_report = compute_compliance(table, sim, region=strict)
    assert strict_report.pity_flag.status == "red"

    lenient = strict.model_copy(update={"pity_grace_pulls": 5})
    lenient_report = compute_compliance(table, sim, region=lenient)
    assert lenient_report.pity_flag.status == "green"
