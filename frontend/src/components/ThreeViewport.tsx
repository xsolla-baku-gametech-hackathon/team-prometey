'use client';

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DiffPayload, MeshDiffData } from "@/types";
import { getModelFileUrl } from "@/lib/api";
import {
  RotateCcw,
  Grid,
  Eye,
  Layers,
  Compass,
  Loader2,
  Zap,
} from "lucide-react";

interface ThreeViewportProps {
  versionAId: string | null;
  versionBId: string | null;
  diffPayload: DiffPayload | null;
  /** Bumping this (new name + nonce) briefly flashes a mesh so it's easy to find in 3D. */
  highlightRequest: { name: string; nonce: number } | null;
}

type ViewMode = "diff" | "versionB" | "versionA" | "overlay";

// Plain diff colors, matching the rest of the UI (Tailwind `success`/`danger`
// tokens) and standard add/remove diff conventions — no amber gradient.
const C_UNCHANGED = new THREE.Color(0x6b7280); // gray — no change
const C_CHANGED = new THREE.Color(0xf85149); // red — displaced / modified
const C_ADDED = new THREE.Color(0x2ecb72); // green — new geometry
const GHOST_COLOR = 0xf85149;

/** glTF exports occasionally omit vertex normals; without them a lit
 *  material (MeshStandardMaterial) renders solid black regardless of
 *  vertex color, since there's nothing for the lights to shade against. */
function ensureNormals(geom: THREE.BufferGeometry) {
  if (!geom.attributes.normal) geom.computeVertexNormals();
}

/** Promise wrapper around GLTFLoader.load so both versions can load in parallel. */
function loadGLTF(loader: GLTFLoader, url: string) {
  return new Promise<THREE.Group>((resolve, reject) => {
    loader.load(
      url,
      (gltf) => resolve(gltf.scene),
      undefined,
      (err) => reject(err instanceof Error ? err : new Error(String(err)))
    );
  });
}

/** Free GPU geometry/material resources before a group is discarded. */
function disposeGroup(group: THREE.Object3D | null) {
  if (!group) return;
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => m?.dispose());
  });
}

function setMeshWireframe(group: THREE.Object3D | null, wireframe: boolean) {
  if (!group) return;
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => {
      if (m && "wireframe" in m) (m as THREE.MeshStandardMaterial).wireframe = wireframe;
    });
  });
}

/**
 * Colors a clone of modelB per-vertex based on the diff payload:
 *   - mesh only present in B (not in A)  -> solid green (added)
 *   - mesh unchanged (content hash match) or vertex within epsilon -> gray
 *   - vertex displaced beyond epsilon, or mesh with a topology change
 *     (no per-vertex correspondence available) -> solid red
 */
function buildDiffModel(
  rawModelB: THREE.Group,
  diffPayload: DiffPayload,
  wireframe: boolean
): THREE.Group {
  const meshDiffByName: Record<string, MeshDiffData> = {};
  diffPayload.geometry.meshes.forEach((m) => {
    meshDiffByName[m.mesh_name] = m;
  });
  const addedNames = new Set(diffPayload.geometry.added_meshes);

  // `Object3D.clone(true)` deep-clones the *hierarchy* only — three.js
  // does NOT clone geometry or material buffers, so without an explicit
  // per-mesh geometry clone below, this would silently mutate modelB's
  // original (shared) geometry when we add a vertex-color attribute to it.
  const clone = rawModelB.clone(true);
  clone.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry = mesh.geometry.clone();
    ensureNormals(mesh.geometry);
    const name = mesh.name || (mesh.geometry as { name?: string })?.name || "";
    const meshDiff = meshDiffByName[name];
    applyDiffColoring(mesh, meshDiff, addedNames.has(name), wireframe);
  });
  return clone;
}

function applyDiffColoring(
  mesh: THREE.Mesh,
  meshDiff: MeshDiffData | undefined,
  isAdded: boolean,
  wireframe: boolean
) {
  const geom = mesh.geometry;
  const count = geom.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const setColor = (i: number, c: THREE.Color) => {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  };

  if (isAdded) {
    for (let i = 0; i < count; i++) setColor(i, C_ADDED);
  } else if (!meshDiff || meshDiff.unchanged) {
    for (let i = 0; i < count; i++) setColor(i, C_UNCHANGED);
  } else if (meshDiff.changed_vertex_indices) {
    const changedSet = new Set(meshDiff.changed_vertex_indices);
    for (let i = 0; i < count; i++) {
      setColor(i, changedSet.has(i) ? C_CHANGED : C_UNCHANGED);
    }
  } else {
    // Topology changed, no per-vertex correspondence available.
    for (let i = 0; i < count; i++) setColor(i, C_CHANGED);
  }

  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  mesh.material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.6,
    metalness: 0.05,
    wireframe,
  });
}

/** Clone of modelA rendered as a semi-transparent x-ray ghost, for Overlay mode. */
function buildOverlayGhost(sourceModel: THREE.Group): THREE.Group {
  const ghost = sourceModel.clone(true);
  ghost.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry = mesh.geometry.clone(); // see note in buildDiffModel
    mesh.material = new THREE.MeshBasicMaterial({
      color: GHOST_COLOR,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      depthTest: false, // x-ray: stays visible even behind V2's solid surfaces
    });
    mesh.renderOrder = 999;
  });
  return ghost;
}

export const ThreeViewport: React.FC<ThreeViewportProps> = ({
  versionAId,
  versionBId,
  diffPayload,
  highlightRequest,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("diff");
  const [isWireframe, setIsWireframe] = useState(false);
  const [isAutoRotate, setIsAutoRotate] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modelsReady, setModelsReady] = useState(0);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const isAutoRotateRef = useRef(false);

  // Four independent variants. modelA/modelB are never mutated after load —
  // diffModel and overlayGhost are separate clones built for their own modes.
  const modelARef = useRef<THREE.Group | null>(null);
  const modelBRef = useRef<THREE.Group | null>(null);
  const diffModelRef = useRef<THREE.Group | null>(null);
  const overlayGhostRef = useRef<THREE.Group | null>(null);

  // ── Scene init (runs once) ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 1000);
    camera.position.set(3, 2.5, 3.5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotateSpeed = 2.0;
    controlsRef.current = controls;

    // Bright, flat-ish lighting so vertex-colored diff meshes read clearly —
    // this is a diff inspector, not a mood render.
    scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x1a202c, 1.1));

    const dir1 = new THREE.DirectionalLight(0xffffff, 2.4);
    dir1.position.set(5, 10, 7);
    scene.add(dir1);

    const dir2 = new THREE.DirectionalLight(0x3d7fff, 0.9);
    dir2.position.set(-5, -5, -5);
    scene.add(dir2);

    const grid = new THREE.GridHelper(12, 24, 0x3d7fff, 0x222834);
    grid.position.y = -0.01;
    scene.add(grid);
    gridRef.current = grid;

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const c = controlsRef.current;
      if (c) {
        // Read from a ref, not the `isAutoRotate` state — this closure is
        // created once, so the state value here would otherwise be stuck
        // at whatever it was on mount and the toggle button would do nothing.
        c.autoRotate = isAutoRotateRef.current;
        c.update();
      }
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      disposeGroup(modelARef.current);
      disposeGroup(modelBRef.current);
      disposeGroup(diffModelRef.current);
      disposeGroup(overlayGhostRef.current);
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    isAutoRotateRef.current = isAutoRotate;
  }, [isAutoRotate]);

  useEffect(() => {
    if (gridRef.current) gridRef.current.visible = showGrid;
  }, [showGrid]);

  // ── Load V1 + V2 whenever the selected pair or diff result changes ─────
  useEffect(() => {
    if (!versionAId || !versionBId || !diffPayload || !sceneRef.current) return;
    let cancelled = false;
    const scene = sceneRef.current;
    const loader = new GLTFLoader();

    setIsLoadingModel(true);
    setLoadError(null);

    (async () => {
      try {
        const [rawA, rawB] = await Promise.all([
          loadGLTF(loader, getModelFileUrl(versionAId)),
          loadGLTF(loader, getModelFileUrl(versionBId)),
        ]);
        if (cancelled) return;

        [rawA, rawB].forEach((group) =>
          group.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (mesh.isMesh) ensureNormals(mesh.geometry);
          })
        );

        // Free the previous set only after the new one is ready, so the
        // viewport never flashes empty mid-swap.
        [modelARef.current, modelBRef.current, diffModelRef.current, overlayGhostRef.current].forEach((m) => {
          if (m) scene.remove(m);
          disposeGroup(m);
        });

        modelARef.current = rawA;
        modelBRef.current = rawB;
        diffModelRef.current = buildDiffModel(rawB, diffPayload, isWireframe);
        overlayGhostRef.current = buildOverlayGhost(rawA);

        // Frame the camera on V2 (the target/newer version).
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (camera && controls) {
          const box = new THREE.Box3().setFromObject(rawB);
          const size = box.getSize(new THREE.Vector3()).length() || 2;
          const center = box.getCenter(new THREE.Vector3());
          controls.target.copy(center);
          camera.position.copy(center).add(new THREE.Vector3(size, size * 0.8, size).multiplyScalar(0.7));
          camera.near = size / 200;
          camera.far = size * 200;
          camera.updateProjectionMatrix();
          controls.update();
          controls.saveState();
        }

        setIsLoadingModel(false);
        setModelsReady((n) => n + 1); // triggers the mode-switch effect below
      } catch (err) {
        if (cancelled) return;
        setIsLoadingModel(false);
        setLoadError(err instanceof Error ? err.message : "Failed to load 3D models");
      }
    })();

    return () => {
      cancelled = true;
    };
    // isWireframe intentionally omitted: it's applied by the mode-switch
    // effect below on every change, no need to reload models for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionAId, versionBId, diffPayload]);

  // ── Show the right group(s) for the current mode ────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    [modelARef.current, modelBRef.current, diffModelRef.current, overlayGhostRef.current].forEach((m) => {
      if (m) scene.remove(m);
    });

    let solidModel: THREE.Object3D | null = null;

    if (viewMode === "versionA" && modelARef.current) {
      scene.add(modelARef.current);
      solidModel = modelARef.current;
    } else if (viewMode === "versionB" && modelBRef.current) {
      scene.add(modelBRef.current);
      solidModel = modelBRef.current;
    } else if (viewMode === "overlay") {
      if (diffModelRef.current) {
        scene.add(diffModelRef.current);
        solidModel = diffModelRef.current;
      }
      if (overlayGhostRef.current) scene.add(overlayGhostRef.current);
    } else if (diffModelRef.current) {
      scene.add(diffModelRef.current);
      solidModel = diffModelRef.current;
    }

    setMeshWireframe(solidModel, isWireframe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, isWireframe, modelsReady]);

  // ── Flash a mesh by name when the changelog panel asks us to ────────
  useEffect(() => {
    if (!highlightRequest) return;
    const targets = [modelARef.current, modelBRef.current, diffModelRef.current].filter(
      (g): g is THREE.Group => Boolean(g && g.parent) // only groups actually in the scene right now
    );
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const restore: { obj: THREE.Mesh; mat: THREE.Material | THREE.Material[] }[] = [];

    targets.forEach((group) => {
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh || mesh.name !== highlightRequest.name) return;
        restore.push({ obj: mesh, mat: mesh.material });
        mesh.material = flashMat;
      });
    });

    if (!restore.length) {
      flashMat.dispose();
      return;
    }
    const doRestore = () => {
      restore.forEach(({ obj, mat }) => {
        obj.material = mat;
      });
      flashMat.dispose();
    };
    const timer = setTimeout(doRestore, 700);
    // If a new highlight request arrives (or the component unmounts)
    // before the timer fires, restore immediately instead of leaving
    // this mesh stuck on the white flash material.
    return () => {
      clearTimeout(timer);
      doRestore();
    };
  }, [highlightRequest]);

  const resetCamera = () => {
    if (controlsRef.current) controlsRef.current.reset();
  };

  return (
    <div className="relative flex-1 h-full w-full bg-[radial-gradient(circle_at_50%_50%,#151922_0%,#0a0c10_100%)] overflow-hidden">
      {/* Viewport Toolbar */}
      <div className="absolute top-3.5 left-1/2 -translate-x-1/2 flex gap-1 bg-[#13161c]/85 backdrop-blur-md border border-[#293040] rounded-full p-1 shadow-2xl z-10">
        {(
          [
            { mode: "diff", label: "Diff", icon: <Zap className="w-3.5 h-3.5" /> },
            { mode: "versionA", label: "V1 Base", icon: null },
            { mode: "versionB", label: "V2 Target", icon: null },
            { mode: "overlay", label: "Overlay", icon: null },
          ] satisfies { mode: ViewMode; label: string; icon: React.ReactNode }[]
        ).map(({ mode, label, icon }) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all ${
              viewMode === mode
                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <span className="flex items-center gap-1.5">
              {icon}
              {label}
            </span>
          </button>
        ))}
      </div>

      {/* Quick Tools */}
      <div className="absolute top-3.5 right-3.5 flex flex-col gap-1.5 z-10">
        <button
          onClick={resetCamera}
          className="w-8 h-8 rounded-lg bg-[#13161c]/85 backdrop-blur-md border border-[#293040] text-gray-400 hover:text-white hover:border-blue-500 flex items-center justify-center transition-all shadow-md"
          title="Reset Camera"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          onClick={() => setIsWireframe(!isWireframe)}
          className={`w-8 h-8 rounded-lg bg-[#13161c]/85 backdrop-blur-md border border-[#293040] flex items-center justify-center transition-all shadow-md ${
            isWireframe ? "text-blue-400 border-blue-500 bg-blue-500/20" : "text-gray-400 hover:text-white"
          }`}
          title="Toggle Wireframe"
        >
          <Eye className="w-4 h-4" />
        </button>
        <button
          onClick={() => setIsAutoRotate(!isAutoRotate)}
          className={`w-8 h-8 rounded-lg bg-[#13161c]/85 backdrop-blur-md border border-[#293040] flex items-center justify-center transition-all shadow-md ${
            isAutoRotate ? "text-blue-400 border-blue-500 bg-blue-500/20" : "text-gray-400 hover:text-white"
          }`}
          title="Auto Rotate"
        >
          <Compass className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowGrid(!showGrid)}
          className={`w-8 h-8 rounded-lg bg-[#13161c]/85 backdrop-blur-md border border-[#293040] flex items-center justify-center transition-all shadow-md ${
            showGrid ? "text-blue-400 border-blue-500 bg-blue-500/20" : "text-gray-400 hover:text-white"
          }`}
          title="Toggle Grid"
        >
          <Grid className="w-4 h-4" />
        </button>
      </div>

      {/* WebGL Canvas */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Loading overlay */}
      {isLoadingModel && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0c10]/60 backdrop-blur-sm z-20 pointer-events-none">
          <div className="flex items-center gap-2 text-sm text-gray-300 bg-[#13161c]/90 border border-[#293040] rounded-lg px-4 py-2.5 shadow-xl">
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            Loading 3D models…
          </div>
        </div>
      )}

      {/* Error state */}
      {loadError && !isLoadingModel && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-lg px-3.5 py-2 shadow-xl max-w-md text-center">
          Failed to load models: {loadError}
        </div>
      )}

      {/* Legend */}
      {diffPayload && !isLoadingModel && (
        <div className="absolute bottom-4 left-4 bg-[#13161c]/90 backdrop-blur-md border border-[#293040] rounded-lg p-3 text-xs shadow-xl pointer-events-none z-10 flex flex-col gap-1.5">
          {viewMode === "versionA" && (
            <div className="flex items-center gap-2 text-gray-300">
              <span className="w-3 h-3 rounded bg-gray-400" /> Original V1 geometry
            </div>
          )}
          {viewMode === "versionB" && (
            <div className="flex items-center gap-2 text-gray-300">
              <span className="w-3 h-3 rounded bg-gray-400" /> Original V2 geometry
            </div>
          )}
          {(viewMode === "diff" || viewMode === "overlay") && (
            <>
              <div className="flex items-center gap-2 text-gray-300">
                <span className="w-3 h-3 rounded bg-[#6b7280]" /> Unchanged vertices
              </div>
              <div className="flex items-center gap-2 text-gray-300">
                <span className="w-3 h-3 rounded bg-[#f85149] shadow-[0_0_6px_#f85149]" /> Displaced / modified
              </div>
              <div className="flex items-center gap-2 text-gray-300">
                <span className="w-3 h-3 rounded bg-[#2ecb72] shadow-[0_0_6px_#2ecb72]" /> Added geometry
              </div>
            </>
          )}
          {viewMode === "overlay" && (
            <div className="flex items-center gap-2 text-gray-300">
              <span className="w-3 h-3 rounded bg-[#f85149]" style={{ opacity: 0.6 }} /> V1 ghost (x-ray, shows old position)
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!diffPayload && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center max-w-sm pointer-events-none z-0">
          <Layers className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-gray-200 mb-1">3D Viewport Ready</h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            Select or upload two versions of a 3D asset in the sidebar and click <b>Compute 3D Diff</b> to visualize changes.
          </p>
        </div>
      )}
    </div>
  );
};
