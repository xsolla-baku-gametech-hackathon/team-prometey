'use client';

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader, GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DiffPayload, MeshDiffData } from "@/types";
import { getModelFileUrl } from "@/lib/api";
import { RotateCcw, Layers, Loader2 } from "lucide-react";

interface ThreeViewportProps {
  versionAId: string | null;
  versionBId: string | null;
  diffPayload: DiffPayload | null;
  /** Bumping this flashes a mesh, or — with vertexIndex set — flies the
   *  camera to that specific vertex and drops a marker on it. */
  highlightRequest: { name: string; nonce: number; vertexIndex?: number } | null;
}

type ViewMode = "versionB" | "versionA" | "overlay";

// Diff colors — plain, flat, no gradients — matching the rest of the UI:
//   blue   = changed/displaced (still present in both versions)
//   green  = added (new geometry, only in V2)
//   red    = ghost/removed (V1's old geometry, shown as an x-ray overlay)
const C_UNCHANGED = new THREE.Color(0x94a3b8); // gray — no change
const C_CHANGED = new THREE.Color(0x2563eb); // blue — displaced / modified
const C_ADDED = new THREE.Color(0x059669); // green — new geometry
const GHOST_COLOR = 0xef4444; // red — V1 ghost overlay
const MARKER_COLOR = 0xf59e0b; // amber — vertex locator, distinct from all diff colors

/** glTF exports occasionally omit vertex normals; without them a lit
 *  material (MeshStandardMaterial) renders solid black regardless of
 *  vertex color, since there's nothing for the lights to shade against. */
function ensureNormals(geom: THREE.BufferGeometry) {
  if (!geom.attributes.normal) geom.computeVertexNormals();
}

/**
 * GLTFLoader names every loaded Mesh after its glTF *node*, not its glTF
 * *mesh* — when a node wraps exactly one mesh (the common case), the node's
 * name silently overwrites the mesh's own name (see GLTFLoader.js's
 * `loadNode`, `node.name = nodeName`). The backend's diff, though, identifies
 * meshes by the glTF *mesh* name (trimesh's `scene.geometry` keys). Whenever
 * an asset's node name differs from its mesh name — common in real DCC
 * exports — every name-based lookup on the frontend (added-mesh detection,
 * per-vertex coloring, click-to-locate) silently fails and the mesh falls
 * back to looking "unchanged" instead of showing its real diff color.
 *
 * Fix: walk `gltf.parser.associations` (which GLTFLoader populates
 * specifically to map loaded objects back to their glTF definition index)
 * to recover the true mesh-level name from `gltf.parser.json.meshes[]`, and
 * use that as the mesh's `.name` everywhere downstream.
 */
function resolveGltfMeshNames(gltf: GLTF) {
  const parser = gltf.parser;
  const meshDefs = parser?.json?.meshes;
  if (!parser || !Array.isArray(meshDefs)) return;

  gltf.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const meshIndex = parser.associations.get(mesh)?.meshes;
    const trueName = meshIndex !== undefined ? meshDefs[meshIndex]?.name : undefined;
    if (trueName) mesh.name = trueName;
  });
}

/** Promise wrapper around GLTFLoader.load so both versions can load in parallel. */
function loadGLTF(loader: GLTFLoader, url: string) {
  return new Promise<GLTF>((resolve, reject) => {
    loader.load(
      url,
      (gltf) => resolve(gltf),
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
 *     (no per-vertex correspondence available) -> solid blue
 *
 * Also stashes each matched mesh's V1/V2 position buffers in userData
 * (morphV1/morphV2) when vertex counts line up, so the morph slider can
 * interpolate between them without needing to re-derive anything later.
 */
function buildDiffModel(
  rawModelB: THREE.Group,
  rawModelA: THREE.Group,
  diffPayload: DiffPayload,
  wireframe: boolean
): THREE.Group {
  const meshDiffByName: Record<string, MeshDiffData> = {};
  diffPayload.geometry.meshes.forEach((m) => {
    meshDiffByName[m.mesh_name] = m;
  });
  const addedNames = new Set(diffPayload.geometry.added_meshes.map((m) => m.mesh_name));

  const meshesA: Record<string, THREE.Mesh> = {};
  rawModelA.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) meshesA[mesh.name] = mesh;
  });

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
    const meshDiff = meshDiffByName[mesh.name];
    applyDiffColoring(mesh, meshDiff, addedNames.has(mesh.name), wireframe);

    const meshA = meshesA[mesh.name];
    const posB = mesh.geometry.attributes.position;
    const posA = meshA?.geometry.attributes.position;
    if (posA && posA.count === posB.count) {
      mesh.userData.morphV1 = Float32Array.from(posA.array as ArrayLike<number>);
      mesh.userData.morphV2 = Float32Array.from(posB.array as ArrayLike<number>);
    }
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
    transparent: true, // opacity is driven live by the morph slider
  });
}

/**
 * Scrubs between V1 and V2: interpolates each matched mesh's vertex
 * positions (morphValue 0 = V1, 1 = V2) and fades the ghost/diff opacity
 * in step, so dragging the slider reads as "watching the edit happen."
 * Meshes without a stashed morphV1/morphV2 (topology mismatch, or no V1
 * counterpart) don't move -- they only fade.
 */
function applyMorph(diffModel: THREE.Group | null, ghostModel: THREE.Group | null, morphValue: number) {
  if (ghostModel) {
    const ghostOpacity = (1 - morphValue) * 0.4 + 0.1;
    ghostModel.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      (mesh.material as THREE.MeshBasicMaterial).opacity = ghostOpacity;
    });
  }

  if (diffModel) {
    const diffOpacity = Math.max(morphValue, 0.2);
    diffModel.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      (mesh.material as THREE.MeshStandardMaterial).opacity = diffOpacity;

      const v1 = mesh.userData.morphV1 as Float32Array | undefined;
      const v2 = mesh.userData.morphV2 as Float32Array | undefined;
      if (!v1 || !v2) return;

      const posAttr = mesh.geometry.attributes.position as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      for (let i = 0; i < arr.length; i++) {
        arr[i] = v1[i] + (v2[i] - v1[i]) * morphValue;
      }
      posAttr.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    });
  }
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
      opacity: 0.35,
      depthWrite: false,
      depthTest: false, // x-ray: stays visible even behind V2's solid surfaces
    });
    mesh.renderOrder = 999;
  });
  return ghost;
}

/**
 * Eases the camera + its orbit target toward a world point. If `distance` is
 * omitted, the camera's current distance from its target is preserved (used
 * for a vertex click, so zoom level stays roughly "in context"); pass an
 * explicit distance to frame a whole object (used for a mesh click).
 */
function flyCameraTo(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  target: THREE.Vector3,
  distance?: number,
  frames = 40
) {
  const startTarget = controls.target.clone();
  const startPos = camera.position.clone();
  const direction = startPos.clone().sub(startTarget);
  const useDistance = distance ?? Math.max(direction.length(), 0.3);
  direction.normalize();
  const endTarget = target.clone();
  const endPos = endTarget.clone().add(direction.multiplyScalar(useDistance));

  let frame = 0;
  const step = () => {
    frame++;
    const t = Math.min(frame / frames, 1);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    camera.position.lerpVectors(startPos, endPos, eased);
    controls.target.lerpVectors(startTarget, endTarget, eased);
    controls.update();
    if (t < 1) requestAnimationFrame(step);
  };
  step();
}

/** Finds a mesh's world-space vertex position by name + index, searching the given groups in order. */
function findVertexWorldPosition(groups: (THREE.Group | null)[], meshName: string, vertexIndex: number): THREE.Vector3 | null {
  for (const group of groups) {
    if (!group) continue;
    let result: THREE.Vector3 | null = null;
    group.traverse((obj) => {
      if (result) return;
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || mesh.name !== meshName) return;
      const pos = mesh.geometry.attributes.position;
      if (vertexIndex >= pos.count) return;
      mesh.updateWorldMatrix(true, false);
      result = new THREE.Vector3().fromBufferAttribute(pos, vertexIndex).applyMatrix4(mesh.matrixWorld);
    });
    if (result) return result;
  }
  return null;
}

/** A camera position + framing distance that fits a mesh's world-space bounding box, given the camera's FOV. */
function framingFor(camera: THREE.PerspectiveCamera, box: THREE.Box3, padding = 2.4) {
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.05);
  const fovRad = (camera.fov * Math.PI) / 180;
  const distance = (maxDim / 2 / Math.tan(fovRad / 2)) * padding;
  return { center, distance };
}

export const ThreeViewport: React.FC<ThreeViewportProps> = ({
  versionAId,
  versionBId,
  diffPayload,
  highlightRequest,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("overlay");
  const [morphValue, setMorphValue] = useState(1); // 0 = V1, 1 = V2
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
    scene.background = new THREE.Color(0xffffff);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 1000);
    camera.position.set(3, 2.5, 3.5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
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
    scene.add(new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 1.1));

    const dir1 = new THREE.DirectionalLight(0xffffff, 2.4);
    dir1.position.set(5, 10, 7);
    scene.add(dir1);

    const dir2 = new THREE.DirectionalLight(0x2563eb, 0.6);
    dir2.position.set(-5, -5, -5);
    scene.add(dir2);

    const grid = new THREE.GridHelper(12, 24, 0xcbd5e1, 0xe2e8f0);
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
        const [gltfA, gltfB] = await Promise.all([
          loadGLTF(loader, getModelFileUrl(versionAId)),
          loadGLTF(loader, getModelFileUrl(versionBId)),
        ]);
        if (cancelled) return;

        resolveGltfMeshNames(gltfA);
        resolveGltfMeshNames(gltfB);
        const rawA = gltfA.scene;
        const rawB = gltfB.scene;

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
        diffModelRef.current = buildDiffModel(rawB, rawA, diffPayload, isWireframe);
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
    }

    setMeshWireframe(solidModel, isWireframe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, isWireframe, modelsReady]);

  // ── V1 ↔ V2 morph slider: interpolate positions + fade ghost/diff opacity ──
  useEffect(() => {
    applyMorph(diffModelRef.current, overlayGhostRef.current, morphValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morphValue, modelsReady]);

  // Reset to "fully V2" whenever a new diff loads, rather than carrying over
  // whatever position a previous asset's slider was left at.
  useEffect(() => {
    setMorphValue(1);
  }, [versionAId, versionBId]);

  // ── Respond to a changelog click: flash a mesh, or fly to one vertex ────
  useEffect(() => {
    if (!highlightRequest) return;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    if (highlightRequest.vertexIndex !== undefined) {
      if (!scene || !camera || !controls) return;
      const worldPos = findVertexWorldPosition(
        [diffModelRef.current, modelBRef.current],
        highlightRequest.name,
        highlightRequest.vertexIndex
      );
      if (!worldPos) return;

      const scale = Math.max(camera.position.distanceTo(controls.target) * 0.015, 0.01);
      const markerGeo = new THREE.SphereGeometry(scale, 16, 16);
      const markerMat = new THREE.MeshBasicMaterial({ color: MARKER_COLOR, depthTest: false, transparent: true });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.copy(worldPos);
      marker.renderOrder = 1000;
      scene.add(marker);

      flyCameraTo(camera, controls, worldPos);

      const timer = setTimeout(() => {
        scene.remove(marker);
        markerGeo.dispose();
        markerMat.dispose();
      }, 1800);
      return () => clearTimeout(timer);
    }

    // Plain mesh click: flash the whole mesh white for ~0.7s.
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

    // Also fly the camera to frame this mesh, so clicking a row in the
    // panel doesn't just flash something you have to go hunting for.
    if (camera && controls) {
      const box = new THREE.Box3();
      restore.forEach(({ obj }) => box.expandByObject(obj));
      if (!box.isEmpty()) {
        const { center, distance } = framingFor(camera, box);
        flyCameraTo(camera, controls, center, distance);
      }
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
    // this mesh stuck on the flash material.
    return () => {
      clearTimeout(timer);
      doRestore();
    };
  }, [highlightRequest]);

  const resetCamera = () => {
    if (controlsRef.current) controlsRef.current.reset();
  };

  const toggle = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label className="flex items-center gap-1.5 text-xs font-medium text-[#64748b] cursor-pointer select-none whitespace-nowrap">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[#2563eb] cursor-pointer"
      />
      {label}
    </label>
  );

  return (
    <div className="flex flex-col flex-1 h-full w-full overflow-hidden">
      {/* Docked toolbar: view tabs on the left, morph slider + toggles on the right */}
      <div className="h-[50px] flex-shrink-0 bg-white border-b border-[#e2e8f0] flex items-center justify-between gap-4 px-4">
        <div className="flex bg-[#f8fafc] p-0.5 rounded-lg border border-[#e2e8f0] flex-shrink-0">
          {(
            [
              { mode: "overlay", label: "Overlay" },
              { mode: "versionA", label: "V1 Base" },
              { mode: "versionB", label: "V2 Target" },
            ] satisfies { mode: ViewMode; label: string }[]
          ).map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                viewMode === mode ? "bg-white text-[#2563eb] shadow-sm" : "text-[#64748b] hover:text-[#0f172a]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {viewMode === "overlay" && diffPayload && (
          <div className="flex items-center gap-2.5 flex-1 justify-center min-w-0">
            <span className="text-[11px] font-semibold text-[#64748b] whitespace-nowrap">V1 → V2</span>
            <input
              type="range"
              min={0}
              max={100}
              value={morphValue * 100}
              onChange={(e) => setMorphValue(Number(e.target.value) / 100)}
              className="w-full max-w-[220px] accent-[#2563eb] cursor-pointer"
              title="Scrub between V1 and V2"
            />
          </div>
        )}

        <div className="flex items-center gap-4 flex-shrink-0">
          {toggle("Wireframe", isWireframe, setIsWireframe)}
          {toggle("Auto Rotate", isAutoRotate, setIsAutoRotate)}
          {toggle("Grid", showGrid, setShowGrid)}
          <button
            onClick={resetCamera}
            className="w-7 h-7 rounded-md text-[#64748b] hover:text-[#2563eb] hover:bg-[#eff6ff] flex items-center justify-center transition-colors flex-shrink-0"
            title="Reset Camera"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Viewport */}
      <div className="relative flex-1 w-full bg-[#f8fafc] overflow-hidden">
      {/* WebGL Canvas */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Loading overlay */}
      {isLoadingModel && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm z-20 pointer-events-none">
          <div className="flex items-center gap-2 text-sm text-[#334155] bg-white border border-[#e2e8f0] rounded-lg px-4 py-2.5 shadow-md">
            <Loader2 className="w-4 h-4 animate-spin text-[#2563eb]" />
            Loading 3D models…
          </div>
        </div>
      )}

      {/* Error state */}
      {loadError && !isLoadingModel && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-[#fef2f2] border border-[#fecaca] text-[#ef4444] text-xs rounded-lg px-3.5 py-2 shadow-md max-w-md text-center">
          Failed to load models: {loadError}
        </div>
      )}

      {/* Legend */}
      {diffPayload && !isLoadingModel && (
        <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-md border border-[#e2e8f0] rounded-lg p-3 text-xs shadow-md pointer-events-none z-10 flex flex-col gap-1.5">
          {viewMode === "versionA" && (
            <div className="flex items-center gap-2 text-[#334155]">
              <span className="w-3 h-3 rounded bg-[#94a3b8]" /> Original V1 geometry
            </div>
          )}
          {viewMode === "versionB" && (
            <div className="flex items-center gap-2 text-[#334155]">
              <span className="w-3 h-3 rounded bg-[#94a3b8]" /> Original V2 geometry
            </div>
          )}
          {viewMode === "overlay" && (
            <>
              <div className="flex items-center gap-2 text-[#334155]">
                <span className="w-3 h-3 rounded bg-[#94a3b8]" /> Unchanged vertices
              </div>
              <div className="flex items-center gap-2 text-[#334155]">
                <span className="w-3 h-3 rounded bg-[#2563eb]" /> Displaced / modified
              </div>
              <div className="flex items-center gap-2 text-[#334155]">
                <span className="w-3 h-3 rounded bg-[#059669]" /> Added geometry
              </div>
              <div className="flex items-center gap-2 text-[#334155]">
                <span className="w-3 h-3 rounded bg-[#ef4444]" style={{ opacity: 0.6 }} /> V1 ghost (x-ray, old position)
              </div>
            </>
          )}
        </div>
      )}

      {/* Empty State */}
      {!diffPayload && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center max-w-sm pointer-events-none z-0">
          <Layers className="w-12 h-12 text-[#cbd5e1] mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-[#0f172a] mb-1">3D Viewport Ready</h3>
          <p className="text-xs text-[#94a3b8] leading-relaxed">
            Select or upload two versions of a 3D asset in the sidebar and click <b>Compute 3D Diff</b> to visualize changes.
          </p>
        </div>
      )}
      </div>
    </div>
  );
};
