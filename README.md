# Loot Table Balance Auditor

A tool that checks whether a game's randomized reward system (loot boxes, gacha pulls, card packs) actually behaves the way it's advertised to players. It statically validates a loot table config for math errors, then Monte Carlo simulates hundreds of thousands of pulls to measure the *actual* odds against the *advertised* odds — including whether pity timers really trigger when they're supposed to.

Built for the Xsolla Baku GameTech Hackathon (Sept 10–11).

## The Problem

Studios hand-maintain loot table configs (item weights, rarity tiers, pity-timer rules) across live-service and gacha games. Common silent bugs:

- Weights don't sum to the assumed total (rounding drift)
- Unreachable items (weight 0, no fallback path)
- Pity-timer logic with a typo or off-by-one bug (never triggers, or triggers late)
- Copy-paste errors causing a "rare" item to actually be more common than a "common" one
- The advertised drop rate (shown to players, or used in compliance filings) diverging from the real simulated rate

This matters beyond QA: several jurisdictions (Belgium, Netherlands, China, South Korea) have gambling-law or disclosure-law consequences for loot box mechanics whose actual odds don't match what's published.

## GameTech Use Case

Developer tooling for live-ops and monetization teams: catch a misconfigured loot table *before* it ships, not after a player notices the numbers don't add up (or a regulator does). Fits into a CI pipeline or a pre-release checklist for any game with randomized rewards.

## Features

- **Static validator** — duplicate item ids, unreachable (weight-0) items, advertised-rate coverage mismatches, out-of-range rates, advertised-rate sum drift, pity target/guarantee sanity, pity dead-conditions, nested-table self-reference cycles.
- **Monte Carlo simulator** — configurable pull count (default 300k, tested up to 1M in ~0.2s), tracks per-item and per-rarity rates, applies "hard pity" (forces the target rarity once a player would exceed the guaranteed pull count), and reports a pity convergence histogram.
- **Compliance diff** — per-item red/yellow/green flags comparing simulated vs. advertised rates, with the effective tolerance scaled to sampling noise at the chosen pull count (so a correct table doesn't randomly flag from Monte Carlo variance) — plus a separate flag for whether pity actually delivers its promised guarantee at all.
- **Bug-injection self-test suite** — 17 pytest cases that mutate a known-good table one bug at a time and assert the auditor catches each one, proving the checker actually works rather than just looking like it does.
- **Web dashboard** — paste/upload a loot table (or pick a bundled sample), run an audit, see validation issues, compliance flags, and charts.

## Tech Stack

| Layer | Choice |
|---|---|
| Backend | Python + FastAPI, numpy (Monte Carlo), pytest |
| Frontend | React + TypeScript (Vite), Recharts |
| Data | Stateless — each request carries the full loot table JSON, no database |

## Setup

Requires Python 3.11+ and Node 18+. No environment variables or secrets needed — this is a fully local, stateless tool.

```bash
# Backend
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

## Run

```bash
# Terminal 1 — backend on :8000
cd backend
.venv/bin/python3 -m uvicorn app.main:app --port 8000

# Terminal 2 — frontend on :5173
cd frontend
npm run dev
```

Open http://localhost:5173, pick a sample table from the dropdown (or paste/upload your own), and click **Run Audit**.

## Test

```bash
cd backend
.venv/bin/python3 -m pytest tests/ -v
```

17/17 should pass — this is the bug-injection self-test suite proving the validator, simulator, and compliance diff each catch what they claim to.

## Build (frontend)

```bash
cd frontend
npm run build
```

## Architecture

```
backend/
  app/
    schema.py      loot table data model (Pydantic)
    validator.py    static config checks
    simulate.py      Monte Carlo pull simulator + pity logic
    compliance.py     advertised-vs-simulated diff, red/yellow/green
    main.py            FastAPI app: POST /audit, GET /samples
  samples/            bundled demo loot tables (clean + buggy)
  tests/
    test_auditor.py   bug-injection self-test suite

frontend/
  src/
    types.ts          TS types mirroring the backend's Pydantic models
    lib/api.ts          fetch wrapper for /audit and /samples
    components/           TableInput, ResultsPanel, RateChart, PityChart
    App.tsx                  layout + state
```

One endpoint (`POST /audit`) does everything: validate → simulate → compliance-check, and returns all three in one response. If validation finds a blocking error (duplicate ids, nonsensical rates, a self-referencing table), simulation is skipped entirely and the response says exactly why — never a silent failure on broken data.

## How It Works (Demo)

1. Load `starter_chest_buggy` from the sample dropdown. It has three bugs planted together: `advertised_rates` sums to 1.01 (rounding drift), the pity `target_rarity` is `"Legendary"` while items use `"legendary"` (a case-typo that silently breaks pity entirely), and `legendary_sword`'s weight was bumped without updating its advertised rate — so its simulated rate lands at ~1.4% against an advertised 1%.
2. Run the audit. You'll see the validation warnings, a red compliance flag on `legendary_sword` and `common_sword`, and a red pity flag ("never obtained, naturally or via pity, across the whole simulation").
3. Load `starter_chest_clean` — the same table with all three bugs fixed — and run again. Every flag goes green, including pity (which correctly caps every simulated pull-streak at exactly 90 pulls).
4. Run `pytest tests/ -v` in a terminal to show the self-test suite proving all of this is actually verified, not just eyeballed.

## Known Weaknesses

- Tolerance/compliance logic is a single configurable threshold, not region-specific (Belgium vs. China vs. Korea have different actual disclosure rules) — that's a real productionization gap, not a demo blocker.
- This is a compliance/audit feature, not a full product on its own — the realistic path to market is as a module inside a larger live-ops/analytics suite.
- No persistence layer (by design, for the MVP) — every audit is a fresh request; nothing is saved between runs.
