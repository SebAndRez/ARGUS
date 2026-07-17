"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CrisisEvent } from "@/types/crisis";
import type { ArgusEvent } from "@/types/argusEvent";
import type { ArgusNormalizedEvent } from "@/types/ingestion";
import {
  getArgusMarkerColor,
  getArgusMarkerSeverityRank,
  getArgusMarkerSizeRatio,
  normalizeArgusMapSeverity,
  type ArgusMapEventKind,
  type ArgusMapSeverity,
} from "@/lib/mapSymbols/argusMapSymbols";

type GlobeEvent =
  | { kind: "internal"; event: CrisisEvent }
  | { kind: "external"; event: ArgusNormalizedEvent }
  | { kind: "argus"; event: ArgusEvent };

export interface GlobeMarker {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  severity: ArgusMapSeverity;
  kind: ArgusMapEventKind;
  /** Epoch ms used only to rank markers when the entity limit truncates the collection; 0 when the source event carries no usable timestamp. */
  recencyTimestamp: number;
  payload: GlobeEvent;
}

interface GlobeCenter {
  lat: number;
  lng: number;
}

interface Props {
  events?: CrisisEvent[];
  demoEvents?: CrisisEvent[];
  externalEvents?: ArgusNormalizedEvent[];
  argusEvents?: ArgusEvent[];
  active?: boolean;
  className?: string;
  initialCenter?: GlobeCenter;
  returnZoom?: number;
  onSelectEvent?: (event: CrisisEvent) => void;
  onSelectExternalEvent?: (event: ArgusNormalizedEvent) => void;
  onSelectArgusEvent?: (event: ArgusEvent) => void;
  onCenterChange?: (center: GlobeCenter) => void;
  onExitGlobe?: (view: { center: GlobeCenter; zoom?: number }) => void;
}

const GLOBE_RADIUS = 2.45;
const EARTH_TEXTURE_PATH = "/textures/earth/earth_atmos_2048.jpg";
const CLOUD_TEXTURE_PATH = "/textures/earth/earth_clouds_1024.png";
/** Entity cap for the globe scene; when the combined collection exceeds this, markers are ranked by severity then recency (see buildMarkers) rather than cut by arrival order. */
const GLOBE_ENTITY_LIMIT = 650;
/** World-unit anchor for the largest ("critical") marker. Other severities scale down from this via the shared severity->size ratio instead of a second size table. */
const GLOBE_MARKER_CRITICAL_WORLD_SIZE = 0.078;

const getGlobeMarkerWorldSize = (severity: ArgusMapSeverity) =>
  GLOBE_MARKER_CRITICAL_WORLD_SIZE * getArgusMarkerSizeRatio(severity);

const toFiniteCoordinate = (value: number | null | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getInternalKind = (event: CrisisEvent): ArgusMapEventKind => {
  const category = event.category?.toLowerCase() ?? "";
  if (event.type === "REPORT") return "citizen_report";
  if (event.type === "SOS") return "force_report";
  if (
    category.includes("tornado") ||
    category.includes("tromba") ||
    category.includes("waterspout") ||
    category.includes("viento extremo") ||
    category.includes("severe_wind")
  ) {
    return "tornado";
  }
  if (category.includes("colapso") || category.includes("collapse") || category.includes("derrumbe")) {
    return "structural_collapse";
  }
  if (category.includes("fire")) return "fire";
  if (category.includes("weather")) return "weather";
  return "risk_assessment";
};

const getExternalKind = (event: ArgusNormalizedEvent): ArgusMapEventKind => {
  if (event.category === "tornado" || event.category === "waterspout" || event.category === "severe_wind") {
    return "tornado";
  }
  if (
    event.category === "structural_collapse" ||
    event.category === "roof_collapse" ||
    event.category === "building_collapse"
  ) {
    return "structural_collapse";
  }
  if (event.sourceId === "usgs_earthquake" || event.category === "earthquake") {
    return "earthquake";
  }
  if (event.sourceId === "noaa_tsunami" || event.category === "tsunami") {
    return "tsunami";
  }
  if (
    event.sourceId === "nasa-eonet" ||
    event.sourceId === "nasa_firms" ||
    event.category === "wildfire" ||
    event.category === "thermal_anomaly"
  ) {
    return "fire";
  }
  if (["weather", "cyclone", "flood"].includes(event.category)) return "weather";
  return "official_source";
};

const getArgusKind = (event: ArgusEvent): ArgusMapEventKind => {
  if (event.eventType === "EARTHQUAKE") return "earthquake";
  if (event.eventType === "TSUNAMI") return "tsunami";
  if (event.eventType === "WILDFIRE") return "fire";
  if (event.eventType === "TORNADO" || event.eventType === "WATERSPOUT" || event.eventType === "SEVERE_WIND") return "tornado";
  if (event.eventType === "LANDSLIDE" || event.eventType === "FLOOD" || event.eventType === "HEAVY_RAIN") return "weather";
  return event.sourceType === "official" ? "official_source" : "risk_assessment";
};

const argusCoordinates = (event: ArgusEvent) => {
  if (event.geometry.type === "point") return event.geometry.coordinates;
  if (event.geometry.type === "administrative_area" || event.geometry.type === "region_reference") return event.geometry.anchor;
  if (event.geometry.type === "polygon" || event.geometry.type === "route") return event.geometry.coordinates[0] ?? null;
  return null;
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

const vectorToLatLng = (vector: THREE.Vector3): GlobeCenter => {
  const normalized = vector.clone().normalize();
  const latitude = THREE.MathUtils.radToDeg(Math.asin(normalized.y));
  const longitude = -THREE.MathUtils.radToDeg(
    Math.atan2(normalized.z, normalized.x)
  );
  const wrappedLongitude = ((((longitude + 180) % 360) + 360) % 360) - 180;

  return {
    lat: THREE.MathUtils.clamp(latitude, -85, 85),
    lng: wrappedLongitude,
  };
};

const isValidCenter = (center: GlobeCenter | undefined): center is GlobeCenter =>
  Boolean(
    center &&
      Number.isFinite(center.lat) &&
      Number.isFinite(center.lng) &&
      center.lat >= -90 &&
      center.lat <= 90
  );

const loadTexture = (loader: THREE.TextureLoader, path: string) => {
  const texture = loader.load(path);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
};

const createTacticalGrid = () => {
  const grid = new THREE.Group();
  const material = new THREE.LineBasicMaterial({
    color: 0x67e8f9,
    transparent: true,
    opacity: 0.035,
    depthWrite: false,
  });
  const radius = GLOBE_RADIUS + 0.018;
  const segments = 192;

  for (let latitude = -60; latitude <= 60; latitude += 30) {
    const points: THREE.Vector3[] = [];
    for (let step = 0; step <= segments; step += 1) {
      points.push(latLngToVector(latitude, (step / segments) * 360 - 180, radius));
    }
    grid.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), material));
  }

  for (let longitude = -150; longitude <= 180; longitude += 30) {
    const points: THREE.Vector3[] = [];
    for (let step = 0; step <= segments; step += 1) {
      points.push(latLngToVector((step / segments) * 180 - 90, longitude, radius));
    }
    grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  }

  return grid;
};

const createMarkerGeometry = (marker: GlobeMarker) => {
  const size = getGlobeMarkerWorldSize(marker.severity);
  switch (marker.kind) {
    case "earthquake":
      return new THREE.OctahedronGeometry(size * 1.15, 0);
    case "tsunami":
      return new THREE.ConeGeometry(size * 1.4, size * 2.4, 3);
    case "fire":
      return new THREE.ConeGeometry(size * 1.05, size * 2.8, 8);
    case "official_source":
      return new THREE.BoxGeometry(size * 1.5, size * 1.5, size * 1.5);
    case "live_camera":
      return new THREE.BoxGeometry(size * 1.7, size * 1.15, size * 1.15);
    case "force_report":
      return new THREE.ConeGeometry(size * 1.25, size * 2.1, 5);
    default:
      return new THREE.SphereGeometry(size, 14, 14);
  }
};

const toRecencyTimestamp = (value: string | null | undefined) => {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

export interface GlobeMarkerBuildResult {
  markers: GlobeMarker[];
  /** Entities dropped by the explicit severity+recency ranking below GLOBE_ENTITY_LIMIT, never by arrival order. */
  omittedCount: number;
}

export const buildMarkers = (
  events: CrisisEvent[],
  demoEvents: CrisisEvent[],
  externalEvents: ArgusNormalizedEvent[],
  argusEvents: ArgusEvent[]
): GlobeMarkerBuildResult => {
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
        severity: normalizeArgusMapSeverity(event.severity),
        kind: getInternalKind(event),
        recencyTimestamp: toRecencyTimestamp(event.updatedAt ?? event.createdAt),
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
        severity: normalizeArgusMapSeverity(event.severity),
        kind: getExternalKind(event),
        recencyTimestamp: toRecencyTimestamp(event.updatedAt ?? event.occurredAt),
        payload: { kind: "external", event },
      };
    })
    .filter(Boolean) as GlobeMarker[];

  const argusMarkers = argusEvents
    .map<GlobeMarker | null>((event) => {
      const coordinates = argusCoordinates(event);
      if (!coordinates) return null;
      const latitude = toFiniteCoordinate(coordinates[0]);
      const longitude = toFiniteCoordinate(coordinates[1]);
      if (latitude === null || longitude === null) return null;

      return {
        id: event.id,
        title: event.title,
        latitude,
        longitude,
        severity: normalizeArgusMapSeverity(event.severity),
        kind: getArgusKind(event),
        recencyTimestamp: toRecencyTimestamp(event.detectedAt),
        payload: { kind: "argus", event },
      };
    })
    .filter(Boolean) as GlobeMarker[];

  // Explicit truncation policy (severity rank desc, then recency desc) instead
  // of cutting the combined collection by concatenation/arrival order.
  const ranked = [...argusMarkers, ...internalMarkers, ...externalMarkers].sort(
    (a, b) =>
      getArgusMarkerSeverityRank(b.severity) - getArgusMarkerSeverityRank(a.severity) ||
      b.recencyTimestamp - a.recencyTimestamp
  );

  return {
    markers: ranked.slice(0, GLOBE_ENTITY_LIMIT),
    omittedCount: Math.max(0, ranked.length - GLOBE_ENTITY_LIMIT),
  };
};

export default function GlobeView({
  events = [],
  demoEvents = [],
  externalEvents = [],
  argusEvents = [],
  active = true,
  className = "",
  initialCenter,
  returnZoom,
  onSelectEvent,
  onSelectExternalEvent,
  onSelectArgusEvent,
  onCenterChange,
  onExitGlobe,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const { markers, omittedCount } = useMemo(
    () => buildMarkers(events, demoEvents, externalEvents, argusEvents),
    [argusEvents, demoEvents, events, externalEvents]
  );
  const markersRef = useRef(markers);
  const selectInternalRef = useRef(onSelectEvent);
  const selectExternalRef = useRef(onSelectExternalEvent);
  const selectArgusRef = useRef(onSelectArgusEvent);
  const centerChangeRef = useRef(onCenterChange);
  const exitGlobeRef = useRef(onExitGlobe);
  const visibleCenterRef = useRef<GlobeCenter>(
    isValidCenter(initialCenter) ? initialCenter : { lat: 0, lng: 0 }
  );
  /** Set by the scene-mount effect below; lets marker updates apply incrementally (by canonical ID) without tearing down and recreating the whole Three.js scene. */
  const applyMarkerUpdateRef = useRef<((markers: GlobeMarker[]) => void) | null>(null);

  useEffect(() => {
    markersRef.current = markers;
    applyMarkerUpdateRef.current?.(markers);
  }, [markers]);

  useEffect(() => {
    selectInternalRef.current = onSelectEvent;
    selectExternalRef.current = onSelectExternalEvent;
    selectArgusRef.current = onSelectArgusEvent;
    centerChangeRef.current = onCenterChange;
    exitGlobeRef.current = onExitGlobe;
  }, [onCenterChange, onExitGlobe, onSelectArgusEvent, onSelectEvent, onSelectExternalEvent]);

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
    const cameraFacingNormal = camera.position.clone().normalize();
    const entryCenter = isValidCenter(initialCenter)
      ? initialCenter
      : visibleCenterRef.current;
    const entryVector = latLngToVector(entryCenter.lat, entryCenter.lng, 1).normalize();
    root.quaternion.setFromUnitVectors(entryVector, cameraFacingNormal);
    scene.add(root);

    const textureLoader = new THREE.TextureLoader();
    const earthTexture = loadTexture(textureLoader, EARTH_TEXTURE_PATH);
    const cloudTexture = loadTexture(textureLoader, CLOUD_TEXTURE_PATH);
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS, 96, 64),
      new THREE.MeshStandardMaterial({
        color: 0xb8c7d8,
        map: earthTexture,
        roughness: 0.88,
        metalness: 0,
      })
    );
    root.add(earth);

    const cloudLayer = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS + 0.026, 96, 64),
      new THREE.MeshBasicMaterial({
        map: cloudTexture,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      })
    );
    root.add(cloudLayer);

    const tacticalGrid = createTacticalGrid();
    root.add(tacticalGrid);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS + 0.09, 96, 64),
      new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.045,
        side: THREE.BackSide,
      })
    );
    root.add(atmosphere);

    const markerGroup = new THREE.Group();
    root.add(markerGroup);

    const ambient = new THREE.AmbientLight(0x7dd3fc, 0.18);
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.1);
    keyLight.position.set(4, 2, 5);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x22d3ee, 0.7);
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
    let lastCenterUpdate = 0;

    const updateVisibleCenter = (force = false) => {
      // The visible map center is the camera-facing globe normal in local coordinates.
      const localCenter = cameraFacingNormal
        .clone()
        .applyQuaternion(root.quaternion.clone().invert());
      const nextCenter = vectorToLatLng(localCenter);
      visibleCenterRef.current = nextCenter;

      const now = performance.now();
      if (force || now - lastCenterUpdate > 120) {
        centerChangeRef.current?.(nextCenter);
        lastCenterUpdate = now;
      }

      return nextCenter;
    };

    // Incremental marker sync keyed by canonical ID: only entities that are
    // new, removed, or visually changed (kind/severity/position) touch the
    // scene graph. Previously this rebuilt every mesh unconditionally every
    // 750ms regardless of whether the data had changed at all.
    type MarkerMeshEntry = { mesh: THREE.Mesh; glow: THREE.Mesh; visualKey: string };
    const meshIndex = new Map<string, MarkerMeshEntry>();

    const markerVisualKey = (marker: GlobeMarker) =>
      `${marker.kind}|${marker.severity}|${marker.latitude.toFixed(4)}|${marker.longitude.toFixed(4)}`;

    const disposeEntry = (entry: MarkerMeshEntry) => {
      markerGroup.remove(entry.mesh, entry.glow);
      entry.mesh.geometry.dispose();
      (entry.mesh.material as THREE.Material).dispose();
      entry.glow.geometry.dispose();
      (entry.glow.material as THREE.Material).dispose();
    };

    const createEntry = (marker: GlobeMarker): MarkerMeshEntry => {
      const color = getArgusMarkerColor(marker.severity);
      const position = latLngToVector(
        marker.latitude,
        marker.longitude,
        GLOBE_RADIUS + 0.045
      );

      const mesh = new THREE.Mesh(
        createMarkerGeometry(marker),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.96 })
      );
      mesh.position.copy(position);
      mesh.userData.marker = marker;

      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(marker.severity === "critical" ? 0.15 : 0.105, 18, 18),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: marker.severity === "critical" ? 0.18 : 0.11,
          depthWrite: false,
        })
      );
      glow.position.copy(position);

      markerGroup.add(mesh, glow);
      return { mesh, glow, visualKey: markerVisualKey(marker) };
    };

    const applyMarkerUpdate = (nextMarkers: GlobeMarker[]) => {
      const nextIds = new Set(nextMarkers.map((marker) => marker.id));

      meshIndex.forEach((entry, id) => {
        if (!nextIds.has(id)) {
          disposeEntry(entry);
          meshIndex.delete(id);
        }
      });

      nextMarkers.forEach((marker) => {
        const visualKey = markerVisualKey(marker);
        const existing = meshIndex.get(marker.id);
        if (existing && existing.visualKey === visualKey) {
          // Unchanged position/kind/severity: reuse the mesh, only refresh
          // the payload reference (title/detail may still have changed).
          existing.mesh.userData.marker = marker;
          return;
        }
        if (existing) disposeEntry(existing);
        meshIndex.set(marker.id, createEntry(marker));
      });

      markerMeshes.length = 0;
      meshIndex.forEach((entry) => markerMeshes.push(entry.mesh));
    };

    applyMarkerUpdateRef.current = applyMarkerUpdate;

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
      } else if (marker.payload.kind === "external") {
        selectExternalRef.current?.(marker.payload.event);
      } else {
        selectArgusRef.current?.(marker.payload.event);
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
      updateVisibleCenter();
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
        updateVisibleCenter();
      }
      tacticalGrid.rotation.y -= 0.0002;
      cloudLayer.rotation.y += 0.00035;
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(render);
    };

    applyMarkerUpdate(markersRef.current);
    resize();
    updateVisibleCenter(true);
    render();

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("resize", resize);

    return () => {
      applyMarkerUpdateRef.current = null;
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerUp);
      earthTexture.dispose();
      cloudTexture.dispose();
      earth.geometry.dispose();
      (earth.material as THREE.Material).dispose();
      cloudLayer.geometry.dispose();
      (cloudLayer.material as THREE.Material).dispose();
      tacticalGrid.traverse((child) => {
        const line = child as THREE.Line;
        line.geometry?.dispose();
      });
      const gridMaterial = (tacticalGrid.children[0] as THREE.Line | undefined)
        ?.material as THREE.Material | undefined;
      gridMaterial?.dispose();
      atmosphere.geometry.dispose();
      (atmosphere.material as THREE.Material).dispose();
      starsGeometry.dispose();
      (stars.material as THREE.Material).dispose();
      meshIndex.forEach((entry) => disposeEntry(entry));
      meshIndex.clear();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [active, initialCenter, returnZoom]);

  return (
    <section className={`argus-orbit relative h-full w-full ${className}`}>
      <div ref={hostRef} className="h-full w-full" aria-label="ARGUS Orbit" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.13),transparent_48%)]" />
      <div className="argus-orbit-info-panel orbit-info-card pointer-events-none absolute max-w-[calc(100%-2rem)] border border-cyan-300/20 bg-slate-950/80 px-4 py-3 shadow-xl shadow-black/35 backdrop-blur-xl">
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-200/80">
          ARGUS Orbit
        </p>
        <h2 className="mt-1 text-lg font-semibold text-white">
          Vista global 3D
        </h2>
        <p className="mt-1 text-xs text-slate-300">
          {markers.length} eventos georreferenciados
          {omittedCount > 0
            ? ` · ${omittedCount} omitidos por límite de vista (prioridad: severidad, luego recencia)`
            : ""}{" "}
          · arrastre para girar
        </p>
      </div>
      <div className="argus-orbit-zoom-panel orbit-global-zoom-card pointer-events-auto absolute flex flex-col gap-2 border border-white/10 bg-slate-950/82 px-3 py-3 text-xs text-slate-200 shadow-xl shadow-black/35 backdrop-blur-xl">
        <div className="grid gap-1">
          <span className="font-semibold uppercase tracking-[0.18em] text-cyan-100">
            Global zoom
          </span>
          <span className="text-slate-400">
            Marcadores: info / bajo / medio / alto / critico
          </span>
        </div>
        <button
          type="button"
          onClick={() =>
            exitGlobeRef.current?.({
              center: visibleCenterRef.current,
              zoom: returnZoom,
            })
          }
          onPointerUp={(event) => {
            event.stopPropagation();
            exitGlobeRef.current?.({
              center: visibleCenterRef.current,
              zoom: returnZoom,
            });
          }}
          className="min-h-9 border border-cyan-300/35 bg-cyan-400/12 px-3 py-2 text-xs font-bold uppercase text-cyan-100 transition hover:bg-cyan-300/20"
        >
          Volver a mapa 2D
        </button>
      </div>
    </section>
  );
}
