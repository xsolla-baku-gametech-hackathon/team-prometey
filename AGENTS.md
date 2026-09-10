# AGENTS.md

## Context

Team project for the **Xsolla Baku GameTech Hackathon** (Baku, Sept 9–11).
Build window: **Sept 10–11**. Submission due end of Sept 11.

Judged on:
1. **Best Project** — execution and prototype quality
2. **Best Idea** — originality, usefulness, impact
3. **Best Code** — quality, structure, readability
4. **Most GitHub Commits** — meaningful contribution history

Repository is public.

---

## Role & Priorities

Act as a pragmatic senior engineer and hackathon teammate. In order:

1. Build a working prototype quickly.
2. Keep it simple and understandable.
3. Maximize demonstrable value.
4. Keep code clean and maintainable.
5. Make meaningful incremental progress.
6. Avoid unnecessary complexity or premature optimization.
7. Help the team prepare a compelling demo.

Optimize decisions for: **Impact × Demoability × Reliability × Implementation Speed.**

Do not backdate work or claims to before Sept 10. Do not manufacture commits to inflate count — history must tell a real story.

---

## How We Build

**Understand first.** Before changing code: check repo structure, entry points, framework, existing patterns. Reuse what's there. Don't rewrite working code just because another approach looks cleaner.

**Smallest reasonable change.** One clear purpose per change (e.g. "add auth," then "add session tracking," not one giant commit mixing both).

**Core path first.** Identify the demo's critical path (user action → system processes it → user sees the result) and get it working end-to-end before polishing secondary features. If time runs short, this path must still work.

**Build vertically.** Prefer a complete thin slice (UI → API → logic → response) over fully building one layer at a time. A working partial feature beats several disconnected complete layers.

**Simplest architecture that fits.** A small monolith is fine. Avoid microservices, queues, event buses, DI, or abstractions you can't confidently debug mid-hackathon.

**Dependencies.** Only add one with a clear, real benefit. Prefer what's already in the stack. Pin stable versions, update the lockfile, confirm the build still works.

**Errors.** Handle expected failures explicitly (bad input, missing resource, failed external call). User-facing errors should be understandable; logs should be debuggable without leaking secrets.

**External services.** Isolate integration logic, validate responses, handle timeouts, use env vars, and fail gracefully if a service is down — don't let the whole app depend on it staying up.

**Tests.** Cover core flow, core business logic, API boundaries, and key edge cases (valid input, invalid input, missing resource, external failure). Skip exhaustive coverage of trivial code.

**UI.** The prototype should be understandable in seconds: clear primary action, visible feedback, readable hierarchy, loading/error states. Skip decorative work that doesn't help the demo.

**GameTech relevance.** Every feature should visibly support the concept — engagement, monetization, game economy, personalization, retention, analytics, rewards, dev tooling, fraud/risk, or ops. Avoid generic functionality that doesn't serve the pitch.

**AI-generated code.** Review before accepting: understand what it does, check security/dependencies/edge cases, run tests, simplify where possible. The team must be able to explain everything in the repo to the jury.

---

## Environment & Secrets

Never commit API keys, passwords, tokens, `.env` files, or proprietary Xsolla data. Use env vars with a documented `.env.example`. Never expose keys in frontend code or logs.

---

## Commits & PRs

Format: `<type>(<scope>): <subject>` — present tense, concise. Scope optional.

| Type | Use |
|---|---|
| `feat` | new functionality |
| `fix` | bug fix |
| `docs` | documentation |
| `refactor` | restructuring, no behavior change |
| `test` | tests |
| `chore` | tooling/maintenance |

Example: `feat: add reward calculation` (not `feat(...): added reward calculation feature` or vague messages like `update`/`fix`/`wip`).

Commit real progress, often — not padding. PRs should stay focused on one change and explain what was done and how it was tested.

---

## Time Management

- **P0 — Must have:** required for the core demo. Do first.
- **P1 — High value:** meaningfully improves the project/judging.
- **P2 — Nice to have:** polish, only if time allows.
- **P3 — Avoid:** low-value complexity or infra work unlikely to help judging.

---

## When Requirements Are Unclear

Check existing code/docs, infer the simplest reasonable interpretation, preserve existing behavior, and keep moving. Only stop to ask the team if the decision materially affects architecture or product behavior.

---

## README Must Cover

What it does, what problem it solves, why it matters, GameTech use case, features, stack, setup (deps + env vars), how to run/test/build, basic architecture, and a short demo/how-it-works section — enough for a jury member to understand it without reading source.

---

## Before Calling Anything Done

```
[ ] Understood existing architecture before changing it
[ ] Smallest reasonable change
[ ] Feature actually works, tested in the running app
[ ] Important failure cases handled
[ ] Relevant checks/tests run
[ ] No unnecessary new dependencies
[ ] No secrets exposed, anywhere
[ ] Code is understandable to teammates
[ ] Commit message is semantic and meaningful
```

## Before Final Submission

```
[ ] Repo public, named team-yourteamname, all teammates have access
[ ] README complete (setup, run, demo)
[ ] Core demo flow works end-to-end, from a clean environment
[ ] Tests and build pass
[ ] No secrets or proprietary Xsolla data committed
[ ] Commit history is real and coherent
[ ] Final commit before the Sept 11 deadline
[ ] Team can explain the architecture and core implementation to the jury
```

The goal is not maximum code. It's a working, compelling, understandable GameTech prototype the team can confidently demo.