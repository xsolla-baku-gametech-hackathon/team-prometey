"""
Loot table schema (see PROJECT.md section 3).

Weight units are arbitrary integers/floats -- the simulator normalizes
by their sum. `advertised_rates` is what the game claims to players or
regulators; that's what gets diffed against simulated reality.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class Item(BaseModel):
    id: str
    rarity: str
    weight: float = Field(ge=0)
    # Optional: this item is itself a chest that opens into another table.
    # Only used by the "nested-table reference" validator check for now --
    # true cross-table resolution is out of scope for the MVP (the API only
    # ever receives one table per request).
    ref_table_id: str | None = None


class Pity(BaseModel):
    target_rarity: str
    guaranteed_within_pulls: int
    reset_on_trigger: bool = True


class LootTable(BaseModel):
    table_id: str
    advertised_rates: dict[str, float]
    items: list[Item]
    pity: Pity | None = None
