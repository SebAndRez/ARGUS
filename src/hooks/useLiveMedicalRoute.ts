"use client";

import { useEffect, useRef, useState } from "react";
import { calculateRoute, type GeoPoint, type RouteResult, type RoutingMode } from "@/lib/routing/routingService";
import { haversineDistanceKm } from "@/lib/medical/auraMedicalRouting";

/**
 * Navegacion en vivo para el atajo SOS Medico: sigue la ubicacion GPS real
 * del usuario (`watchPosition`) y recalcula la ruta real por calles cuando
 * cambia el destino/modo de transporte, o cuando el usuario se aleja mas de
 * `RECALC_DISTANCE_METERS` del punto donde se calculo la ultima ruta.
 */

export type LiveGpsPermission = "idle" | "requesting" | "granted" | "denied" | "unsupported";

const RECALC_DISTANCE_METERS = 40;

interface UseLiveMedicalRouteOptions {
  destination: GeoPoint | null;
  mode: RoutingMode;
  enabled: boolean;
  /** Ubicacion usada mientras el GPS en vivo no esta disponible/autorizado. */
  fallbackOrigin: GeoPoint;
}

export function useLiveMedicalRoute({ destination, mode, enabled, fallbackOrigin }: UseLiveMedicalRouteOptions) {
  const [liveOrigin, setLiveOrigin] = useState<GeoPoint | null>(null);
  const [permission, setPermission] = useState<LiveGpsPermission>("idle");
  const [permissionMessage, setPermissionMessage] = useState("");
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const lastRouteRef = useRef<{ key: string; origin: GeoPoint } | null>(null);

  const origin = liveOrigin ?? fallbackOrigin;

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPermission("unsupported");
      setPermissionMessage("GPS no disponible en este dispositivo. Se usa la ultima ubicacion conocida.");
      return;
    }

    setPermission("requesting");
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setPermission("granted");
        setPermissionMessage("");
        setLiveOrigin({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      (error) => {
        setPermission("denied");
        setPermissionMessage(
          error.code === error.PERMISSION_DENIED
            ? "Ubicacion bloqueada por el navegador. Activa el GPS para navegacion en vivo; por ahora se usa la ultima ubicacion conocida."
            : `No se pudo obtener el GPS en vivo (${error.message}). Se usa la ultima ubicacion conocida.`
        );
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled]);

  const destinationKey = destination ? `${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}|${mode}` : null;

  useEffect(() => {
    if (!enabled || !destination || !destinationKey) {
      setRoute(null);
      setRouteError(null);
      lastRouteRef.current = null;
      return;
    }

    const previous = lastRouteRef.current;
    const destinationChanged = !previous || previous.key !== destinationKey;
    const movedMeters = previous ? haversineDistanceKm(previous.origin, origin) * 1000 : Infinity;
    if (!destinationChanged && movedMeters < RECALC_DISTANCE_METERS) return;

    let cancelled = false;
    setIsLoadingRoute(true);
    setRouteError(null);

    calculateRoute({ origin, destination, mode })
      .then((result) => {
        if (cancelled) return;
        setRoute(result);
        lastRouteRef.current = { key: destinationKey, origin };
      })
      .catch((error) => {
        if (cancelled) return;
        setRouteError(error instanceof Error ? error.message : "No se pudo calcular la ruta.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingRoute(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, destination, destinationKey, mode, origin.lat, origin.lng]);

  return { origin, permission, permissionMessage, route, isLoadingRoute, routeError };
}
