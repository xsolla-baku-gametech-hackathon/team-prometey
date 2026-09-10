# Loot Table Balance Auditor

A tool that validates whether a game's randomized reward system (loot boxes, gacha pulls, card packs) actually behaves the way it's advertised to players. It statically checks a loot table config for math errors, then Monte Carlo simulates millions of pulls to measure *actual* experienced drop rates against the *advertised* rates, flagging any mismatch — including whether pity timers really trigger when they're supposed to.

Built for a 12-hour hackathon (gametech theme). No game engine dependency — pure config-in, simulation-engine, dashboard-out.

---

## 1. Problem

Studios hand-maintain loot table configs (item weights, rarity tiers, pity-timer rules) across live-service and gacha games. Common silent bugs:

- Weights don't sum to the assumed total (rounding drift)
- Unreachable items (weight 0, no fallback path)
- Pity-timer logic with off-by-one or dead-condition bugs (never triggers, or triggers late/early)
- Copy-paste errors causing a "rare" item to actually be more common than a "common" one
- Advertised drop rate (shown to players / used in compliance filings) diverging from the real simulated rate

This matters beyond QA: several jurisdictions (Belgium, Netherlands, China, South Korea) have real gambling-law or disclosure-law consequences for loot box mechanics whose actual odds don't match what's published. See `RESEARCH.md` (optional, not required for build) for sourced cases.

## 2. What We're Building (MVP scope)

1. **Loot table schema** — simple JSON format for items, rarity tiers, weights, and optional pity rules.
2. **Static validator** — sum-to-100(or 1.0) check, unreachable-item detection, duplicate ID detection, nested-table reference validation.
3. **Monte Carlo simulator** — run N pulls (default 500k–1M), track observed frequency per item and per rarity tier, track pity-timer trigger distribution (e.g. "% of players who got a legendary by pull 10 vs the claimed guarantee").
4. **Compliance diff** — compare simulated effective rate vs. an `advertised_rate` field in the config; flag red/yellow/green if divergence exceeds a tolerance threshold (configurable, e.g. ±0.1 percentage points).
5. **Bug-injection self-test** — a script that takes a known-good loot table, deliberately mutates it (breaks weight sum, breaks pity logic, mismatches advertised rate), and asserts the auditor flags each planted bug. This is both a test suite and a live demo asset.
6. **Dashboard** — single-page Streamlit (or plain HTML + chart.js) app: upload/paste a config, see validation results, a bar chart of advertised vs. simulated rates per item, and a pity-timer convergence chart. Toggle between a "buggy" and "fixed" sample table to show flags flip live.

### Out of scope for MVP (stretch only if time remains)
- Multi-region compliance rule packs (Belgium vs China vs Korea specific thresholds)
- File upload from real game engine export formats (Unity ScriptableObject, etc.) — JSON input only
- Auth, persistence, multi-user — single-session tool is fine
- Historical/real player data import — simulation only

## 3. Loot Table Schema (draft)

```json
{
  "table_id": "starter_chest",
  "advertised_rates": {
    "legendary_sword": 0.01,
    "epic_sword": 0.05,
    "rare_sword": 0.25,
    "common_sword": 0.69
  },
  "items": [
    { "id": "common_sword", "rarity": "common", "weight": 690 },
    { "id": "rare_sword", "rarity": "rare", "weight": 250 },
    { "id": "epic_sword", "rarity": "epic", "weight": 50 },
    { "id": "legendary_sword", "rarity": "legendary", "weight": 10 }
  ],
  "pity": {
    "target_rarity": "legendary",
    "guaranteed_within_pulls": 90,
    "reset_on_trigger": true
  }
}
```

Weight units are arbitrary integers/floats; simulator normalizes by sum. `advertised_rates` is what the game claims (marketing copy / compliance filing) — this is what gets diffed against simulated reality.

## 4. Tech Stack (Web App)

**Backend**
- **Python + FastAPI** — REST API exposing validate/simulate/compliance endpoints. Chosen over Streamlit because we want a real client-server split (proper web app, shareable URL, decoupled frontend).
- **numpy** — Monte Carlo simulation at 500k–1M+ pulls needs to stay fast.
- **pytest** — bug-injection self-test suite, run in CI/terminal, independent of the web layer.
- Stateless API — no DB needed for MVP; each request carries the loot table JSON and gets validation + simulation results back. Add Postgres/SQLite later only if we want saved history (stretch).

**Frontend**
- **React** (Vite) — single-page app: file upload / paste-JSON editor, "Run Audit" button, results view.
- **Recharts** or **Chart.js** — bar chart (advertised vs simulated rate per item), pity-timer convergence chart.
- Fetch calls to the FastAPI backend; render red/yellow/green compliance flags per item.
- Sample-table toggle (buggy vs fixed) as a dropdown that swaps the loaded JSON and re-runs the audit live.

**Dev/deploy**
- Local dev: `uvicorn` backend on one port, `vite dev` frontend on another, CORS enabled between them.
- Deploy for demo day: frontend to Vercel/Netlify (static), backend to Railway/Render/Fly.io (free tier is enough for a live 1M-pull request in a few seconds). Fallback: run both locally and demo via localhost if deployment eats time.

## 5. Build Order (suggested, ~12h)

1. Define schema + write 2–3 sample loot tables (one clean, one with each bug type planted) — `samples/`
2. Core Python logic, engine-agnostic and testable standalone:
   - `validator.py` — sum check, unreachable items, duplicate IDs
   - `simulate.py` — pull N times, track frequencies, track pity trigger distribution
   - Compliance diff logic — advertised vs simulated, tolerance threshold, red/yellow/green
3. Bug-injection self-test script (`test_auditor.py`) — mutate clean table N ways, assert each bug is caught. Do this **before** wiring up the API, so the core logic is proven correct in isolation.
4. FastAPI wrapper (`main.py`) — `POST /audit` takes a loot table JSON, returns validation results + simulation stats + compliance flags in one response. Keep it to one endpoint if time is tight.
5. React frontend — JSON input (paste/upload + sample-table dropdown), "Run Audit" button, results panel (flags + charts).
6. Wire frontend to backend, confirm buggy/fixed toggle flips flags live end-to-end.
7. Polish: compliance-report text/PDF export button (nice pitch beat), loading state, basic styling pass.
8. Deploy if time allows; otherwise finalize localhost demo flow.
9. Rehearse demo: load buggy table → show red flags → load fixed table → show green → show self-test suite passing live in terminal.

## 6. Demo Script (for pitch)

1. Open the web app with the "buggy" starter chest table pre-loaded.
2. Point out the red flags: weight sum error, pity timer never actually triggers, legendary simulated rate (e.g. 1.4%) diverges from advertised 1%.
3. Swap to the "fixed" version — all flags go green, simulated rate converges to advertised within tolerance.
4. Briefly show the self-test suite passing in terminal — "we didn't just build a checker, we proved it catches real planted bugs."
5. One-line the regulatory hook: "This is the difference between a compliance pass and a fine in markets like Belgium or China, where published odds are a legal requirement, not just a courtesy."

## 7. Known Weaknesses (be upfront if asked)

- Regulatory rule packs are not region-specific in the MVP — tolerance threshold is a single configurable number, not per-jurisdiction law.
- This is a compliance/audit feature, not a full product — realistic path to market is as a module inside a larger live-ops/analytics suite, not a standalone company.
- Demo is data/chart-driven rather than visually flashy — leans on "provably solves a real problem" rather than spectacle.