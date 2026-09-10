# Loot Table Balance Auditor

A SaaS tool that checks whether a game's randomized reward system (loot boxes, gacha pulls, card packs) actually behaves the way it's advertised to players. Users sign up, save loot table configs under their account, run static validation + Monte Carlo simulation against them, and get compliance flags showing whether the advertised drop rate matches the real simulated rate — including whether pity timers actually trigger correctly.

Built for the Xsolla Baku GameTech Hackathon (Sept 10–11). Scoped as a real multi-user product, not a single-page demo tool.

## The Problem

Studios hand-maintain loot table configs (item weights, rarity tiers, pity-timer rules) across live-service and gacha games. Common silent bugs:

- Weights that don't sum correctly, unreachable items, duplicate ids
- Pity timers with a typo or off-by-one bug (never trigger, or trigger late)
- Advertised rates that quietly drift from the real simulated rate

Several jurisdictions (Belgium, Netherlands, China, South Korea) have gambling-law or disclosure-law consequences when a game's actual odds don't match what's published.

## GameTech Use Case

Developer tooling for live-ops and monetization teams: catch a misconfigured loot table before it ships, not after a player — or a regulator — notices the numbers don't add up. It's a subscription product rather than a one-off script because studios patch these economies constantly and need this check every time, which is also why it's built as a real multi-user SaaS (accounts, saved tables, tiered plans) rather than a stateless single page.

## Product Shape

```
Sign up / log in
  → Dashboard (list of saved loot tables)
  → Create or upload a loot table
  → Run audit (validation + simulation)
  → View results (flags, charts, compliance report)
  → Save / re-run / compare versions
  → Pricing page shows current plan + upgrade path
```

| Route | Purpose |
|---|---|
| `/` | Marketing landing page |
| `/login`, `/signup` | Auth |
| `/dashboard` | Saved loot tables (card grid, status dot per table), "New Audit" CTA |
| `/tables/new` | Create/upload a loot table (paste JSON, upload a file, or start from a bundled sample) |
| `/tables/:id` | Table detail: run audit, validation issues, compliance flags, charts, history |
| `/pricing` | Plan comparison |
| `/settings` | Account info, current plan |

## Plans

| | **Free** | **Studio** | **Enterprise** |
|---|---|---|---|
| Price | $0 | $49/mo | Custom |
| Saved loot tables | 1 | 10 | Unlimited |
| Simulation size | 100k pulls | 1M pulls | 1M+ pulls |
| Report export | — | ✅ | ✅ |
| Audit history per table | Last run only | Full history | Full history |

Enforcement is a real, checked field on each request (creating a 2nd table on Free returns `403`, requesting more pulls than your plan allows gets silently capped, Free's history is pruned to the latest run after each audit) — **there is no real payment processing**. "Upgrade" is a disabled/alert-only action, not a charge. Be upfront about this if asked by judges.

## Tech Stack

| Layer | Choice |
|---|---|
| Backend | Python + FastAPI, SQLAlchemy + SQLite, bcrypt + JWT (`python-jose`) for auth, numpy for simulation, pytest |
| Frontend | React + TypeScript (Vite), React Router, Tailwind CSS v4, Recharts, lucide-react |
| Data | SQLite file (`backend/loot_auditor.db`, gitignored) — `User` / `LootTableRecord` / `AuditRun`, created via `Base.metadata.create_all` on startup, no migration tooling |

## Setup

Requires Python 3.11+ and Node 18+.

```bash
# Backend
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

### Environment variables

None are required to run locally — the backend falls back to a dev-only JWT secret automatically. For anything beyond localhost, set:

```bash
export LOOT_AUDITOR_JWT_SECRET="a long random value"   # required outside localhost
export LOOT_AUDITOR_DB_PATH="./loot_auditor.db"          # optional, defaults shown
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

Open http://localhost:5173, sign up (any email/password, 8+ characters), and you'll land on an empty dashboard. Click **New Audit**, pick `starter_chest_buggy` from the template dropdown, save, and run the audit.

## Test

```bash
cd backend
.venv/bin/python3 -m pytest tests/ -v
```

17/17 should pass — the bug-injection self-test suite, proving the validator, simulator, and compliance diff each catch what they claim to. This suite exercises the core audit logic directly (`app.schema`/`validator`/`simulate`/`compliance`), independent of the API/auth layer built on top of it.

## Build (frontend)

```bash
cd frontend
npm run build
```

## Architecture

```
backend/
  app/
    schema.py       loot table data model (Pydantic) -- unchanged since the core-logic build
    validator.py      static config checks
    simulate.py         Monte Carlo pull simulator + pity logic
    compliance.py         advertised-vs-simulated diff, red/yellow/green
    db.py                    SQLite engine/session setup
    db_models.py               User / LootTableRecord / AuditRun (SQLAlchemy)
    auth.py                      bcrypt hashing + JWT issue/verify
    plans.py                       free/studio/enterprise limits
    main.py                          FastAPI app: auth, table CRUD, audit, history
  samples/              bundled demo loot tables (clean + buggy)
  tests/
    test_auditor.py       bug-injection self-test suite (core logic only)

frontend/
  src/
    types.ts                    TS types mirroring the backend's Pydantic/API shapes
    lib/
      api.ts                      fetch wrapper, attaches the JWT to every request
      auth.tsx                       AuthContext (login/signup/logout, current user)
      report.ts                        client-side compliance report export
    components/
      ui/                                Button, Card, Badge, Input, NavItem
      AppShell.tsx                        left-nav layout for authenticated pages
      ProtectedRoute.tsx                    redirects to /login when logged out
      AuditResults.tsx, RateChart.tsx, PityChart.tsx
    pages/                                   one file per route
    App.tsx                                    React Router setup
```

`POST /tables/{id}/audit` does validate → simulate → compliance-check and persists the result as an `AuditRun` in one call. If validation finds a blocking error (duplicate ids, nonsensical rates, a self-referencing table), simulation is skipped and the response says exactly why — never a silent failure on broken data. Core audit logic (schema/validator/simulate/compliance) is untouched from the original single-page build; everything added for the SaaS shape (auth, persistence, ownership, plan limits) wraps around it rather than modifying it.

## How It Works (Demo)

1. Land on `/` for a few seconds — this is a real product with plans, not a script.
2. Sign up, land on an empty dashboard.
3. Create a table from the `starter_chest_buggy` template. It has three bugs planted together: `advertised_rates` sums to 1.01 (rounding drift), the pity `target_rarity` is `"Legendary"` while items use `"legendary"` (a case-typo that silently breaks pity entirely), and `legendary_sword`'s weight was bumped without updating its advertised rate — so its simulated rate lands at ~1.4% against an advertised 1%.
4. Run the audit. You'll see the validation warnings, red compliance flags on `legendary_sword` and `common_sword`, and a red pity flag ("never obtained, naturally or via pity, across the whole simulation").
5. Create a second table from `starter_chest_clean` — the same config with all three bugs fixed — and run its audit. Every flag goes green, including pity (which correctly caps every simulated pull-streak at exactly 90 pulls).
6. Run `pytest tests/ -v` in a terminal to show the self-test suite proving all of this is actually verified, not just eyeballed.
7. One-line the business model: studios running gacha/loot-box economies need this check every time they patch the economy, not once — which is why it's a subscription product with saved tables and plan tiers, not a one-off script.

## Known Weaknesses

- No real payment processing — plan gating is enforced in-app but not billed.
- Tolerance/compliance logic is a single configurable threshold, not region-specific (Belgium vs. China vs. Korea have different actual disclosure rules).
- Auth is minimal (email/password only, no SSO) — fine for a hackathon demo, not enterprise-ready as-is.
- Realistic path to market is likely as a compliance module inside a larger live-ops/analytics platform rather than a standalone company at scale — still a legitimate standalone SaaS at small scale (indie/mid studios), which is the story worth telling to judges.
