"use client";

import { useEffect, useRef } from "react";
import { fetchUrbanPois } from "@/lib/pois/urbanPoiClient";
import { categoriesForZoom, type PoiEntity } from "@/lib/pois/poiTypes";
import { createPoiClusterDivIcon, createPoiDivIcon } from "@/components/map/PoiMarker";

/**
 * Capa de POIs urbanos (tiendas, restaurantes, farmacias, colegios,
 * paraderos, metro...), completamente independiente del basemap y de la
 * capa de incidentes/`MapEntity` de OperationalMap — se agrega/quita sola,
 * nunca toca esas otras capas. Sigue el mismo patron que
 * `RiskProjectionOverlay`/`RouteLayerOverlay`: recibe `map`/`leaflet` ya
 * inicializados y maneja sus propios layers de Leaflet.
 *
 * Carga por bounding box visible, gateada por zoom (`categoriesForZoom`),
 * con debounce en `moveend` para no golpear la API en cada frame de paneo, y
 * agrupa en clusters simples cuando hay demasiados puntos en pantalla.
 */

interface Props {
  map: import("leaflet").Map | null;
  leaflet: typeof import("leaflet") | null;
  visible: boolean;
  selectedPoiId?: string | null;
  onPoiSelect?: (poi: PoiEntity) => void;
}

interface PoiCluster {
  id: string;
  lat: number;
  lng: number;
  pois: PoiEntity[];
}

const DEBOUNCE_MS = 450;
const CLUSTER_THRESHOLD = 60;

function isCluster(item: PoiEntity | PoiCluster): item is PoiCluster {
  return "pois" in item;
}

function clusterPois(pois: PoiEntity[], zoom: number): Array<PoiEntity | PoiCluster> {
  if (pois.length <= CLUSTER_THRESHOLD) return pois;

  const cellSize = zoom >= 17 ? 0.0015 : 0.004;
  const cells = new Map<string, PoiEntity[]>();
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
    return { id: `poi-cluster-${key}`, lat, lng, pois: cellPois };
  });
}

export default function PoiLayer({ map, leaflet, visible, selectedPoiId, onPoiSelect }: Props) {
  const layerGroupRef = useRef<import("leaflet").LayerGroup | null>(null);
  const debounceRef = useRef<number | null>(null);
  const requestSeqRef = useRef(0);
  const itemsRef = useRef<Array<PoiEntity | PoiCluster>>([]);
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
        if (isCluster(item)) {
          const icon = leaflet.divIcon(createPoiClusterDivIcon(item.pois.length));
          const marker = leaflet.marker([item.lat, item.lng], { icon }).addTo(layerGroup);
          marker.on("click", () => {
            map.flyTo([item.lat, item.lng], Math.min(map.getZoom() + 2, 19), { duration: 0.5 });
          });
          return;
        }

        const icon = leaflet.divIcon(
          createPoiDivIcon(item, { selected: item.id === selectedPoiIdRef.current })
        );
        const marker = leaflet
          .marker([item.lat, item.lng], { icon, title: item.name || undefined })
          .addTo(layerGroup);
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
      const categories = categoriesForZoom(zoom);
      if (categories.length === 0) {
        itemsRef.current = [];
        layerGroup.clearLayers();
        return;
      }

      const bounds = map.getBounds();
      if (bounds.getWest() === bounds.getEast() || bounds.getSouth() === bounds.getNorth()) {
        return; // contenedor sin layout valido (p.ej. tab en background durante un gesto de zoom); reintenta en el proximo moveend
      }

      const seq = ++requestSeqRef.current;
      const pois = await fetchUrbanPois(
        {
          south: bounds.getSouth(),
          west: bounds.getWest(),
          north: bounds.getNorth(),
          east: bounds.getEast(),
        },
        zoom,
        categories
      );

      if (seq !== requestSeqRef.current) return; // el usuario ya se movio de nuevo, respuesta obsoleta

      itemsRef.current = clusterPois(pois, zoom);
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
