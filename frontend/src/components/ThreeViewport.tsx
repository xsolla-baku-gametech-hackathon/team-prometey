'use client';

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DiffPayload } from "@/types";
import { getModelFileUrl } from "@/lib/api";
import { 
  RotateCcw, 
  Grid, 
  Eye, 
  Layers, 
  Compass, 
  Maximize2,
  Sparkles,
  Zap
} from "lucide-react";

interface ThreeViewportProps {
  versionAId: string | null;
  versionBId: string | null;
  diffPayload: DiffPayload | null;
}

export const ThreeViewport: React.FC<ThreeViewportProps> = ({
  versionAId,
  versionBId,
  diffPayload,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<"diff" | "versionB" | "versionA" | "ghost">("diff");
  const [isWireframe, setIsWireframe] = useState(false);
  const [isAutoRotate, setIsAutoRotate] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [isLoadingModel, setIsLoadingModel] = useState(false);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);

  const modelARef = useRef<THREE.Group | null>(null);
  const modelBRef = useRef<THREE.Group | null>(null);
  const diffModelRef = useRef<THREE.Group | null>(null);

  // Initialize Scene
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
    container.innerHTML = "";
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x1a202c, 0.6);
    scene.add(hemi);

    const dir1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dir1.position.set(5, 10, 7);
    scene.add(dir1);

    const dir2 = new THREE.DirectionalLight(0x3d7fff, 0.5);
    dir2.position.set(-5, -5, -5);
    scene.add(dir2);

    // Grid
    const grid = new THREE.GridHelper(12, 24, 0x3d7fff, 0x222834);
    grid.position.y = -0.01;
    scene.add(grid);
    gridRef.current = grid;

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (controlsRef.current) {
        controlsRef.current.autoRotate = isAutoRotate;
        controlsRef.current.autoRotateSpeed = 2.0;
        controlsRef.current.update();
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
      renderer.dispose();
    };
  }, []);

  // Update Grid
  useEffect(() => {
    if (gridRef.current) gridRef.current.visible = showGrid;
  }, [showGrid]);

  // Load Models when diff changes
  useEffect(() => {
    if (!versionAId || !versionBId || !diffPayload || !sceneRef.current) return;
    const scene = sceneRef.current;
    setIsLoadingModel(true);

    // Clean up past models
    if (modelARef.current) scene.remove(modelARef.current);
    if (modelBRef.current) scene.remove(modelBRef.current);
    if (diffModelRef.current) scene.remove(diffModelRef.current);
    modelARef.current = null;
    modelBRef.current = null;
    diffModelRef.current = null;

    const loader = new GLTFLoader();
    const urlA = getModelFileUrl(versionAId);
    const urlB = getModelFileUrl(versionBId);

    const meshDiffByName: Record<string, any> = {};
    diffPayload.geometry.meshes.forEach((m) => {
      meshDiffByName[m.mesh_name] = m;
    });

    // Load Version B
    loader.load(urlB, (gltfB) => {
      modelBRef.current = gltfB.scene;

      // Clone for diff coloring
      const diffScene = gltfB.scene.clone(true);
      diffModelRef.current = diffScene;

      diffScene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          const meshDiff = meshDiffByName[mesh.name] || meshDiffByName[(mesh.geometry as any)?.name];
          applyDiffColoring(mesh, meshDiff);
        }
      });

      // Fit camera
      const box = new THREE.Box3().setFromObject(gltfB.scene);
      const size = box.getSize(new THREE.Vector3()).length() || 2;
      const center = box.getCenter(new THREE.Vector3());

      if (controlsRef.current && cameraRef.current) {
        controlsRef.current.target.copy(center);
        cameraRef.current.position.copy(center).add(new THREE.Vector3(size, size * 0.8, size).multiplyScalar(0.7));
        cameraRef.current.near = size / 200;
        cameraRef.current.far = size * 200;
        cameraRef.current.updateProjectionMatrix();
      }

      // Load Version A
      loader.load(urlA, (gltfA) => {
        modelARef.current = gltfA.scene;
        setIsLoadingModel(false);
        updateActiveSceneModels();
      });

      setIsLoadingModel(false);
      updateActiveSceneModels();
    });
  }, [versionAId, versionBId, diffPayload]);

  // Update view mode & wireframe
  const updateActiveSceneModels = () => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (modelARef.current) scene.remove(modelARef.current);
    if (modelBRef.current) scene.remove(modelBRef.current);
    if (diffModelRef.current) scene.remove(diffModelRef.current);

    if (viewMode === "diff" && diffModelRef.current) {
      scene.add(diffModelRef.current);
    } else if (viewMode === "versionB" && modelBRef.current) {
      scene.add(modelBRef.current);
    } else if (viewMode === "versionA" && modelARef.current) {
      scene.add(modelARef.current);
    } else if (viewMode === "ghost") {
      if (diffModelRef.current) scene.add(diffModelRef.current);
      if (modelARef.current) {
        modelARef.current.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            (obj as THREE.Mesh).material = new THREE.MeshBasicMaterial({
              color: 0x3d7fff,
              wireframe: true,
              transparent: true,
              opacity: 0.35,
            });
          }
        });
        scene.add(modelARef.current);
      }
    }

    // Apply wireframe
    [modelARef.current, modelBRef.current, diffModelRef.current].forEach((m) => {
      if (!m) return;
      m.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh && viewMode !== "ghost") {
          const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
          if (mat) mat.wireframe = isWireframe;
        }
      });
    });
  };

  useEffect(() => {
    updateActiveSceneModels();
  }, [viewMode, isWireframe]);

  const applyDiffColoring = (mesh: THREE.Mesh, meshDiff: any) => {
    const geom = mesh.geometry;
    const count = geom.attributes.position.count;
    const colors = new Float32Array(count * 3);

    const unchangedColor = new THREE.Color(0x6b7280);
    const changedColor = new THREE.Color(0xf59e0b); // Vibrant amber heat
    const changedSet = meshDiff && !meshDiff.unchanged
      ? new Set(meshDiff.changed_vertex_indices || [])
      : new Set();

    for (let i = 0; i < count; i++) {
      const col = changedSet.has(i) ? changedColor : unchangedColor;
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    mesh.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.5,
      metalness: 0.1,
      wireframe: isWireframe,
    });
  };

  const resetCamera = () => {
    if (controlsRef.current) controlsRef.current.reset();
  };

  return (
    <div className="relative flex-1 h-full w-full bg-[radial-gradient(circle_at_50%_50%,#151922_0%,#0a0c10_100%)] overflow-hidden">
      {/* Viewport Toolbar */}
      <div className="absolute top-3.5 left-1/2 -translate-x-1/2 flex gap-1 bg-[#13161c]/85 backdrop-blur-md border border-[#293040] rounded-full p-1 shadow-2xl z-10">
        <button
          onClick={() => setViewMode("diff")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all ${
            viewMode === "diff"
              ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
              : "text-gray-400 hover:text-white"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" /> 3D Diff Mode
          </span>
        </button>
        <button
          onClick={() => setViewMode("versionB")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all ${
            viewMode === "versionB"
              ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Target (B)
        </button>
        <button
          onClick={() => setViewMode("versionA")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all ${
            viewMode === "versionA"
              ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Base (A)
        </button>
        <button
          onClick={() => setViewMode("ghost")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all ${
            viewMode === "ghost"
              ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Ghost Overlay
        </button>
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

      {/* Legend */}
      {diffPayload && (
        <div className="absolute bottom-4 left-4 bg-[#13161c]/90 backdrop-blur-md border border-[#293040] rounded-lg p-3 text-xs shadow-xl pointer-events-none z-10 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-gray-300">
            <span className="w-3 h-3 rounded bg-[#6b7280]" /> Unchanged Vertices
          </div>
          <div className="flex items-center gap-2 text-gray-300">
            <span className="w-3 h-3 rounded bg-[#f59e0b] shadow-[0_0_6px_#f59e0b]" /> Displaced / Changed
          </div>
          <div className="flex items-center gap-2 text-gray-300">
            <span className="w-3 h-3 rounded bg-[#10b981] shadow-[0_0_6px_#10b981]" /> Added Geometry
          </div>
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
