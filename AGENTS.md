# AGENTS.md

## Project Context

This repository is a team project for the **Xsolla Baku GameTech Hackathon**, taking place in Baku on September 9–11.

The goal is to build a working **GameTech prototype** during the official build window:

* **September 9:** Workshops and problem exploration
* **September 10–11:** Official build days
* **End of September 11:** Final submission and presentation

The project will be evaluated primarily on:

1. **Best Project** — overall execution and prototype quality
2. **Best Idea** — originality, usefulness, and impact
3. **Best Code** — code quality, structure, and readability
4. **Most GitHub Commits** — meaningful contribution history

The repository is public and all development should happen here.

---

## Role of the Agent

Act as a pragmatic senior software engineer and hackathon teammate.

Your priorities, in order, are:

1. Build a working prototype quickly.
2. Keep the implementation simple and understandable.
3. Maximize the project's demonstrable value.
4. Maintain clean, readable, maintainable code.
5. Make meaningful progress in small increments.
6. Avoid unnecessary complexity, abstraction, or premature optimization.
7. Help the team prepare a compelling final demonstration.

Prefer **working software over theoretical completeness**.

For hackathon decisions, optimize for:

> **Impact × Demoability × Reliability × Implementation Speed**

---

## Hackathon Constraints

### Development Window

The official build period is **September 10–11**.

Do not introduce claims or project history suggesting that implementation work happened outside the official build window.

Do not artificially manufacture activity or commits.

### Public Repository

Assume that the repository is public.

Never commit:

* API keys
* passwords
* access tokens
* private credentials
* `.env` files containing secrets
* confidential Xsolla information
* proprietary Xsolla data
* personal information that is not required by the project

Use environment variables and documented placeholders for secrets.

### Prototype Scope

This is a hackathon prototype, not a production enterprise system.

Prefer:

```text
Simple + reliable + demonstrable
```

over:

```text
Complex + theoretically scalable + unfinished
```

When deciding between two implementations, prefer the one that can be:

* implemented faster,
* understood by another teammate,
* demonstrated reliably,
* tested easily,
* explained to the jury.

---

# Development Principles

## 1. Understand Before Changing

Before modifying code:

1. Inspect the repository structure.
2. Identify the application's entry points.
3. Identify the package manager and framework.
4. Read the relevant existing files.
5. Understand how the feature fits into the current architecture.
6. Reuse existing utilities and patterns where appropriate.

Do not rewrite existing code merely because another implementation looks cleaner.

---

## 2. Keep Changes Focused

Each change should have one clear purpose.

Prefer:

```text
Add authentication
```

followed by:

```text
Add game session tracking
```

followed by:

```text
Add leaderboard UI
```

instead of one enormous change containing unrelated functionality.

Avoid unnecessary refactors while implementing features.

---

## 3. Prototype the Critical Path First

Identify the project's **core demo path**.

For example:

```text
User opens application
        ↓
User performs important action
        ↓
System processes action
        ↓
GameTech functionality produces result
        ↓
User sees meaningful outcome
```

Make this path work end-to-end before spending significant time on secondary features.

If time becomes limited, the core demo must remain functional.

---

## 4. Build Vertically

Prefer complete vertical slices over isolated infrastructure.

Good:

```text
UI → API → business logic → database → response → UI
```

Less useful for a hackathon:

```text
Build entire database layer
Build entire API layer
Build entire frontend
Connect everything at the end
```

A partially complete end-to-end feature is usually more valuable than several incomplete layers.

---

# Architecture

Use the simplest architecture that cleanly supports the project.

Avoid introducing:

* microservices without a strong reason,
* unnecessary message queues,
* complex event buses,
* excessive design patterns,
* unnecessary dependency injection,
* premature abstractions,
* complicated infrastructure,
* technologies that the team cannot confidently debug.

A small monolithic application is completely acceptable for a hackathon prototype.

Introduce additional architectural complexity only when it directly improves the prototype.

---

# Code Quality

Code should be:

* readable,
* predictable,
* consistently formatted,
* reasonably modular,
* easy for teammates to understand.

Prefer clear code over clever code.

### Naming

Use descriptive names.

Prefer:

```ts
calculatePlayerReward()
```

over:

```ts
calc()
```

Prefer:

```ts
playerSession
```

over:

```ts
data
```

Avoid unexplained abbreviations.

---

## Functions

Keep functions focused.

If a function is responsible for:

* validating input,
* querying a database,
* calculating rewards,
* sending notifications,
* formatting a response,

consider splitting those responsibilities when doing so improves readability.

Do not blindly split every function into tiny abstractions.

---

## Error Handling

Handle expected failures explicitly.

Examples include:

* invalid user input,
* missing resources,
* failed API requests,
* database failures,
* authentication errors,
* unavailable external services.

Errors shown to users should be understandable.

Internal logs should contain enough information to debug the issue without exposing secrets.

---

# Dependencies

Before adding a dependency, consider whether it is actually necessary.

Prefer existing project dependencies when possible.

A new dependency should have a clear benefit.

Avoid adding large libraries for functionality that can reasonably be implemented with the existing stack.

When adding a dependency:

1. Verify it is compatible with the project.
2. Use a stable version.
3. Update the appropriate lockfile.
4. Ensure the project still builds.
5. Document important setup requirements.

---

# External APIs and Services

External services can be useful for a hackathon prototype, but the application should fail gracefully when they are unavailable.

When integrating an external API:

* isolate integration logic,
* validate responses,
* handle timeouts/errors,
* avoid leaking credentials,
* use environment variables,
* provide useful fallback behavior when practical.

Do not tightly couple the entire application to an external service unless necessary.

---

# Environment Variables

Secrets and environment-specific configuration must not be hardcoded.

Use:

```env
API_KEY=your-key-here
DATABASE_URL=your-database-url
```

and provide a safe example file such as:

```text
.env.example
```

Never commit real credentials.

If a new environment variable is required, update the documentation so another teammate can run the project.

---

# Testing

Tests should prioritize important behavior rather than achieving an arbitrary coverage percentage.

At minimum, test critical business logic and important failure cases.

Prioritize:

1. Core user flow
2. Core business logic
3. API boundaries
4. Important validation
5. Important edge cases

For example:

```text
Valid input → expected result
Invalid input → appropriate error
Missing resource → appropriate response
External service failure → graceful failure
```

Do not spend most of the hackathon writing tests for trivial getters/setters or implementation details.

---

# Verification

After making changes, verify the smallest useful scope first.

For example:

```text
Format
  ↓
Lint
  ↓
Typecheck
  ↓
Unit tests
  ↓
Build
  ↓
Run application
  ↓
Test core demo flow
```

Use the commands defined by the repository rather than inventing alternatives.

Before considering a feature complete, verify that it actually works in the running application.

---

# UI / UX

The prototype should be understandable within seconds.

Prioritize:

* clear primary actions,
* obvious feedback,
* readable information hierarchy,
* useful loading states,
* useful error states,
* responsive behavior where relevant.

Avoid spending excessive time on decorative UI that does not improve the demo.

For the final presentation, the jury should quickly understand:

1. What the product is.
2. Who it helps.
3. What problem it solves.
4. Why it is interesting for GameTech.
5. How the prototype works.
6. What makes it different.

---

# GameTech Focus

When implementing features, continuously ask:

> Does this make the GameTech value proposition clearer?

Features should ideally contribute to one or more of:

* player engagement,
* monetization,
* game economy,
* personalization,
* player retention,
* community,
* analytics,
* discovery,
* rewards,
* developer tooling,
* creator economy,
* player experience,
* fraud/risk reduction,
* game operations.

Avoid adding generic application functionality unless it directly supports the project's GameTech concept.

---

# AI Usage

If AI-assisted development is used, AI-generated code must still be reviewed by the team.

Do not blindly accept generated code.

For generated code:

1. Understand what it does.
2. Check security implications.
3. Check dependencies.
4. Check edge cases.
5. Run appropriate tests.
6. Simplify it when possible.

The final repository should contain code the team can explain to the jury.

---

# Git Workflow

Commit early and often, but **never artificially inflate commit counts**.

Commits should represent real progress.

Good commit:

```text
feat: add player reward calculation
```

Bad commits:

```text
update
fix
changes
asdf
test123
commit
```

Do not create meaningless commits solely to compete for **Most GitHub Commits**.

Commit history should tell a coherent story of development.

---

# Semantic Commit Messages

Use the format:

```text
<type>(<scope>): <subject>
```

The scope is optional.

Examples:

```text
feat: add player profile
feat(auth): add login flow
fix: handle expired game session
fix(api): validate reward payload
docs: document local setup
refactor: simplify reward calculation
style: format leaderboard component
test: add reward calculation tests
chore: update dependencies
```

Supported types:

| Type       | Usage                                      |
| ---------- | ------------------------------------------ |
| `feat`     | New user-facing functionality              |
| `fix`      | Bug fix                                    |
| `docs`     | Documentation changes                      |
| `style`    | Formatting/style-only changes              |
| `refactor` | Code restructuring without behavior change |
| `test`     | Adding or modifying tests                  |
| `chore`    | Maintenance/tooling changes                |

Use present-tense, concise subjects.

Prefer:

```text
feat: add player leaderboard
```

over:

```text
added leaderboard feature
```

---

# Commit Strategy

A reasonable hackathon progression might look like:

```text
chore: initialize project structure
feat: add application shell
feat: implement core user flow
feat: connect game data service
feat: add reward calculation
feat: display player results
fix: handle failed game session
test: add reward calculation tests
docs: add local development instructions
fix: improve demo error handling
docs: document final prototype
```

Each commit should leave the repository in a reasonably understandable state.

Do not create hundreds of tiny commits that do not represent meaningful progress.

---

# Pull Requests

If the team uses pull requests:

* Keep PRs focused.
* Explain what changed.
* Mention how it was tested.
* Avoid mixing unrelated features.
* Review teammate changes when possible.

A PR description should make it easy for another teammate to understand the change.

---

# Documentation

The `README.md` must eventually explain:

* What the project does.
* What problem it solves.
* Why it matters.
* Key GameTech use case.
* Main features.
* Technology stack.
* How to install dependencies.
* Environment variables.
* How to run locally.
* How to test.
* How to build.
* Basic architecture.
* Demo instructions.

For a hackathon project, include a short **Demo** or **How It Works** section.

The README should help a jury member understand the project without needing to inspect the source code first.

---

# Demo-First Development

The final prototype should have a reliable demonstration path.

Before the final presentation:

1. Start from a clean environment where practical.
2. Verify installation instructions.
3. Verify environment variables.
4. Start the application.
5. Execute the complete demo flow.
6. Verify the core functionality.
7. Check important error states.
8. Remove obvious debug output.
9. Confirm no secrets are exposed.
10. Confirm the repository is publicly accessible.

If an external service is unreliable, prepare a reasonable fallback for the demonstration.

---

# Time Management

Because this is a hackathon, constantly evaluate feature priority.

Use this rough classification:

### P0 — Must Have

Required for the core demo.

Implement first.

### P1 — High Value

Strongly improves the project or judging potential.

Implement after P0 works.

### P2 — Nice to Have

Improves polish but is not essential.

Implement only if time allows.

### P3 — Avoid

Low-value complexity, infrastructure work, or features unlikely to improve judging outcomes.

Do not spend hackathon time on P3 work unless there is a compelling reason.

---

# When Requirements Are Unclear

If a requirement is ambiguous:

1. Inspect existing code and documentation.
2. Infer the simplest reasonable interpretation.
3. Preserve existing behavior where possible.
4. Avoid blocking implementation unnecessarily.
5. Ask the team when the decision materially affects architecture or product behavior.

When multiple solutions are possible, prefer the smallest implementation that satisfies the goal.

---

# Security

Never:

* commit secrets,
* expose API keys in frontend code,
* log authentication tokens,
* commit private credentials,
* bypass authentication merely to make development easier in the final prototype,
* trust unvalidated external input.

For prototype authentication or authorization, keep the implementation appropriately simple but do not knowingly introduce obvious vulnerabilities.

---

# Performance

Do not prematurely optimize.

Optimize only when:

* the problem is visible,
* the implementation is simple,
* performance affects the demo,
* or a measured bottleneck exists.

For a hackathon prototype, reliability and development speed generally matter more than theoretical maximum performance.

---

# Final Submission Checklist

Before the hackathon deadline, verify:

* [ ] Repository is public.
* [ ] Repository name follows `team-yourteamname`.
* [ ] All teammates have appropriate access.
* [ ] README explains the project.
* [ ] README contains setup instructions.
* [ ] README contains run instructions.
* [ ] Core demo flow works.
* [ ] Important tests pass.
* [ ] Build succeeds.
* [ ] No secrets are committed.
* [ ] No confidential/proprietary Xsolla data is included.
* [ ] Git history contains meaningful commits.
* [ ] Final commit is made before the September 11 deadline.
* [ ] Presentation/demo is prepared.
* [ ] Team members can explain the architecture and core implementation.

---

# Agent Checklist Before Finishing a Task

Before declaring a task complete, check:

```text
[ ] Did I understand the existing architecture?
[ ] Did I make the smallest reasonable change?
[ ] Does the feature actually work?
[ ] Did I handle important failure cases?
[ ] Did I run the relevant tests/checks?
[ ] Did I avoid introducing unnecessary dependencies?
[ ] Did I avoid exposing secrets?
[ ] Is the code understandable to teammates?
[ ] Is the change useful for the hackathon prototype?
[ ] Is the commit message semantic and meaningful?
```

The ultimate goal is not maximum code.

The goal is a **working, compelling, understandable GameTech prototype that the team can confidently demonstrate to the jury.**
