# TrueLoot

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

## How It Works

An audit is four steps, run in order every time you click **Run Audit** (`POST /tables/{id}/audit` → `app/main.py`'s `_run_and_persist`): **validate**, then (if nothing blocking was found) **simulate**, then **diff against what was advertised**, then **persist the result**. Each step is its own module (`validator.py` / `simulate.py` / `compliance.py`), independently unit-tested, and none of them know about auth, plans, or the database — the SaaS layer only calls them and stores what comes back.

### 1. Static validation (`validator.py`)

Runs first, before any simulation, and never silently drops a bad table — every problem becomes a specific `Issue` with a `severity`:

| Check | Severity | Catches |
|---|---|---|
| `duplicate_item_id` | error | Two items share an id |
| `advertised_rate_out_of_range` | error | An advertised rate isn't a valid probability (outside `[0, 1]`) |
| `pity_nonpositive_guarantee` | error | `pity.guaranteed_within_pulls` is zero or negative |
| `nested_table_self_reference` | error | An item's `ref_table_id` points back at its own table (infinite loop) |
| `unreachable_item` | warning | Item weight is `≤ 0` — it can never drop |
| `missing_advertised_rate` / `orphan_advertised_rate` | warning | An item has no advertised rate, or vice versa — compliance can't be checked for it |
| `advertised_rate_sum_drift` | warning | `advertised_rates` doesn't sum to `1.0` within 0.5 percentage points — usually a copy-paste or rounding bug |
| `pity_target_rarity_not_found` | warning | `pity.target_rarity` doesn't match any item's `rarity` exactly (the classic case-typo, e.g. `"Legendary"` vs. `"legendary"`) |
| `pity_dead_condition` | warning | Every item of the pity target rarity has weight `0` — the guarantee has nothing to award |

Any **error** blocks the run entirely (`has_blocking_errors`): simulation is skipped, and the audit is persisted as `blocked: true` with the validation issues as the whole story. Broken data never quietly produces a "result" that looks trustworthy — it produces a clear reason it can't.

### 2. Monte Carlo simulation (`simulate.py`)

If validation didn't block, `simulate()` draws `num_pulls` items from the table's weighted distribution (`weight / sum(weights)` per item) using a vectorized `numpy.random.Generator.choice` — fast enough that even the Enterprise plan's 5,000,000-pull cap resolves in well under a second.

If the table declares a `pity` rule, a second pass — necessarily a sequential loop, since pity depends on each pull's history — applies **hard pity**: a running counter tracks pulls since the target rarity last landed, and the moment it would reach `guaranteed_within_pulls` without a natural hit, that pull is force-overridden to one of the target-rarity items instead. `reset_on_trigger` controls whether a natural hit also resets the counter (the sane default) or only a forced one does (a real, checkable pity-config bug).

**Why natural and realized rates are reported separately, and why that matters:** a *correctly configured* pity system necessarily pushes a player's actual experienced rate above the advertised base rate — that's the whole point of pity. Concretely: at a true 1% base rate with a 90-pull hard-pity guarantee, the chance a player's *natural* draws miss the target for all 90 pulls is `0.99^90 ≈ 40%` — so on a well-behaved table, roughly 4 in 10 pull-streaks get pity-saved at exactly pull 90, which alone drags the *realized* rate well above 1%. If compliance compared realized (pity-inclusive) rates against the advertised 1%, every correctly-built pity table would fail — a false positive that would make the tool useless. So `simulate()` reports two views: `item_rates` / `rarity_rates` are **natural draws only** (pity-forced pulls excluded) and are what compliance diffs against `advertised_rates`; `realized_item_rates` is the pity-inclusive "what a player actually walks away with," reported for context but never diffed. Pity's own promise — does the guarantee actually trigger in time — is checked separately, by tracking `max_pulls_observed_to_target` (the longest gap seen between hits across the whole run) and a convergence histogram (how many pulls it took to hit the target rarity, each time it happened) that drives the Pity Convergence chart.

### 3. Compliance diff (`compliance.py`)

Each item's natural simulated rate is compared against its advertised rate using a one-sample proportion **z-test** (advertised rate as the null hypothesis), not a bare percentage-point cutoff. A fixed pp tolerance alone isn't enough: Monte Carlo sampling has real statistical noise, so a perfectly correct table would randomly flag yellow/red purely from sampling variance, on a different item every time you re-ran it. Two refinements make the test trustworthy at scale:

- **Bonferroni correction** — testing N items each at a raw `alpha=0.05` inflates the whole table's false-positive rate to roughly `1-(1-0.05)^N` (≈18.5% for four items, not 5%). The per-item significance threshold actually used is `region.alpha / N`, keeping the table-wide false-positive rate near the region's stated `alpha`.
- **A practical-tolerance floor** (`region.min_pp_floor`) — at large enough sample sizes (1M+ pulls), *any* nonzero deviation becomes statistically significant without being a real business problem. A deviation at or below the floor is never flagged red no matter its p-value.

Each item flag also reports a 95% **Wilson score confidence interval** (tighter and more defensible than a symmetric normal approximation for low-probability items like a 1% legendary rate), and — for any non-green item — a **suggested corrected weight**, solved algebraically from `advertised_rate = w' / (other_items_weight + w')`. The Table Detail page surfaces this as an "Apply Fix & Re-run" button that patches the weight and re-audits immediately.

Pity gets its own flag, independent of the rate diff: `red` if the target rarity was never obtained at all (naturally or via pity) across the whole run, `red` if the longest observed gap exceeded the promised `guaranteed_within_pulls` (plus the region's `pity_grace_pulls`), otherwise `green`. The audit's `overall_status` is the worst status across every item flag plus the pity flag.

#### Region packs (`regions.py`)

`alpha`, `min_pp_floor`, and `pity_grace_pulls` are bundled per jurisdiction (Global default, Belgium, Netherlands, China, South Korea) and selectable per audit run via the Table Detail page's region dropdown or `POST /tables/{id}/audit`'s `region` field. **The specific numbers are illustrative defaults for tuning, not a citation to statute** — real loot-box law is about disclosure/classification, not a single numeric formula — but the statistical machinery behind them (the z-test, Bonferroni correction, and CI) is genuine, so picking a stricter region pack produces a genuinely different, defensible verdict on the same simulated data, not just a relabeled one.

#### Drift analysis (frontend-only, `DriftAnalysis.tsx`)

The Audit History page fits an ordinary-least-squares trend line to each item's advertised/simulated delta across a table's saved runs (Studio/Enterprise's full history only — needs 3+ runs), flagging an item "drifting toward breach" with a projected number of runs until it crosses its tolerance floor, even while the latest run still shows green. Pure client-side computation over data the history endpoint already returns — no new backend endpoint needed.

### 4. Frontend sync model

The loot table editor (`LootTableEditor.tsx`, used by both table creation and in-place editing) treats the raw JSON textarea as the single source of truth: the visual item/pity editor is a live view re-parsed from that text on every keystroke (`useMemo`), and any GUI edit (add an item, drag a rate) immediately re-serializes straight back into the same text. There's no separate GUI state to fall out of sync with the JSON — hand-editing the JSON and using the form are always looking at the same value.

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
| `/tables/:id` | Table detail: run audit, validation issues, compliance flags, charts |
| `/tables/:id/history` | Past audit runs for this table -- drill into any one, compare two |
| `/pricing` | Plan comparison |
| `/settings` | Account info, current plan, change password, logout |
| `/admin` | Ops dashboard (admin accounts only) — every user, their plan, and a way to change it |

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

None are required to run locally — the backend falls back to a dev-only JWT secret automatically. For anything beyond localhost, copy `backend/.env.example` and set:

```bash
export LOOT_AUDITOR_JWT_SECRET="a long random value"   # required outside localhost
export LOOT_AUDITOR_DB_PATH="./loot_auditor.db"          # optional, defaults shown
export TRUELOOT_ADMIN_EMAILS="you@yourteam.com"            # optional, grants /admin access -- see "Admin / Ops" below
export TRUELOOT_DEMO_PASSWORD="a password for demo@example.com"  # optional, see "Demo account" below
```

These four are backend-only. The frontend has one build-time variable, `VITE_API_BASE_URL`, needed only when it's deployed to a different host than the backend -- see Deploy below.

### Demo account

To skip manually recreating the buggy/fixed tables before a demo, seed a
`demo@example.com` account (Studio plan) with both tables already saved
and audited:

```bash
cd backend
.venv/bin/python3 -m app.seed_demo
```

Prints the account's email and confirms both audits ran; the password
comes from `TRUELOOT_DEMO_PASSWORD` (defaults to `demo-loot-2026` if
unset). Safe to re-run -- it resets both tables' audit history to a
single fresh, deterministic run each time.

## Run

```bash
# Terminal 1 — backend on :8000 (--reload so route/model edits take effect without a manual restart)
cd backend
.venv/bin/python3 -m uvicorn app.main:app --port 8000 --reload

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

54/54 should pass, across two files:
- `test_auditor.py` (24 tests) — the bug-injection self-test suite, proving the validator, simulator, and compliance diff each catch what they claim to, plus the statistical engine (Wilson CI, z-test, Bonferroni-adjusted alpha, region packs, suggested-fix algebra, pity grace period), exercising `app.schema`/`validator`/`simulate`/`compliance`/`regions` directly.
- `test_api.py` (30 tests) — drives the actual HTTP surface with FastAPI's `TestClient` against an isolated in-memory SQLite database per test: signup/login, password change, cross-user ownership isolation (user B gets a 404 touching user A's table, not their data), plan-gated limits (free tier's 1-table cap, pull-count cap, export gate, last-run-only history), the region API (listing, rejecting an unknown id, persisting the chosen one), the public demo endpoint (no auth required, rejects an unknown region, ignores a client-supplied pull count), suggested-fix data on a failing item, and the admin allowlist/plan-change flow (non-admins get 403, allowlisted emails get promoted on signup or login, plan changes actually persist).

## Build (frontend)

```bash
cd frontend
npm run build
```

## Deploy

Two pieces to host: the FastAPI backend (a normal long-running process --
not a serverless function, since it holds a SQLite connection) and the
built frontend (static files). PROJECT.md's original plan was
Vercel/Netlify for the frontend and Railway/Render/Fly.io for the
backend; either that split or a single VM both work.

**Before deploying anywhere but localhost**, set on the backend:

```bash
export LOOT_AUDITOR_JWT_SECRET="a long random value"   # required -- the code falls back to an insecure dev default otherwise
export TRUELOOT_ADMIN_EMAILS="you@yourteam.com"          # optional, grants /admin to that email on next signup/login
export TRUELOOT_DEMO_PASSWORD="something not demo-loot-2026"  # optional, only matters if you also run seed_demo.py in prod
```

### SQLite persistence -- read this before picking a host

`loot_auditor.db` is a plain file next to wherever the backend process
runs (path configurable via `LOOT_AUDITOR_DB_PATH`). That's fine on a
host with a persistent disk (a VM, a Railway/Fly volume, Render's paid
persistent-disk tier) -- it is **not** fine on anything with an ephemeral
or read-only filesystem (Vercel/Netlify functions, most serverless
platforms, and some free-tier container hosts that wipe local disk on
every redeploy or restart). On those, every signup and saved table
would vanish at the next deploy. If that's the target, either confirm
the platform's persistent-volume option is actually mounted at
`LOOT_AUDITOR_DB_PATH`, or point `db.py`'s SQLAlchemy engine at a
hosted Postgres instead (a real migration, not a config flag -- out of
scope for the hackathon build, called out here so it isn't a surprise
during a live demo).

### Option A -- split hosting (frontend and backend on different domains)

1. **Backend** (Railway, Render, Fly.io, or similar): deploy the
   `backend/` directory. Start command:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port $PORT
   ```
   (most platforms inject `$PORT`; hardcode `--port 8000` if yours
   doesn't). Set the env vars above. Note the public HTTPS URL the
   platform gives you.
2. **Frontend** (Vercel, Netlify, Cloudflare Pages): deploy `frontend/`
   with build command `npm run build`, output directory `dist`, and
   this env var set at build time:
   ```bash
   VITE_API_BASE_URL=https://your-backend-url.example.com
   ```
   Without it, the frontend assumes the backend shares its hostname on
   port 8000, which is only true for local dev or a single-host setup
   (Option B). See `frontend/.env.example`.
3. CORS is already wide open (`allow_origins=["*"]` in `main.py`) since
   auth is bearer-token, not cookie-based -- no extra CORS config needed
   for the cross-domain split.

### Option B -- single host (one VM, one Fly machine, etc.)

Simpler, no `VITE_API_BASE_URL` needed: run the backend on port 8000 on
that host, `npm run build` the frontend, and serve `frontend/dist/` from
the same hostname (a reverse proxy like Caddy or Nginx, or any static
file server) so the frontend's same-hostname-port-8000 default just
works. Keep the backend process supervised (systemd, pm2, Fly's
built-in process management) so it restarts if it crashes.

### After deploying

- Sign up through the real UI, or run `python -m app.seed_demo` against
  the production database (with `TRUELOOT_DEMO_PASSWORD` set to
  something real) to get the pre-audited buggy/fixed demo tables.
- Add your email to `TRUELOOT_ADMIN_EMAILS` and log in once to unlock
  `/admin`.

## Architecture

```
backend/
  app/
    schema.py       loot table data model (Pydantic) -- unchanged since the core-logic build
    validator.py      static config checks
    simulate.py         Monte Carlo pull simulator + pity logic
    compliance.py         advertised-vs-simulated diff (z-test, Bonferroni, Wilson CI, suggested fix)
    regions.py              per-jurisdiction rule packs (alpha / min_pp_floor / pity_grace_pulls)
    db.py                    SQLite engine/session setup + self-healing column backfill
    db_models.py               User / LootTableRecord / AuditRun (SQLAlchemy)
    auth.py                      bcrypt hashing + JWT issue/verify
    plans.py                       free/studio/enterprise limits
    main.py                          FastAPI app: auth, table CRUD, audit, history, admin
    seed_demo.py                       seeds demo@example.com with pre-audited tables
  samples/              bundled demo loot tables (clean + buggy)
  .env.example          documents LOOT_AUDITOR_JWT_SECRET / LOOT_AUDITOR_DB_PATH / TRUELOOT_ADMIN_EMAILS / TRUELOOT_DEMO_PASSWORD
  tests/
    test_auditor.py       bug-injection self-test suite + statistical engine (core logic only)
    test_api.py              HTTP-layer tests: auth, ownership isolation, plan gating, regions

frontend/
  src/
    types.ts                    TS types mirroring the backend's Pydantic/API shapes
    lib/
      api.ts                      fetch wrapper, attaches the JWT to every request
      auth.tsx                       AuthContext (login/signup/logout, current user)
      report.ts                        client-side compliance report export (CSV + printable PDF)
    components/
      ui/                                Button, Card, Badge, Input, NavItem
      AppShell.tsx                        left-nav layout for authenticated pages
      ProtectedRoute.tsx                    redirects to /login when logged out
      LootTableEditor.tsx                     GUI item/pity editor, synced with the raw JSON view
      CompareRuns.tsx                           side-by-side diff between two saved audit runs
      DriftAnalysis.tsx                           OLS trend + projected-runs-to-breach per item
      AdminRoute.tsx                              like ProtectedRoute, plus an is_admin check
      AuditResults.tsx, RateChart.tsx, PityChart.tsx
    pages/                                   one file per route (AdminPage.tsx, TableHistoryPage.tsx included)
    App.tsx                                    React Router setup
```

See "How It Works" above for what `validator.py` / `simulate.py` / `compliance.py` actually do. Core audit logic there is untouched from the original single-page build; everything added for the SaaS shape (auth, persistence, ownership, plan limits) wraps around it rather than modifying it.

## Admin / Ops

There's no self-serve payment processor (see Known Weaknesses), which means every real upgrade in this MVP is sales-assisted: a customer emails support, and someone on the team flips their plan. `/admin` is that internal tool, not a customer-facing feature.

- **Access**: set `TRUELOOT_ADMIN_EMAILS` (comma-separated) before starting the backend. Anyone with a matching email gets admin the next time they sign up *or* log in — no separate role-management UI, no migration script, just an operator editing a config value. This is the standard "before it's worth building real RBAC" pattern for an early-stage product.
- **What it shows**: every account (email, plan, saved-table count, join date), plus a small stats strip (total users, free vs. paid split, total saved tables) — the smallest useful proxy for "how's the business doing" without wiring up real billing/analytics.
- **What it does**: change any user's plan inline. The change is real and immediate (not a mock) — it goes through the same `plan` field every other plan-gated check in the app reads from.

Demo it locally:
```bash
export TRUELOOT_ADMIN_EMAILS="you@example.com"
# ...start the backend as usual, then sign up with you@example.com
```

## Demo Script

1. Land on `/` for a few seconds — this is a real product with plans, not a script.
2. Sign up, land on an empty dashboard.
3. Create a table from the `starter_chest_buggy` template. It has three bugs planted together: `advertised_rates` sums to 1.01 (rounding drift), the pity `target_rarity` is `"Legendary"` while items use `"legendary"` (a case-typo that silently breaks pity entirely), and `legendary_sword`'s weight was bumped without updating its advertised rate — so its simulated rate lands at ~1.4% against an advertised 1%.
4. Run the audit. You'll see the validation warnings, red compliance flags on `legendary_sword` and `common_sword`, and a red pity flag ("never obtained, naturally or via pity, across the whole simulation").
5. Create a second table from `starter_chest_clean` — the same config with all three bugs fixed — and run its audit. Every flag goes green, including pity (which correctly caps every simulated pull-streak at exactly 90 pulls).
6. Run `pytest tests/ -v` in a terminal to show the self-test suite proving all of this is actually verified, not just eyeballed.
7. One-line the business model: studios running gacha/loot-box economies need this check every time they patch the economy, not once — which is why it's a subscription product with saved tables and plan tiers, not a one-off script. Since there's no payment processor yet, `/admin` is how an upgrade conversation actually turns into an upgraded account today.

## Known Weaknesses

- No real payment processing — plan gating is enforced in-app but not billed; `/admin` is the manual lever a real upgrade pulls today.
- Region packs (Belgium/Netherlands/China/South Korea) give each jurisdiction its own statistical threshold and are a real, selectable input to the compliance engine now — but the specific `alpha`/`min_pp_floor` numbers per region are illustrative defaults for tuning, not a citation to each region's actual disclosure/gambling statute.
- The suggested-fix solver only proposes adjusting the flagged item's own weight — it doesn't consider fixing the advertised rate instead, or redistributing weight across multiple items at once.
- Auth is minimal (email/password only, no SSO) — fine for a hackathon demo, not enterprise-ready as-is.
- Admin access is an env-configured email allowlist with no UI to grant/revoke it and no audit log of who changed which user's plan when — fine for a small internal team, not how you'd run this once the team doesn't fully trust each other.
- PDF export opens a print-formatted page and relies on the browser's own "Save as PDF" print destination rather than generating a PDF server-side — works everywhere without a new dependency, but isn't a one-click file.
- No side-by-side diff between two different *tables* (only between two audit *runs* of the same table) — editing a table in place and re-running is the supported way to see whether a fix worked.
- Realistic path to market is likely as a compliance module inside a larger live-ops/analytics platform rather than a standalone company at scale — still a legitimate standalone SaaS at small scale (indie/mid studios), which is the story worth telling to judges.
- SQLite is a plain file, which breaks on hosts with an ephemeral or read-only filesystem (most serverless platforms) — fine for a VM or a host with a real persistent volume, not fine for e.g. a Vercel function. See the Deploy section.
