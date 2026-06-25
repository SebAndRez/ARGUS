"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CrisisEvent } from "@/types/crisis";
import type { ArgusNormalizedEvent } from "@/types/ingestion";

type GlobeEvent =
  | { kind: "internal"; event: CrisisEvent }
  | { kind: "external"; event: ArgusNormalizedEvent };

interface GlobeMarker {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  severity: "low" | "medium" | "high" | "critical";
  category: string;
  payload: GlobeEvent;
}

interface Props {
  events?: CrisisEvent[];
  demoEvents?: CrisisEvent[];
  externalEvents?: ArgusNormalizedEvent[];
  active?: boolean;
  className?: string;
  onSelectEvent?: (event: CrisisEvent) => void;
  onSelectExternalEvent?: (event: ArgusNormalizedEvent) => void;
  onExitGlobe?: () => void;
}

const GLOBE_RADIUS = 2.45;

const severityColors: Record<GlobeMarker["severity"], number> = {
  low: 0x38bdf8,
  medium: 0xfacc15,
  high: 0xfb923c,
  critical: 0xf43f5e,
};

const normalizeSeverity = (
  value: string | null | undefined
): GlobeMarker["severity"] => {
  const normalized = value?.toLowerCase();
  if (normalized === "critical") return "critical";
  if (normalized === "high") return "high";
  if (normalized === "medium") return "medium";
  return "low";
};

const toFiniteCoordinate = (value: number | null | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const latLngToVector = (latitude: number, longitude: number, radius: number) => {
  const phi = THREE.MathUtils.degToRad(90 - latitude);
  const theta = THREE.MathUtils.degToRad(longitude + 180);

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
};

const createEarthTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#061529");
  gradient.addColorStop(0.5, "#020817");
  gradient.addColorStop(1, "#07111f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(14, 116, 144, 0.38)";
  ctx.strokeStyle = "rgba(103, 232, 249, 0.16)";
  ctx.lineWidth = 2;

  const drawBlob = (points: Array<[number, number]>) => {
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };

  drawBlob([
    [190, 105],
    [265, 120],
    [285, 185],
    [245, 240],
    [290, 330],
    [260, 420],
    [205, 342],
    [170, 260],
    [125, 218],
    [132, 150],
  ]);
  drawBlob([
    [455, 132],
    [540, 112],
    [638, 145],
    [700, 220],
    [665, 310],
    [575, 326],
    [520, 260],
    [432, 255],
    [390, 190],
  ]);
  drawBlob([
    [665, 210],
    [785, 190],
    [890, 250],
    [840, 340],
    [715, 318],
  ]);
  drawBlob([
    [770, 365],
    [895, 374],
    [925, 430],
    [825, 455],
    [740, 430],
  ]);

  ctx.strokeStyle = "rgba(34, 211, 238, 0.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= canvas.width; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

const buildMarkers = (
  events: CrisisEvent[],
  demoEvents: CrisisEvent[],
  externalEvents: ArgusNormalizedEvent[]
) => {
  const internalMarkers = [...events, ...demoEvents]
    .map<GlobeMarker | null>((event) => {
      const latitude = toFiniteCoordinate(event.latitude);
      const longitude = toFiniteCoordinate(event.longitude);
      if (latitude === null || longitude === null) return null;

      return {
        id: event.id,
        title: event.title,
        latitude,
        longitude,
        severity: normalizeSeverity(event.severity),
        category: event.type,
        payload: { kind: "internal", event },
      };
    })
    .filter(Boolean) as GlobeMarker[];

  const externalMarkers = externalEvents
    .map<GlobeMarker | null>((event) => {
      const latitude = toFiniteCoordinate(event.latitude);
      const longitude = toFiniteCoordinate(event.longitude);
      if (latitude === null || longitude === null) return null;

      return {
        id: event.id,
        title: event.title,
        latitude,
        longitude,
        severity: normalizeSeverity(event.severity),
        category: event.sourceName,
        payload: { kind: "external", event },
      };
    })
    .filter(Boolean) as GlobeMarker[];

  return [...internalMarkers, ...externalMarkers].slice(0, 650);
};

export default function GlobeView({
  events = [],
  demoEvents = [],
  externalEvents = [],
  active = true,
  className = "",
  onSelectEvent,
  onSelectExternalEvent,
  onExitGlobe,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const markers = useMemo(
    () => buildMarkers(events, demoEvents, externalEvents),
    [demoEvents, events, externalEvents]
  );
  const markersRef = useRef(markers);
  const selectInternalRef = useRef(onSelectEvent);
  const selectExternalRef = useRef(onSelectExternalEvent);
  const exitGlobeRef = useRef(onExitGlobe);

  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  useEffect(() => {
    selectInternalRef.current = onSelectEvent;
    selectExternalRef.current = onSelectExternalEvent;
    exitGlobeRef.current = onExitGlobe;
  }, [onExitGlobe, onSelectEvent, onSelectExternalEvent]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);

    const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100);
    camera.position.set(0, 0.15, 7);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const root = new THREE.Group();
    root.rotation.set(0.18, -0.72, 0);
    scene.add(root);

    const earthTexture = createEarthTexture();
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS, 96, 64),
      new THREE.MeshPhongMaterial({
        color: 0x082032,
        map: earthTexture ?? undefined,
        emissive: 0x04111f,
        emissiveIntensity: 0.55,
        shininess: 14,
      })
    );
    root.add(earth);

    const wire = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS + 0.012, 48, 32),
      new THREE.MeshBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.08,
        wireframe: true,
      })
    );
    root.add(wire);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS + 0.1, 96, 64),
      new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.06,
        side: THREE.BackSide,
      })
    );
    root.add(atmosphere);

    const markerGroup = new THREE.Group();
    root.add(markerGroup);

    const ambient = new THREE.AmbientLight(0x7dd3fc, 1.3);
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
    keyLight.position.set(4, 2, 5);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x22d3ee, 1.2);
    rimLight.position.set(-3, -1, -4);
    scene.add(rimLight);

    const starsGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(600);
    for (let index = 0; index < starPositions.length; index += 3) {
      const radius = 16 + Math.random() * 10;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[index] = radius * Math.sin(phi) * Math.cos(theta);
      starPositions[index + 1] = radius * Math.cos(phi);
      starPositions[index + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    starsGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(starPositions, 3)
    );
    const stars = new THREE.Points(
      starsGeometry,
      new THREE.PointsMaterial({
        color: 0x7dd3fc,
        size: 0.018,
        transparent: true,
        opacity: 0.75,
      })
    );
    scene.add(stars);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const markerMeshes: THREE.Mesh[] = [];
    let frameId = 0;
    let isDragging = false;
    let movedDuringPointer = false;
    let previousX = 0;
    let previousY = 0;
    let activePointerId: number | null = null;

    const syncMarkers = () => {
      markerGroup.clear();
      markerMeshes.length = 0;

      markersRef.current.forEach((marker) => {
        const color = severityColors[marker.severity];
        const position = latLngToVector(
          marker.latitude,
          marker.longitude,
          GLOBE_RADIUS + 0.045
        );
        const markerMesh = new THREE.Mesh(
          new THREE.SphereGeometry(
            marker.severity === "critical" ? 0.075 : 0.058,
            18,
            18
          ),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.96,
          })
        );
        markerMesh.position.copy(position);
        markerMesh.userData.marker = marker;
        markerGroup.add(markerMesh);
        markerMeshes.push(markerMesh);

        const glow = new THREE.Mesh(
          new THREE.SphereGeometry(
            marker.severity === "critical" ? 0.16 : 0.12,
            18,
            18
          ),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: marker.severity === "critical" ? 0.18 : 0.11,
            depthWrite: false,
          })
        );
        glow.position.copy(position);
        markerGroup.add(glow);
      });
    };

    const resize = () => {
      const { clientWidth, clientHeight } = host;
      const width = Math.max(clientWidth, 1);
      const height = Math.max(clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const selectMarkerAt = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(markerMeshes, false);
      const marker = hits[0]?.object.userData.marker as
        | GlobeMarker
        | undefined;
      if (!marker) return;

      if (marker.payload.kind === "internal") {
        selectInternalRef.current?.(marker.payload.event);
      } else {
        selectExternalRef.current?.(marker.payload.event);
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      activePointerId = event.pointerId;
      isDragging = true;
      movedDuringPointer = false;
      previousX = event.clientX;
      previousY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!isDragging || activePointerId !== event.pointerId) return;
      const deltaX = event.clientX - previousX;
      const deltaY = event.clientY - previousY;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 3) movedDuringPointer = true;
      root.rotation.y += deltaX * 0.006;
      root.rotation.x += deltaY * 0.004;
      root.rotation.x = THREE.MathUtils.clamp(root.rotation.x, -1.1, 1.1);
      previousX = event.clientX;
      previousY = event.clientY;
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (activePointerId !== event.pointerId) return;
      renderer.domElement.releasePointerCapture(event.pointerId);
      isDragging = false;
      activePointerId = null;
      if (!movedDuringPointer) selectMarkerAt(event);
    };

    const render = () => {
      if (active && !isDragging) {
        root.rotation.y += 0.0015;
      }
      wire.rotation.y -= 0.0008;
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(render);
    };

    syncMarkers();
    resize();
    render();

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("resize", resize);

    const markerInterval = window.setInterval(syncMarkers, 750);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearInterval(markerInterval);
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerUp);
      earthTexture?.dispose();
      earth.geometry.dispose();
      (earth.material as THREE.Material).dispose();
      wire.geometry.dispose();
      (wire.material as THREE.Material).dispose();
      atmosphere.geometry.dispose();
      (atmosphere.material as THREE.Material).dispose();
      starsGeometry.dispose();
      (stars.material as THREE.Material).dispose();
      markerGroup.children.forEach((child) => {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material as THREE.Material | undefined;
        material?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [active]);

  return (
    <section className={`argus-orbit relative h-full w-full ${className}`}>
      <div ref={hostRef} className="h-full w-full" aria-label="ARGUS Orbit" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.13),transparent_48%)]" />
      <div className="pointer-events-none absolute left-4 top-4 max-w-[calc(100%-2rem)] border border-cyan-300/20 bg-slate-950/80 px-4 py-3 shadow-xl shadow-black/35 backdrop-blur-xl sm:left-6 sm:top-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-200/80">
          ARGUS Orbit
        </p>
        <h2 className="mt-1 text-lg font-semibold text-white">
          Vista global 3D
        </h2>
        <p className="mt-1 text-xs text-slate-300">
          {markers.length} eventos georreferenciados · arrastre para girar
        </p>
      </div>
      <div className="pointer-events-auto absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-3 border border-white/10 bg-slate-950/82 px-4 py-3 text-xs text-slate-200 shadow-xl shadow-black/35 backdrop-blur-xl sm:bottom-6 sm:left-6 sm:right-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold uppercase tracking-[0.18em] text-cyan-100">
            Global zoom
          </span>
          <span className="text-slate-400">
            Marcadores: bajo / medio / alto / critico
          </span>
        </div>
        <button
          type="button"
          onClick={() => exitGlobeRef.current?.()}
          onPointerUp={(event) => {
            event.stopPropagation();
            exitGlobeRef.current?.();
          }}
          className="min-h-10 border border-cyan-300/35 bg-cyan-400/12 px-3 py-2 text-xs font-bold uppercase text-cyan-100 transition hover:bg-cyan-300/20"
        >
          Volver a mapa 2D
        </button>
      </div>
    </section>
  );
}
