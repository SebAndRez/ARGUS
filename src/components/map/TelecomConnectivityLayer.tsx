"use client";

import { useEffect, useRef } from "react";
import { fetchCriticalPois } from "@/lib/criticalPoi/criticalPoiClient";
import { createConnectivityBadgeDivIcon, type TelecomConnectivityBadgeInput } from "@/components/map/TelecomConnectivityMarker";
import { createCriticalPoiDivIcon } from "@/components/map/CriticalPoiMarker";
import type { CriticalPoiWithOperationalStatus } from "@/lib/criticalPoi/shelterOperationalStatusTypes";

/**
 * Capa "Conectividad de emergencia" (spec ARGUS v1.0.3.6 §11): insignias de
 * estado regional/comunal (centroide, `/api/telecom-connectivity/status`,
 * tabla pequena mantenida manualmente — un solo fetch, sin bbox) + puntos de
 * conectividad temporal (carro movil/wifi/carga, categorias `telecom_*` de
 * `CriticalPoi`, reutilizando `fetchCriticalPois` — mismo cliente/cache que
 * `CriticalPoiLayer.tsx`, sin introducir un segundo mecanismo de fetch).
 * Nota conocida: los puntos `telecom_*` son prioridad P3, por lo que
 * heredan la misma regla de visibilidad por zoom que el resto de P3 en
 * `/api/critical-pois` (>= zoom 14) aunque este layer este activo a un zoom
 * menor — ver `prioritiesVisibleAtZoom`.
 */

interface Props {
  map: import("leaflet").Map | null;
  leaflet: typeof import("leaflet") | null;
  visible: boolean;
}

const TELECOM_CATEGORIES = new Set(["telecom_mobile_unit", "telecom_emergency_wifi", "telecom_charging_point"]);
const DEBOUNCE_MS = 400;

export default function TelecomConnectivityLayer({ map, leaflet, visible }: Props) {
  const layerGroupRef = useRef<import("leaflet").LayerGroup | null>(null);
  const debounceRef = useRef<number | null>(null);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    if (!map || !leaflet) return;
    const layerGroup = leaflet.layerGroup().addTo(map);
    layerGroupRef.current = layerGroup;
    return () => {
      map.removeLayer(layerGroup);
      layerGroupRef.current = null;
    };
  }, [map, leaflet]);

  useEffect(() => {
    if (!map || !leaflet) return;
    const layerGroup = layerGroupRef.current;
    if (!layerGroup) return;

    if (!visible) {
      layerGroup.clearLayers();
      return;
    }

    const renderRegionBadges = (statuses: TelecomConnectivityBadgeInput[]) => {
      statuses.forEach((status) => {
        if (status.centroidLatitude === null || status.centroidLongitude === null) return;
        const icon = leaflet.divIcon(createConnectivityBadgeDivIcon(status));
        leaflet.marker([status.centroidLatitude, status.centroidLongitude], { icon }).addTo(layerGroup);
      });
    };

    const renderPoints = (pois: CriticalPoiWithOperationalStatus[]) => {
      pois
        .filter((poi) => TELECOM_CATEGORIES.has(poi.category))
        .forEach((poi) => {
          const icon = leaflet.divIcon(createCriticalPoiDivIcon(poi));
          leaflet.marker([poi.lat, poi.lng], { icon, title: poi.name }).addTo(layerGroup);
        });
    };

    const load = async () => {
      const seq = ++requestSeqRef.current;
      const bounds = map.getBounds();
      const zoom = map.getZoom();

      const [statusResponse, poiResponse] = await Promise.all([
        fetch("/api/telecom-connectivity/status", { signal: AbortSignal.timeout(15_000) })
          .then((response) => response.json())
          .catch(() => ({ statuses: [] })),
        fetchCriticalPois(
          { south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast() },
          zoom
        ),
      ]);

      if (seq !== requestSeqRef.current) return;
      layerGroup.clearLayers();
      renderRegionBadges(statusResponse.statuses ?? []);
      renderPoints(poiResponse.pois ?? []);
    };

    load();

    const scheduleLoad = () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(load, DEBOUNCE_MS);
    };

    map.on("moveend", scheduleLoad);
    return () => {
      map.off("moveend", scheduleLoad);
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [map, leaflet, visible]);

  return null;
}
