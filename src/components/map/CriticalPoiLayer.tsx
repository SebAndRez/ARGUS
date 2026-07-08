"use client";

import { useEffect, useRef } from "react";
import { fetchCriticalPois, type CriticalCityAggregate } from "@/lib/criticalPoi/criticalPoiClient";
import { getClusterConfigForPriority, isCriticalCluster, shouldShowCityAggregate } from "@/lib/criticalPoi/criticalPoiPriority";
import type { CriticalPoi, CriticalPriority } from "@/lib/criticalPoi/criticalPoiTypes";
import {
  createCriticalCityAggregateDivIcon,
  createCriticalClusterDivIcon,
  createCriticalPoiDivIcon,
} from "@/components/map/CriticalPoiMarker";

/**
 * Capa persistente de infraestructura critica (P0-P3). Separada de
 * `PoiLayer.tsx` (P4 generico, comercio, siempre efimero/en vivo) a
 * proposito: esta capa lee de la tabla `CriticalPoi` (via
 * `/api/critical-pois`), no de Overpass en vivo, y el clustering NUNCA debe
 * esconder P0/P1 detras de un numero generico (ver
 * `criticalPoiPriority.ts` -> `getClusterConfigForPriority`).
 *
 * Reglas de zoom (seccion 7 del pedido):
 * - zoom < 10: agregados por ciudad, solo P0/P1.
 * - 10-13: P0/P1 individuales.
 * - 14-15: + P2.
 * - >=16: + P3 (P4 lo sigue mostrando PoiLayer aparte).
 */

interface Props {
  map: import("leaflet").Map | null;
  leaflet: typeof import("leaflet") | null;
  visible: boolean;
  selectedPoiId?: string | null;
  onPoiSelect?: (poi: CriticalPoi) => void;
}

interface PoiCluster {
  id: string;
  lat: number;
  lng: number;
  pois: CriticalPoi[];
  priorityBucket: CriticalPriority;
}

type RenderItem = CriticalPoi | PoiCluster | CriticalCityAggregate;

const DEBOUNCE_MS = 400;

function isPoiCluster(item: RenderItem): item is PoiCluster {
  return "pois" in item;
}

function isCityAggregate(item: RenderItem): item is CriticalCityAggregate {
  return "countsByCategory" in item;
}

function clusterBucket(pois: CriticalPoi[], bucketPriority: CriticalPriority, zoom: number): Array<CriticalPoi | PoiCluster> {
  if (pois.length === 0) return [];
  const config = getClusterConfigForPriority(bucketPriority);
  if (!config.clusterEligible || pois.length <= config.clusterThreshold) return pois;

  const cellSize = zoom >= 17 ? config.cellSizeDeg / 2 : config.cellSizeDeg;
  const cells = new Map<string, CriticalPoi[]>();
  pois.forEach((poi) => {
    const key = `${Math.floor(poi.lat / cellSize)}:${Math.floor(poi.lng / cellSize)}`;
    const cell = cells.get(key) ?? [];
    cell.push(poi);
    cells.set(key, cell);
  });

  return Array.from(cells.entries()).map(([key, cellPois]) => {
    if (cellPois.length === 1) return cellPois[0];
    const lat = cellPois.reduce((sum, poi) => sum + poi.lat, 0) / cellPois.length;
    const lng = cellPois.reduce((sum, poi) => sum + poi.lng, 0) / cellPois.length;
    return { id: `critical-cluster-${bucketPriority}-${key}`, lat, lng, pois: cellPois, priorityBucket: bucketPriority };
  });
}

/** P0 y P1 se agrupan juntos (son la misma "unidad critica" para efectos de cluster especial); P2 y P3 se agrupan cada uno por separado. */
function clusterCriticalPois(pois: CriticalPoi[], zoom: number): Array<CriticalPoi | PoiCluster> {
  const p0p1 = pois.filter((poi) => poi.priority === "P0" || poi.priority === "P1");
  const p2 = pois.filter((poi) => poi.priority === "P2");
  const p3 = pois.filter((poi) => poi.priority === "P3");

  return [
    ...clusterBucket(p0p1, "P1", zoom),
    ...clusterBucket(p2, "P2", zoom),
    ...clusterBucket(p3, "P3", zoom),
  ];
}

export default function CriticalPoiLayer({ map, leaflet, visible, selectedPoiId, onPoiSelect }: Props) {
  const layerGroupRef = useRef<import("leaflet").LayerGroup | null>(null);
  const debounceRef = useRef<number | null>(null);
  const requestSeqRef = useRef(0);
  const itemsRef = useRef<RenderItem[]>([]);
  const selectedPoiIdRef = useRef<string | null | undefined>(selectedPoiId);
  const onPoiSelectRef = useRef(onPoiSelect);
  const renderRef = useRef<() => void>(() => {});

  useEffect(() => {
    selectedPoiIdRef.current = selectedPoiId;
    onPoiSelectRef.current = onPoiSelect;
    renderRef.current();
  }, [selectedPoiId, onPoiSelect]);

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

    const renderItems = () => {
      layerGroup.clearLayers();
      itemsRef.current.forEach((item) => {
        if (isCityAggregate(item)) {
          const icon = leaflet.divIcon(createCriticalCityAggregateDivIcon(item.count));
          const marker = leaflet.marker([item.lat, item.lng], { icon }).addTo(layerGroup);
          marker.bindTooltip(`${item.count} instalaciones críticas (P0/P1) · hacer zoom para ver el detalle`, {
            direction: "top",
            offset: [0, -18],
          });
          marker.on("click", () => {
            map.flyTo([item.lat, item.lng], 11, { duration: 0.6 });
          });
          return;
        }

        if (isPoiCluster(item)) {
          const icon = leaflet.divIcon(createCriticalClusterDivIcon(item.pois.length, isCriticalCluster([item.priorityBucket])));
          const marker = leaflet.marker([item.lat, item.lng], { icon }).addTo(layerGroup);
          marker.bindTooltip(`${item.pois.length} puntos críticos · click para acercar`, { direction: "top", offset: [0, -18] });
          marker.on("click", () => {
            map.flyTo([item.lat, item.lng], Math.min(map.getZoom() + 2, 19), { duration: 0.5 });
          });
          return;
        }

        const icon = leaflet.divIcon(createCriticalPoiDivIcon(item, { selected: item.id === selectedPoiIdRef.current }));
        const marker = leaflet.marker([item.lat, item.lng], { icon, title: item.name }).addTo(layerGroup);
        marker.on("click", () => onPoiSelectRef.current?.(item));
      });
    };
    renderRef.current = renderItems;

    if (!visible) {
      itemsRef.current = [];
      layerGroup.clearLayers();
      return;
    }

    const load = async () => {
      const zoom = map.getZoom();
      const bounds = map.getBounds();
      if (bounds.getWest() === bounds.getEast() || bounds.getSouth() === bounds.getNorth()) return;

      const seq = ++requestSeqRef.current;
      const { pois, cityAggregates } = await fetchCriticalPois(
        { south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast() },
        zoom
      );
      if (seq !== requestSeqRef.current) return;

      itemsRef.current = shouldShowCityAggregate(zoom) ? cityAggregates : clusterCriticalPois(pois, zoom);
      renderItems();
    };

    const scheduleLoad = () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(load, DEBOUNCE_MS);
    };

    load();
    map.on("moveend", scheduleLoad);

    return () => {
      map.off("moveend", scheduleLoad);
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, [map, leaflet, visible]);

  return null;
}
