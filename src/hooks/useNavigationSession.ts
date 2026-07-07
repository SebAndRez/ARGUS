"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  calculateRoutes,
  type GeoPoint,
  type RoutePreferences,
  type RouteResult,
  type RoutingMode,
} from "@/lib/routing/routingService";

/**
 * Base de navegacion GPS en vivo reutilizable por AURA, Fenix, Atlas, rutas
 * de evacuacion y cualquier modulo futuro (tipo Waze/Google Maps): calcula
 * rutas reales, sigue el GPS del usuario, detecta desvios y recalcula.
 */

export type NavigationGpsStatus =
  | "idle"
  | "requesting"
  | "active"
  | "approximate"
  | "denied"
  | "unsupported"
  | "signal_lost";

const OFF_ROUTE_METERS = 40;
const APPROXIMATE_ACCURACY_METERS = 100;

interface UseNavigationSessionOptions {
  destination: GeoPoint | null;
  mode: RoutingMode;
  enabled: boolean;
  fallbackOrigin: GeoPoint;
  preferences?: RoutePreferences;
}

function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const radiusM = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * radiusM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function nearestPointOnRoute(
  point: GeoPoint,
  geometry: Array<[number, number]>
): { index: number; distanceMeters: number } {
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < geometry.length; i++) {
    const [lat, lng] = geometry[i];
    const distance = haversineMeters(point, { lat, lng });
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return { index: bestIndex, distanceMeters: bestDistance };
}

function remainingDistanceKmFromIndex(geometry: Array<[number, number]>, index: number): number {
  let totalMeters = 0;
  for (let i = index; i < geometry.length - 1; i++) {
    const [lat1, lng1] = geometry[i];
    const [lat2, lng2] = geometry[i + 1];
    totalMeters += haversineMeters({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 });
  }
  return totalMeters / 1000;
}

export function useNavigationSession({
  destination,
  mode,
  enabled,
  fallbackOrigin,
  preferences,
}: UseNavigationSessionOptions) {
  const [currentPosition, setCurrentPosition] = useState<GeoPoint | null>(null);
  const [gpsStatus, setGpsStatus] = useState<NavigationGpsStatus>("idle");
  const [gpsMessage, setGpsMessage] = useState("");
  const [routes, setRoutes] = useState<RouteResult[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(false);
  const [routesError, setRoutesError] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [offRoute, setOffRoute] = useState(false);
  const destinationKeyRef = useRef<string | null>(null);

  const origin = currentPosition ?? fallbackOrigin;

  useEffect(() => {
    if (!enabled) {
      setGpsStatus("idle");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsStatus("unsupported");
      setGpsMessage("GPS no disponible en este dispositivo. Se usa la ultima ubicacion conocida.");
      return;
    }

    setGpsStatus("requesting");
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const accuracy = position.coords.accuracy;
        const approximate = accuracy > APPROXIMATE_ACCURACY_METERS;
        setGpsStatus(approximate ? "approximate" : "active");
        setGpsMessage(approximate ? `Ubicacion aproximada (precision ~${Math.round(accuracy)} m).` : "");
        setCurrentPosition({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      (error) => {
        setGpsStatus(error.code === error.PERMISSION_DENIED ? "denied" : "signal_lost");
        setGpsMessage(
          error.code === error.PERMISSION_DENIED
            ? "Ubicacion bloqueada por el navegador. Activa el GPS para navegacion en vivo."
            : `Error de señal GPS (${error.message}). Se usa la ultima ubicacion conocida.`
        );
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled]);

  const fetchRoutes = useCallback(
    async (nextOrigin: GeoPoint) => {
      if (!destination) return;
      setIsLoadingRoutes(true);
      setRoutesError(null);
      try {
        const result = await calculateRoutes({ origin: nextOrigin, destination, mode, preferences });
        setRoutes(result);
        setSelectedRouteId((current) => {
          if (current && result.some((route) => route.id === current)) return current;
          return result[0]?.id ?? null;
        });
      } catch (error) {
        setRoutesError(error instanceof Error ? error.message : "No se pudo calcular la ruta.");
      } finally {
        setIsLoadingRoutes(false);
        setRecalculating(false);
      }
    },
    [destination, mode, preferences]
  );

  const hazardsSignature = (preferences?.hazards ?? [])
    .map((hazard) => hazard.id)
    .sort()
    .join(",");
  const destinationKey = destination
    ? `${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}|${mode}|${hazardsSignature}`
    : null;

  useEffect(() => {
    if (!enabled || !destination || !destinationKey) {
      setRoutes([]);
      setSelectedRouteId(null);
      setRoutesError(null);
      setIsNavigating(false);
      setOffRoute(false);
      destinationKeyRef.current = null;
      return;
    }
    if (destinationKeyRef.current === destinationKey) return;
    destinationKeyRef.current = destinationKey;
    fetchRoutes(origin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, destination, destinationKey, fetchRoutes]);

  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? null;

  // Deteccion de desvio + recalculo automatico mientras la navegacion activa esta corriendo.
  useEffect(() => {
    if (!isNavigating || !currentPosition || !selectedRoute) return;
    const { distanceMeters } = nearestPointOnRoute(currentPosition, selectedRoute.geometry);
    if (distanceMeters > OFF_ROUTE_METERS) {
      setOffRoute(true);
      setRecalculating(true);
      fetchRoutes(currentPosition);
    } else if (distanceMeters <= OFF_ROUTE_METERS) {
      setOffRoute(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPosition, isNavigating]);

  let remainingDistanceKm = selectedRoute?.distanceKm ?? 0;
  let remainingTimeMin = selectedRoute?.durationMin ?? 0;
  let nextInstruction: string | null = null;

  if (selectedRoute && currentPosition) {
    const { index } = nearestPointOnRoute(currentPosition, selectedRoute.geometry);
    remainingDistanceKm = remainingDistanceKmFromIndex(selectedRoute.geometry, index);
    remainingTimeMin =
      selectedRoute.distanceKm > 0
        ? Math.max(1, Math.round(selectedRoute.durationMin * (remainingDistanceKm / selectedRoute.distanceKm)))
        : selectedRoute.durationMin;

    const instructions = selectedRoute.instructions ?? [];
    const upcoming = instructions.find((instruction) => {
      const { index: instructionIndex } = nearestPointOnRoute(instruction.location, selectedRoute.geometry);
      return instructionIndex >= index;
    });
    nextInstruction = upcoming?.text ?? instructions[instructions.length - 1]?.text ?? null;
  }

  const selectRoute = useCallback((routeId: string) => {
    setSelectedRouteId(routeId);
    setOffRoute(false);
  }, []);

  const startNavigation = useCallback(() => {
    if (!selectedRoute) return;
    setIsNavigating(true);
    setOffRoute(false);
  }, [selectedRoute]);

  const stopNavigation = useCallback(() => {
    setIsNavigating(false);
    setRecalculating(false);
    setOffRoute(false);
  }, []);

  return {
    origin,
    currentPosition,
    gpsStatus,
    gpsMessage,
    routes,
    selectedRoute,
    selectRoute,
    isLoadingRoutes,
    routesError,
    remainingDistanceKm,
    remainingTimeMin,
    nextInstruction,
    offRoute,
    recalculating,
    isNavigating,
    startNavigation,
    stopNavigation,
  };
}
