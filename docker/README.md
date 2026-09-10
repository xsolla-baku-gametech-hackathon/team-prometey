# MeshDiff

**`git diff` for 3D models.** Upload two versions of a `.glb`/`.gltf` file and see exactly what changed — materials, node hierarchy/transforms, and a color-coded 3D visualization of which vertices moved, were added, or were removed.

Built at the Xsolla Baku GameTech Hackathon (Sep 9–11, 2026).

## The problem

3D game assets are binary blobs. Git can't show you what changed inside a `.glb` file the way it shows a code diff — so studios either lose track of what artists changed between versions, or pay for expensive lock-based tools (Perforce, Plastic SCM) that fight with modern Git workflows. MeshDiff answers "what changed?" without asking teams to change their version control.

## Who it's for

Technical artists, art leads, and tools engineers at game studios who need to review 3D asset changes the way developers review code changes.

## Key GameTech use case

Developer tooling: making binary game assets reviewable, so studios can catch unintended changes (a moved bone, a swapped material, a topology break) before they ship — the same review discipline code already gets.

## Main features

- **Materials diff** — added / removed / changed (old → new) PBR values, matched by name.
- **Hierarchy diff** — added / removed / moved / reparented nodes with transform deltas.
- **Geometry diff** — per-vertex displacement. Index-aligned (exact) when vertex counts match; nearest-neighbor fallback (clearly labeled **approximate**) when topology changed.
- **3D visual diff** — both versions render in-browser via Three.js; the diff view colors vertices gray (unchanged) or yellow (changed).
- **Diff caching** — every computed diff is stored, so revisiting it is instant.

## Technology stack

| Layer | Choice |
|---|---|
| Backend | Python, FastAPI |
| 3D parsing | trimesh, pygltflib |
| Geometry matching | NumPy, SciPy (KD-tree nearest-neighbor) |
| Frontend | Vanilla JS + Three.js (single HTML file, no build step) |
| Database | SQLite |
| File storage | Local filesystem |
| Packaging | Docker + Docker Compose |

## Project structure

```
meshdiff/
├── backend/
│   ├── app/
│   │   ├── models.py       # SQLite schema: Project, AssetVersion, DiffResult
│   │   ├── storage.py      # local filesystem path layout
│   │   ├── extraction.py   # .glb/.gltf -> materials/hierarchy/geometry
│   │   ├── diff.py         # materials/hierarchy/geometry diff logic
│   │   └── main.py         # FastAPI endpoints
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   └── index.html          # single-page app: upload, changelog, 3D viewer
├── docker-compose.yml
└── README.md
```

## Environment variables

None are required to run locally — sensible defaults are baked in. See `backend/.env.example` for what's configurable (storage location, DB path) if you want to change where data is written.

## Running locally (no Docker)

**Backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```
API runs at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

**Frontend:**
```bash
cd frontend
python3 -m http.server 8080
```
Open `http://localhost:8080` in a browser. (`index.html` talks to the backend at `http://localhost:8000` — edit the `API` constant near the top of the `<script>` block if you're running the backend elsewhere.)

## Running with Docker

```bash
docker compose up --build
```
- Backend: `http://localhost:8000`
- Frontend: `http://localhost:8080`

Uploaded assets and the database persist in a Docker volume (`meshdiff_storage`) across restarts.

## How it works (demo flow)

1. Create a project.
2. Upload `character_v1.glb`, then `character_v2.glb`.
3. Select both versions, click **Diff selected versions**.
4. Read the changelog panel: which materials changed, which nodes moved.
5. Look at the 3D viewer: yellow vertices are the ones that changed.
6. Refresh the page and re-select the same pair — the diff loads instantly from cache, no recomputation.

## Testing

Each backend module was verified against real generated `.glb` files during development (not just unit-tested against mocks):
- `extraction.py`: parses real materials/hierarchy/geometry; produces clear errors on missing/corrupt files.
- `diff.py`: verified against known changes (added material, changed roughness, moved vertices, added mesh) and against a deliberate topology change to confirm the nearest-neighbor fallback triggers and is labeled approximate.
- `main.py`: full upload → diff → cache → retrieve flow tested via FastAPI's `TestClient`, including error paths (self-diff, unsupported file type, missing project/version).

## Known limitations (v1, by design — see build spec for future phases)

- Single user, single "studio" — no authentication yet.
- Nodes are matched by name: a **renamed** node shows as a remove + add, not a rename.
- Only `.glb`/`.gltf` are supported (`.fbx`/`.obj` are future format expansions).
- No live Git repository integration — versions are uploaded manually.

## What's next

- Git integration (diff versions directly from a repo).
- Persistent node/vertex IDs (via a DCC plugin) to fix the rename/retopology limitations above.
- Multi-user projects with comments on diffs.
