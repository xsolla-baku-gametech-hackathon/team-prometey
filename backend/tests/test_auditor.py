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
