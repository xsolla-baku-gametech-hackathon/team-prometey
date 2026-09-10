# Loot Table Balance Auditor

A SaaS tool that validates whether a game's randomized reward system (loot boxes, gacha pulls, card packs) actually behaves the way it's advertised to players. Users sign up, manage loot tables under their account, run static validation + Monte Carlo simulation against them, and get compliance flags showing whether the advertised drop rate matches the real simulated rate — including whether pity timers actually trigger correctly.

Built for a 12-hour hackathon (gametech theme, Xsolla Baku GameTech Hackathon). Scoped as a real multi-user product, not a single-page demo tool.

---

## 1. Problem

Studios hand-maintain loot table configs (item weights, rarity tiers, pity-timer rules) across live-service and gacha games. Common silent bugs: weights that don't sum correctly, unreachable items, pity timers that never trigger or trigger at the wrong pull, and advertised rates that quietly drift from the real simulated rate. Several jurisdictions (Belgium, Netherlands, China, South Korea) have real gambling-law or disclosure-law consequences when a game's actual odds don't match what's published — see prior research notes for sourced cases (EA/Belgium, EA/Netherlands €10M fine later reversed, China/Korea disclosure mandates).

## 2. Product Shape

This is not a single utility page — it's a small SaaS with accounts, saved projects, and tiered plans, matching how a studio would actually adopt and pay for a compliance tool.

### Core user flow
```
Sign up / log in
  → Dashboard (list of saved loot tables / projects)
  → Create or upload a loot table
  → Run audit (validation + simulation)
  → View results (flags, charts, compliance report)
  → Save / re-run / compare versions
  → (Billing page shows current plan + upgrade path)
```

### Pages / routes (MVP)

| Route | Purpose |
|---|---|
| `/login`, `/signup` | Auth |
| `/dashboard` | List of user's saved loot tables, "New Audit" CTA, plan/usage summary |
| `/tables/new` | Create/upload a loot table (paste JSON or use a starter template) |
| `/tables/:id` | Table detail: run audit, view validation results, simulation charts, compliance flags |
| `/tables/:id/history` | Past audit runs for this table (simple version list — stretch if time-tight) |
| `/pricing` | Plan comparison (see below), upgrade CTA |
| `/settings` | Account info, current plan, API usage if relevant |

Keep routing flat and simple — this is React Router or Next.js App Router, not a complex nested app shell.

## 3. Auth

- Email + password is enough for the MVP (bcrypt/argon2 hash, JWT or session cookie). Do not build OAuth/social login unless there's spare time — it's a P2 at best.
- Protect all `/dashboard`, `/tables/*`, `/settings` routes; redirect unauthenticated users to `/login`.
- Store nothing sensitive in the JWT beyond user id/email/plan tier.
- This needs a real database now (previous single-page version didn't). See Data Model below.

## 4. Pricing / Plans (3 tiers)

Display these on `/pricing` and gate features accordingly. Keep the gating logic simple (a `plan` field on the user, checked in the API).

| | **Free** | **Studio** | **Enterprise** |
|---|---|---|---|
| Price | $0 | $49/mo | Custom / "Contact us" |
| Saved loot tables | 1 | 10 | Unlimited |
| Simulation size | 100k pulls | 1M pulls | 1M+ pulls |
| Compliance report export | — | ✅ PDF/CSV | ✅ + multi-region rule packs |
| Audit history per table | Last run only | Full history | Full history |
| Support | Community | Email | Priority / dedicated |

Implementation note: for the hackathon, plan enforcement can be a simple check (`if user.plan == 'free' and table_count >= 1: block`) — don't build real payment processing (Stripe integration) unless there's genuine spare time; a "Contact sales" / disabled "Upgrade" button that doesn't actually charge anyone is fine for demo purposes. Be upfront about this simplification if asked by judges.

## 5. Data Model (new — required for multi-user/SaaS)

```
User
 - id, email, password_hash, plan ("free" | "studio" | "enterprise"), created_at

LootTable
 - id, user_id (FK), name, config_json, advertised_rates_json, created_at, updated_at

AuditRun
 - id, loot_table_id (FK), simulated_rates_json, validation_flags_json,
   compliance_flags_json, pity_convergence_json, pull_count, created_at
```

SQLite is fine for a hackathon demo; use Postgres only if the team is already comfortable with it and deploying to something like Railway/Render/Supabase. Don't burn build time on migrations tooling — a simple schema file + `CREATE TABLE` on startup is enough.

## 6. Loot Table Schema (unchanged from core logic)

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

## 7. Core Audit Logic (unchanged)

1. **Static validator** — weights sum correctly, no unreachable items, no duplicate IDs, valid nested references.
2. **Monte Carlo simulator** (numpy) — run N pulls per plan tier's limit, track observed frequency per item/rarity, track pity-timer trigger distribution.
3. **Compliance diff** — simulated rate vs. `advertised_rates`, flag red/yellow/green against a tolerance threshold.
4. **Bug-injection self-test suite** — mutate a known-good table (break weight sum, break pity logic, mismatch advertised rate) and assert the auditor catches each one. Build and pass this before wiring up the API — it proves the core logic is correct in isolation and doubles as a demo asset.

## 8. Tech Stack

**Backend**
- Python + FastAPI, or Node + Express — pick whichever the team is faster in. FastAPI is a good default given the Python simulation core (numpy).
- SQLite (or Postgres if already comfortable) for Users / LootTables / AuditRuns.
- JWT-based auth middleware protecting non-public routes.
- Endpoints: `POST /auth/signup`, `POST /auth/login`, `GET /tables`, `POST /tables`, `GET /tables/:id`, `POST /tables/:id/audit`, `GET /tables/:id/history`, `GET /user/me`.

**Frontend**
- React (Vite) or Next.js — Next.js is a reasonable choice here since it gives you routing, layouts, and easy deployment (Vercel) for free, which matters for a multi-page SaaS on a tight clock.
- Recharts or Chart.js for the rate-comparison and pity-convergence charts.
- Design system: see Section 9 (Apple-style direction) — implement as a small shared set of Tailwind config tokens + reusable components (Button, Card, Input, Badge) rather than styling every page ad hoc.

**Dev/deploy**
- Frontend → Vercel. Backend → Railway/Render/Fly.io. Fallback: run both locally via `localhost` for the demo if deployment eats time.

## 9. Design Direction — Apple-Style

Aim for the calm, restrained, content-first look associated with Apple's product and marketing pages (apple.com, App Store, macOS System Settings) — not skeuomorphism, just their current flat/spacious aesthetic. Concretely:

**Visual language**
- **Generous whitespace.** Let content breathe; avoid cramming. Increase padding/margins beyond what feels natural at first.
- **Neutral base palette** — whites, light greys (`#F5F5F7`-style background, a common Apple marketing-page grey), near-black text (`#1D1D1F`, not pure `#000`). One confident accent color used sparingly (a single blue or the product's own signal colors — reserve red/yellow/green strictly for compliance flags, not general UI).
- **Typography-led hierarchy.** Large, light-to-medium weight headlines (system font stack — `-apple-system, "SF Pro Display", "Inter", sans-serif` as a practical substitute), clear size jumps between heading levels, generous line-height on body text. Avoid heavy bold everywhere; let size and spacing carry hierarchy instead of weight.
- **Rounded corners, soft depth.** Cards with large border-radius (12–20px), subtle shadows (low-opacity, large blur, no hard drop shadows), no harsh borders.
- **Restraint over decoration.** No gradients-as-decoration, no drop-heavy icon sets, no busy backgrounds. Icons should be simple/line-based (Lucide/SF Symbols-style) and monochrome by default, colored only when meaningful (e.g. status).
- **Motion, if time allows.** Subtle fade/scale transitions on state changes (chart appearing, flag resolving) — smooth and short (150–250ms ease), never bouncy or attention-seeking.

**Structural patterns to borrow**
- Marketing-style landing/pricing page: big centered headline, short subhead, clear single primary CTA, plan cards side by side with the recommended plan subtly emphasized (not with a loud banner — a slightly elevated card and a small "Recommended" label is enough).
- Settings-page pattern: left-hand nav list + right-hand content panel, like macOS System Settings — clean if `/settings` has multiple sections.
- Dashboard: card-grid of saved loot tables, minimal metadata per card (name, last audit status as a small colored dot, last updated), not dense tables.

**Practical implementation note**
- Use Tailwind CSS with a small custom token set (background greys, one accent, radius scale, shadow scale) rather than default Tailwind utility soup — consistency matters more than variety here.
- Don't spend hours hand-crafting bespoke illustrations; the "Apple feel" mostly comes from spacing, type, and restraint, not custom art. Time is better spent making the four or five shared components (Button, Card, Badge, Input, NavItem) consistently right than decorating every page differently.

## 10. Build Order (suggested, ~12h)

1. **Core logic first, headless.** Schema, `validator.py`, `simulate.py`, compliance diff, and the bug-injection self-test suite — proven correct via pytest before anything else is built. (2–2.5h)
2. **Backend scaffolding.** DB schema (User/LootTable/AuditRun), auth endpoints (signup/login/JWT), CRUD for loot tables, `/audit` endpoint wired to the core logic. (2–2.5h)
3. **Frontend shell.** Routing, auth pages, protected-route wrapper, shared design components (Button/Card/Badge/Input) per Section 9. (1.5h)
4. **Dashboard + table detail + audit results view**, wired to the backend, including charts. (2.5–3h)
5. **Pricing page + plan gating** (simple checks, no real payments). (1h)
6. **Polish pass**: loading states, error states, empty states, consistent spacing/type per the design direction, compliance-report export if time allows. (1h)
7. **Deploy** (Vercel + Railway/Render), or finalize a clean localhost demo path if deployment risks eating remaining time. (0.5–1h)
8. **Rehearse demo end-to-end**, including the self-test suite running live in terminal as a credibility beat.

### If time runs out, cut in this order (last cut first)
Multi-region compliance rule packs → audit history page → real payments → email/social auth → animations/motion polish → anything past P1.

## 11. Demo Script

1. Land on `/pricing` or the landing page for 5 seconds — "here's the product, here are the plans" (shows this is a real SaaS, not a script).
2. Log in to a pre-seeded demo account with a saved "buggy" loot table already on the dashboard.
3. Open it, run the audit — show red compliance flags: weight sum error, broken pity timer, simulated legendary rate diverging from the advertised 1%.
4. Switch to a "fixed" version (either a second saved table or edit in place) — flags go green, simulated rate converges within tolerance.
5. Briefly show the self-test suite passing live in terminal — "we proved this catches real planted bugs, not just displays numbers."
6. One-line the regulatory hook and the business model: "Studios running gacha or loot-box economies need to prove their odds are accurate — this is exactly the kind of audit that stands between a compliance pass and a fine in markets like Belgium or China. It's also why this is a subscription product, not a one-off script — studios patch these economies constantly and need this check every time."

## 12. Known Weaknesses (be upfront if asked)

- No real payment processing in the MVP — plan gating is enforced in-app but not billed.
- Regulatory rule packs are not region-specific — tolerance threshold is a single configurable number, not per-jurisdiction law, in the free/studio tiers.
- Auth is minimal (email/password only, no SSO) — acceptable for a hackathon demo, not enterprise-ready as-is.
- Realistic path to market is likely as a compliance module inside a larger live-ops/analytics platform rather than a standalone company at scale — still a legitimate standalone SaaS at small scale (indie/mid studios), which is the story worth telling to judges.