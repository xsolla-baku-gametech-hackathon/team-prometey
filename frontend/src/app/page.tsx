'use client';

import React, { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type ViewMode = "v1" | "v2" | "diff";
type NodeEntry = { name: string; label: string };

const HIGHLIGHT_COLOR = new THREE.Color(0x2563eb);
const GHOST_COLOR = new THREE.Color(0xef4444);
const EPSILON = 0.01;

function collectMeshes(root: THREE.Object3D): Record<string, THREE.Mesh> {
  const out: Record<string, THREE.Mesh> = {};
  let idx = 0;
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      out[mesh.name || `mesh_${idx}`] = mesh;
      idx++;
    }
  });
  return out;
}

/** Without vertex normals a lit material renders solid black; glTF exports occasionally omit them. */
function ensureNormals(geom: THREE.BufferGeometry) {
  if (!geom.attributes.normal) geom.computeVertexNormals();
}

export default function Home() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  const groupV1Raw = useRef<THREE.Group | null>(null);
  const groupV2Raw = useRef<THREE.Group | null>(null);
  const v1MeshesByName = useRef<Record<string, THREE.Mesh>>({});
  const v2MeshesByName = useRef<Record<string, THREE.Mesh>>({});

  const [activeView, setActiveView] = useState<ViewMode>("diff");
  const [showGhost, setShowGhost] = useState(true);
  const [showHighlight, setShowHighlight] = useState(true);
  const [autoSpin, setAutoSpin] = useState(false);

  const [statV1, setStatV1] = useState<number | null>(null);
  const [statV2, setStatV2] = useState<number | null>(null);
  const [statChanged, setStatChanged] = useState<number | null>(null);
  const [statPct, setStatPct] = useState<number | null>(null);
  const [nodeList, setNodeList] = useState<NodeEntry[]>([]);
  const [status, setStatus] = useState("Hazırdır. Faylları seçin.");

  const autoSpinRef = useRef(autoSpin);
  useEffect(() => {
    autoSpinRef.current = autoSpin;
  }, [autoSpin]);

  // ── Scene init (runs once) ──────────────────────────────────────────
  useEffect(() => {
    if (!viewportRef.current) return;
    const viewport = viewportRef.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, viewport.clientWidth / viewport.clientHeight, 0.1, 100);
    camera.position.set(3, 2, 4);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    viewport.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.2);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (autoSpinRef.current) scene.rotation.y += 0.005;
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      camera.aspect = viewport.clientWidth / viewport.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
    };
  }, []);

  const focusOnMesh = useCallback((mesh: THREE.Mesh) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;

    const targetPos = new THREE.Vector3(
      center.x + maxDim * 1.5,
      center.y + maxDim * 1.2,
      center.z + maxDim * 1.5
    );

    let step = 0;
    const animateZoom = () => {
      if (step < 25) {
        camera.position.lerp(targetPos, 0.1);
        controls.target.lerp(center, 0.1);
        controls.update();
        step++;
        requestAnimationFrame(animateZoom);
      }
    };
    animateZoom();
  }, []);

  const zoomToByName = useCallback(
    (name: string) => {
      const scene = sceneRef.current;
      if (!scene) return;
      scene.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh && mesh.name === name) focusOnMesh(mesh);
      });
    },
    [focusOnMesh]
  );

  // ── rebuildScene: mirrors template.html's rebuildScene() ────────────
  const rebuildScene = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const toRemove: THREE.Object3D[] = [];
    scene.children.forEach((c) => {
      if (c.type === "Group") toRemove.push(c);
    });
    toRemove.forEach((c) => scene.remove(c));

    if (activeView === "v1" && groupV1Raw.current) {
      scene.add(groupV1Raw.current.clone(true));
      return;
    }
    if (activeView === "v2" && groupV2Raw.current) {
      scene.add(groupV2Raw.current.clone(true));
      return;
    }

    // V1 ghost overlay
    if (groupV1Raw.current && showGhost) {
      const ghostGroup = groupV1Raw.current.clone(true);
      ghostGroup.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry = mesh.geometry.clone(); // clone(true) doesn't deep-clone geometry/materials
        mesh.material = new THREE.MeshBasicMaterial({
          color: GHOST_COLOR,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
          depthTest: false,
        });
        mesh.renderOrder = 999;
      });
      scene.add(ghostGroup);
    }

    // V2 diff mesh
    if (groupV2Raw.current) {
      const diffGroup = groupV2Raw.current.clone(true);
      const v2Meshes = collectMeshes(diffGroup);

      let changedCount = 0;
      let totalCount = 0;
      const nodes: NodeEntry[] = [];

      for (const name in v2Meshes) {
        const meshV2 = v2Meshes[name];
        meshV2.geometry = meshV2.geometry.clone();
        const meshV1 = v1MeshesByName.current[name];

        const pos2 = meshV2.geometry.attributes.position;
        totalCount += pos2.count;

        if (!meshV1) {
          nodes.push({ name, label: "+ Yeni Obyekt" });
          changedCount += pos2.count;
          ensureNormals(meshV2.geometry);
          continue;
        }

        const pos1 = meshV1.geometry.attributes.position;
        const minCount = Math.min(pos1.count, pos2.count);
        let meshChanged = Math.abs(pos1.count - pos2.count);

        const newColors = new Float32Array(pos2.count * 3);
        for (let i = 0; i < pos2.count; i++) {
          const x1 = pos1.getX(i % minCount);
          const y1 = pos1.getY(i % minCount);
          const z1 = pos1.getZ(i % minCount);
          const x2 = pos2.getX(i);
          const y2 = pos2.getY(i);
          const z2 = pos2.getZ(i);

          const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2);
          if (dist > EPSILON && showHighlight) {
            const strength = Math.min(dist / 0.3, 1);
            newColors[i * 3] = HIGHLIGHT_COLOR.r * strength;
            newColors[i * 3 + 1] = HIGHLIGHT_COLOR.g * strength;
            newColors[i * 3 + 2] = HIGHLIGHT_COLOR.b * strength;
            meshChanged++;
          } else {
            newColors[i * 3] = 0.7;
            newColors[i * 3 + 1] = 0.7;
            newColors[i * 3 + 2] = 0.7;
          }
        }

        meshV2.geometry.setAttribute("color", new THREE.BufferAttribute(newColors, 3));
        meshV2.material = new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.6,
          metalness: 0.05,
        });

        changedCount += meshChanged;
        const pct = ((meshChanged / pos2.count) * 100).toFixed(1);
        nodes.push({ name, label: `${pct}% fərq` });
      }

      scene.add(diffGroup);

      setStatChanged(totalCount ? changedCount : null);
      setStatPct(totalCount ? parseFloat(((changedCount / totalCount) * 100).toFixed(1)) : null);
      setNodeList(nodes);
    }
  }, [activeView, showGhost, showHighlight]);

  useEffect(() => {
    rebuildScene();
  }, [rebuildScene]);

  // ── File loading ─────────────────────────────────────────────────────
  const loadFile = useCallback(
    (file: File, isV1: boolean) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const loader = new GLTFLoader();
        loader.parse(
          evt.target!.result as ArrayBuffer,
          "",
          (gltf) => {
            gltf.scene.traverse((child) => {
              const mesh = child as THREE.Mesh;
              if (mesh.isMesh) ensureNormals(mesh.geometry);
            });

            if (isV1) {
              groupV1Raw.current = gltf.scene;
              v1MeshesByName.current = collectMeshes(gltf.scene);
              const total = Object.values(v1MeshesByName.current).reduce(
                (s, m) => s + m.geometry.attributes.position.count,
                0
              );
              setStatV1(total);
              setStatus(`V1 yükləndi: ${file.name}`);
            } else {
              groupV2Raw.current = gltf.scene;
              v2MeshesByName.current = collectMeshes(gltf.scene);
              const total = Object.values(v2MeshesByName.current).reduce(
                (s, m) => s + m.geometry.attributes.position.count,
                0
              );
              setStatV2(total);
              setStatus(`V2 yükləndi: ${file.name}`);
            }
            rebuildScene();
          },
          (err) => setStatus(`Xəta: ${err instanceof ErrorEvent ? err.message : String(err)}`)
        );
      };
      reader.readAsArrayBuffer(file);
    },
    [rebuildScene]
  );

  const tabs: { view: ViewMode; label: string }[] = [
    { view: "v1", label: "Yalnız V1" },
    { view: "v2", label: "Yalnız V2" },
    { view: "diff", label: "Mərkəzi Diff (İç-İçə)" },
  ];

  return (
    <div className="h-screen w-screen flex flex-col bg-[#f8fafc] text-[#0f172a] overflow-hidden">
      {/* Header */}
      <header className="h-[60px] flex-shrink-0 bg-white border-b border-[#e2e8f0] flex items-center justify-between px-6 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#2563eb] flex items-center justify-center font-bold text-base text-white">
            Δ
          </div>
          <div className="text-base font-bold">MeshDiff Studio</div>
        </div>
        <div className="flex gap-3">
          <div className="flex items-center gap-2 bg-[#f8fafc] border border-dashed border-[#e2e8f0] px-3 py-1.5 rounded-lg">
            <label className="text-xs font-semibold text-[#64748b]">V1 (Köhnə):</label>
            <input
              type="file"
              accept=".glb,.gltf"
              className="text-[11px] w-[130px] cursor-pointer"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadFile(f, true);
              }}
            />
          </div>
          <div className="flex items-center gap-2 bg-[#f8fafc] border border-dashed border-[#e2e8f0] px-3 py-1.5 rounded-lg">
            <label className="text-xs font-semibold text-[#64748b]">V2 (Yeni):</label>
            <input
              type="file"
              accept=".glb,.gltf"
              className="text-[11px] w-[130px] cursor-pointer"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadFile(f, false);
              }}
            />
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="h-[50px] flex-shrink-0 bg-white border-b border-[#e2e8f0] flex items-center justify-between px-6 text-xs">
        <div className="flex bg-[#f8fafc] p-[3px] rounded-lg border border-[#e2e8f0]">
          {tabs.map(({ view, label }) => (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeView === view ? "bg-white text-[#2563eb] shadow-sm" : "text-[#64748b] hover:text-[#0f172a]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 font-medium text-[#64748b] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showGhost}
              onChange={(e) => setShowGhost(e.target.checked)}
              className="accent-[#2563eb] cursor-pointer"
            />
            V1 Qırmızı Kölgə
          </label>
          <label className="flex items-center gap-1.5 font-medium text-[#64748b] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showHighlight}
              onChange={(e) => setShowHighlight(e.target.checked)}
              className="accent-[#2563eb] cursor-pointer"
            />
            Dəyişikliyi Vurğula
          </label>
          <label className="flex items-center gap-1.5 font-medium text-[#64748b] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoSpin}
              onChange={(e) => setAutoSpin(e.target.checked)}
              className="accent-[#2563eb] cursor-pointer"
            />
            Auto-Rotate
          </label>
        </div>
      </div>

      {/* Main */}
      <main className="flex-1 flex overflow-hidden">
        <div ref={viewportRef} className="flex-1 relative bg-white" />

        <div className="w-[320px] flex-shrink-0 bg-white border-l border-[#e2e8f0] p-5 flex flex-col gap-5 overflow-y-auto">
          <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-[10px] p-3.5">
            <div className="text-[11px] font-bold text-[#64748b] uppercase tracking-wider mb-3">Diff Statistikası</div>
            <div className="flex justify-between items-center text-xs py-1">
              <span>V1 Toplam Vertex</span>
              <span className="font-bold font-mono">{statV1?.toLocaleString() ?? "—"}</span>
            </div>
            <div className="flex justify-between items-center text-xs py-1">
              <span>V2 Toplam Vertex</span>
              <span className="font-bold font-mono">{statV2?.toLocaleString() ?? "—"}</span>
            </div>
            <div className="flex justify-between items-center text-xs py-1">
              <span>Dəyişən Vertex (Təxmini)</span>
              <span className="font-bold font-mono text-[#2563eb]">{statChanged?.toLocaleString() ?? "—"}</span>
            </div>
            <div className="flex justify-between items-center text-xs py-1">
              <span>Ümumi Fərq (%)</span>
              <span className="font-bold font-mono text-[#2563eb]">{statPct !== null ? `${statPct}%` : "—"}</span>
            </div>
          </div>

          <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-[10px] p-3.5 flex-1 flex flex-col min-h-0">
            <div className="text-[11px] font-bold text-[#64748b] uppercase tracking-wider mb-3">
              Dəyişmiş Hissələr (Kliklə Yaxınlaş)
            </div>
            <div className="flex flex-col gap-1.5 overflow-y-auto">
              {nodeList.length === 0 ? (
                <div className="text-[#64748b] text-[11px]">Model yüklənməyib.</div>
              ) : (
                nodeList.map((n) => (
                  <div
                    key={n.name}
                    onClick={() => zoomToByName(n.name)}
                    className="px-2.5 py-2 rounded-md bg-white border border-[#e2e8f0] border-l-[3px] border-l-[#2563eb] text-[11px] cursor-pointer flex justify-between items-center hover:border-[#2563eb] hover:bg-[#eff6ff] transition-colors"
                  >
                    <span>{n.name}</span>
                    <b>{n.label}</b>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="h-8 flex-shrink-0 bg-white border-t border-[#e2e8f0] px-6 flex items-center text-[11px] text-[#64748b]">
        {status}
      </footer>
    </div>
  );
}
