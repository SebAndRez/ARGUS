"use client";

import { useCallback, useEffect, useState } from "react";
import type { UserLocationState } from "@/types/crisis";

const SANTIAGO = {
  latitude: -33.4489,
  longitude: -70.6693,
};

const fallbackState: UserLocationState = {
  status: "idle",
  latitude: SANTIAGO.latitude,
  longitude: SANTIAGO.longitude,
  accuracy: 0,
  errorMessage: "",
};

export function useUserLocation() {
  const [location, setLocation] = useState<UserLocationState>(fallbackState);

  const requestLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocation({
        status: "fallback",
        latitude: SANTIAGO.latitude,
        longitude: SANTIAGO.longitude,
        accuracy: 0,
        errorMessage: "GPS no disponible, usando ubicación demo.",
      });
      return;
    }

    setLocation((current) => ({ ...current, status: "loading", errorMessage: "" }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          status: "granted",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          errorMessage: "",
        });
      },
      (error) => {
        setLocation({
          status: "fallback",
          latitude: SANTIAGO.latitude,
          longitude: SANTIAGO.longitude,
          accuracy: 0,
          errorMessage: `GPS no disponible, usando ubicación demo (${error.message}).`,
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000,
      }
    );
  }, []);

  const refreshLocation = useCallback(() => {
    requestLocation();
  }, [requestLocation]);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  return {
    ...location,
    requestLocation,
    refreshLocation,
  };
}
