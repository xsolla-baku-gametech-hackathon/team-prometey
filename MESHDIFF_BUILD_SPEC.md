# MeshDiff — Full Product & Technical Specification

**Purpose of this document:** This is a build spec for a coding agent (e.g. Claude Code) to implement the product end-to-end. It describes what the app is, what it must do, how its parts fit together, and the technology choices. No code is included — the agent should design and write the implementation from this description.

---

## 1. What This App Is

MeshDiff is a self-hosted web application that lets 3D artists and game studios **see what changed between two versions of a 3D asset** (`.glb`/`.gltf` files, extensible to `.fbx`/`.obj` later) — the same way developers use `git diff` for code, but for 3D models.

Today, 3D files are binary blobs. Git can't show what changed inside them, so teams either lose track of changes entirely or resort to expensive lock-based version control tools (Perforce, Plastic SCM) that don't integrate naturally with modern Git-based workflows. MeshDiff solves the "what changed" problem without requiring teams to change their existing version control system.

The core value the app delivers, every time a user compares two versions of a model:
1. A **human-readable summary** of what changed in materials, object hierarchy, and transforms (position/rotation/scale).
2. A **visual 3D diff** rendered in the browser, showing which vertices moved, were added, or were removed, color-coded.
3. A clear statement of what it *cannot* determine precisely (e.g., when topology changes make vertex-to-vertex comparison ambiguous), rather than silently giving a wrong answer.

The app is licensed software distributed as a self-hosted deployment: customers run it on their own infrastructure, activate it with a license file, and their 3D assets never leave their servers.

---

## 2. Who Uses It & Core User Journeys

**Primary user:** A technical artist, art lead, or tools engineer at a game studio (indie to mid-size).

**Journey 1 — First activation**
Studio deploys the app on their own server. They receive a license file from the vendor and place it in a config location. On first load, the app verifies the license and either unlocks normally or shows a clear, specific reason it's blocked (expired, invalid signature, seat limit exceeded).

**Journey 2 — Comparing two versions of one asset**
User uploads (or the app pulls from a connected Git repo, in a later phase) two versions of the same `.glb` file. The app processes both, shows:
- A changelog-style panel: which materials changed (old value → new value), which nodes were added/removed/moved, whether geometry changed.
- A 3D viewer panel with both versions loadable, and a diff mode that colors vertices by whether they changed, were added, or were removed.

**Journey 3 — Reviewing project history**
User sees a list of previously uploaded/compared asset versions for a project, can revisit any past diff without recomputing it (diffs are cached/stored once computed).

**Journey 4 — Team usage (Pro/Enterprise tier)**
Multiple users log in under one studio account (seat-limited by license), see a shared project list, and can leave comments on a specific diff (future phase, mentioned here so the data model can anticipate it).

---

## 3. Functional Requirements

### 3.1 Asset ingestion
- Accept `.glb` and `.gltf` file uploads through the web UI.
- Validate the file is well-formed before processing; reject with a clear error otherwise.
- Store the original file plus its extracted representation (see 3.2) in project-scoped storage.

### 3.2 Extraction ("split") step
For each uploaded asset, extract into a structured, storable representation:
- **Materials**: name, base color, metallic/roughness factors, and any other PBR properties present.
- **Node hierarchy**: node names, parent/child relationships, per-node transform (translation, rotation, scale).
- **Geometry reference**: rather than converting raw vertex data to text, compute and store a content hash per mesh, plus the raw vertex/index buffers themselves (kept binary) for later numeric comparison. Do not attempt to text-serialize full vertex data — this was evaluated and rejected for performance and size reasons.
- Persist this extracted representation so it doesn't need to be recomputed on every view.

### 3.3 Diff computation
Given two extracted representations of what the user identifies as "the same asset, two versions":
- **Materials diff**: match by material name; report added, removed, and changed (with old→new values) materials.
- **Hierarchy/transform diff**: match nodes by name (documented limitation: renamed nodes will show as remove+add rather than a rename — acceptable for v1, flagged for a future persistent-ID approach).
- **Geometry diff**:
  - If vertex count matches between versions, compute per-vertex displacement distance directly (index-aligned comparison).
  - If vertex count differs (topology changed — extrusion, retopology, etc.), fall back to nearest-neighbor matching (closest point in 3D space) to approximate correspondence, and clearly label this diff as "approximate" in the UI, since index-based comparison is invalid here.
  - Flag vertices as changed if their displacement exceeds a small configurable epsilon (to avoid floating-point noise showing as false changes).
- Store the computed diff result so revisiting it doesn't require recomputation.

### 3.4 Visualization
- Render both versions of a model in-browser using WebGL.
- Diff mode: render the newer version with per-vertex coloring — unchanged vertices in one color, changed vertices in another, added geometry visually distinguished from moved geometry.
- Provide basic camera controls (orbit, zoom) so the user can inspect the model from any angle.
- Display the numeric diff summary (e.g., "X of Y vertices changed, Z%") alongside the visual view.

### 3.5 Project & version organization
- Users can group asset uploads into named projects.
- Within a project, uploaded versions are listed chronologically; the user selects any two to diff.
- Each project stores metadata: name, created date, list of asset versions with their upload date and uploader (once multi-user is enabled).

### 3.6 Licensing gate
- On startup, and periodically at a fixed interval while running, the app verifies its license file against an embedded public key.
- If the license is missing, invalid, tampered with, or expired, the app must not silently fail — it should run in a clearly "locked" state, showing the specific reason, while still allowing an admin to see status/diagnostic information (not asset data).
- The license defines: customer name, seat count, feature flags (which parts of the app are enabled), and expiry date. The app must gate functionality according to the feature flags present (e.g., visual diff might be a Pro-only feature while text diff is available at all tiers).
- Enforce seat count by tracking active user sessions/accounts against the licensed limit once multi-user support exists; for single-user v1, this can be a soft check.

### 3.7 Multi-tenancy consideration (design for later, don't build yet)
Even in v1 (effectively single-studio, single-deployment), design the data model so that a `studio`/`tenant` concept and `user` concept exist as first-class entities from the start, even if v1 only ever has one studio and one implicit user. This avoids a painful migration when team accounts are added later.

---

## 4. Non-Functional Requirements

- **Data locality**: No asset data, project data, or diff results should ever be transmitted outside the customer's own deployment. The only external communication the product should ever need is the one-time (or periodic renewal) transfer of the license file itself, which is handled out-of-band by the vendor, not by the running app.
- **Offline capability**: The app must fully function with no internet access, including license verification (signature check is local, using the embedded public key — no phone-home required).
- **Performance**: Diff computation for a typical game asset (under ~100k vertices) should complete within a few seconds; larger assets should show a progress indicator rather than blocking the UI.
- **Clear failure states**: Every failure mode (bad file, license invalid, topology mismatch in diff, storage full) should produce a specific, actionable message — never a silent failure or generic error.
- **Deployability**: A studio's infrastructure team should be able to deploy the app with minimal steps (a small number of commands), without needing deep familiarity with the app's internals.
- **Upgradability**: New versions of the app should be deployable without losing existing project/asset/diff data.

---

## 5. Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| Backend/API | Python, FastAPI | Async-capable, fast to develop, strong ecosystem for the 3D file parsing already needed |
| 3D file parsing | pygltflib (glTF/GLB), trimesh (format conversion/validation) | Mature, handles the binary/JSON split natively |
| Frontend | Server-rendered templates or a lightweight JS frontend + Three.js for the 3D viewer | Three.js is the standard for in-browser WebGL rendering; keep the frontend framework choice minimal for v1 to reduce build complexity |
| Database | SQLite by default; PostgreSQL as a configurable alternative | SQLite needs zero extra infrastructure for small self-hosted deployments; Postgres as an upgrade path for larger/team deployments |
| File storage | Local filesystem by default; S3-compatible object storage as a configurable alternative | Matches self-hosted expectations while giving larger studios a scalable option |
| Licensing | Asymmetric signature verification (public key embedded in the app; private key never included) | Ensures the app can verify authenticity without being able to generate valid licenses itself |
| Packaging/deployment | Docker image + Docker Compose | Standard, low-friction self-hosted deployment pattern; isolates dependencies |
| Background processing | Simple in-process background task (e.g., async task or lightweight queue) for diff computation on larger files, so uploads don't block the UI thread | Keeps infrastructure simple at this scale; avoids introducing a separate task queue system prematurely |

---

## 6. Data Model (conceptual, not schema-level)

- **Studio/Tenant**: represents one licensed deployment's owning organization.
- **User**: belongs to a studio; v1 can have exactly one implicit user, but the entity should exist.
- **Project**: belongs to a studio; groups related asset versions together.
- **AssetVersion**: belongs to a project; stores the original uploaded file, its extracted representation (materials/hierarchy/transforms as structured data, geometry as binary + content hash), upload timestamp, and uploader.
- **DiffResult**: references two AssetVersions being compared; stores the computed materials/hierarchy/geometry diff so it doesn't need recomputation; stores whether the geometry comparison was exact (index-aligned) or approximate (nearest-neighbor fallback).
- **License**: not stored as app data per se, but the verified license payload (customer, seats, features, expiry) should be cached in memory/a lightweight local record after each successful verification, for fast feature-flag checks throughout the app without re-verifying on every request.

---

## 7. Explicit Scope Boundaries for V1

Build these:
- Single-studio, single-user deployment (multi-user data model present but not enforced/exposed in UI yet).
- `.glb`/`.gltf` support only (not `.fbx`/`.blend` — flagged as a future format expansion).
- Manual file upload for comparison (not live Git repository integration — that is a distinct, larger effort flagged for a later phase and should not block v1).
- License verification fully offline/local.

Explicitly do not build yet (but don't design against):
- Git hosting integration (GitHub/GitLab apps, webhooks, PR comments).
- Multi-user authentication/authorization flows.
- Persistent cross-version node/vertex identity (UUID-based tracking through a DCC tool plugin) — v1 uses name-matching for nodes and nearest-neighbor fallback for geometry, with these limitations clearly surfaced in the UI rather than hidden.
- Billing/payment processing inside the app itself — license issuance is a vendor-side, out-of-band process.

---

## 8. Vendor-Side Component (lower priority, minimal detail needed)

A small, separate, internal-only toolkit used exclusively by the vendor (not deployed to customers) to:
- Generate the signing keypair once.
- Issue a signed license file per customer (inputs: customer name, seat count, feature flags, duration; output: a license file to send them).

This does not need a UI, database, or hosting — a simple internal script/tool is sufficient, and it is not part of what gets deployed or shipped to customers. Deprioritize relative to the self-hosted app itself.

---

## 9. Build Order Recommendation for the Agent

1. Data model and storage layer (projects, asset versions, diff results) — get persistence right first.
2. Asset ingestion + extraction ("split") pipeline, with the geometry-stays-binary / metadata-becomes-structured-data approach.
3. Diff computation logic (materials, hierarchy, geometry — including the index-aligned vs. nearest-neighbor fallback logic).
4. API endpoints exposing upload, project/version listing, and diff retrieval.
5. Frontend: project/version browser, diff summary panel, Three.js-based visual diff viewer.
6. License verification module and gating logic wired into the API layer.
7. Docker packaging and deployment documentation.
8. (Separately, low priority) the vendor-side key generation and license issuance tool.
