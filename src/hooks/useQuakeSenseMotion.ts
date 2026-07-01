"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  calculateAccelerationMagnitude,
  detectShakeWindow,
} from "@/lib/quakesense/quakesenseDetector";
import type {
  QuakeSenseDetection,
  QuakeSenseLocalSample,
  QuakeSensePermissionState,
  QuakeSenseSettings,
  QuakeSenseStatus,
} from "@/types/quakesense";

type DeviceMotionEventWithPermission = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

const defaultSettings: QuakeSenseSettings = {
  enabled: false,
  shareApproxLocation: false,
  shareOnlyOnDetection: true,
  sensitivity: "medium",
  minConfidenceToReport: 55,
  requireStationaryHint: false,
};

export function useQuakeSenseMotion(options?: {
  settings?: Partial<QuakeSenseSettings>;
}) {
  const [settings, setSettings] = useState<QuakeSenseSettings>({
    ...defaultSettings,
    ...options?.settings,
  });
  const [permissionState, setPermissionState] =
    useState<QuakeSensePermissionState>("UNKNOWN");
  const [status, setStatus] = useState<QuakeSenseStatus>("DISABLED");
  const [latestSample, setLatestSample] = useState<QuakeSenseLocalSample | null>(null);
  const [detection, setDetection] = useState<QuakeSenseDetection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const bufferRef = useRef<QuakeSenseLocalSample[]>([]);
  const isSupported = useMemo(
    () => typeof window !== "undefined" && "DeviceMotionEvent" in window,
    []
  );

  useEffect(() => {
    if (!isSupported) {
      setPermissionState("UNSUPPORTED");
      setStatus("UNSUPPORTED");
      return;
    }
    const motionEvent = DeviceMotionEvent as DeviceMotionEventWithPermission;
    setPermissionState(motionEvent.requestPermission ? "REQUIRED" : "GRANTED");
    setStatus(motionEvent.requestPermission ? "PERMISSION_REQUIRED" : "READY");
  }, [isSupported]);

  const stop = useCallback(() => {
    setIsListening(false);
    setStatus((current) => (current === "UNSUPPORTED" ? current : "READY"));
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isSupported) {
      setPermissionState("UNSUPPORTED");
      setStatus("UNSUPPORTED");
      return false;
    }
    try {
      const motionEvent = DeviceMotionEvent as DeviceMotionEventWithPermission;
      if (motionEvent.requestPermission) {
        const result = await motionEvent.requestPermission();
        setPermissionState(result === "granted" ? "GRANTED" : "DENIED");
        setStatus(result === "granted" ? "READY" : "ERROR");
        return result === "granted";
      }
      setPermissionState("GRANTED");
      setStatus("READY");
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Permiso motion denegado.");
      setPermissionState("DENIED");
      setStatus("ERROR");
      return false;
    }
  }, [isSupported]);

  const start = useCallback(async () => {
    if (!isSupported) {
      setStatus("UNSUPPORTED");
      return;
    }
    if (permissionState !== "GRANTED") {
      const granted = await requestPermission();
      if (!granted) return;
    }
    setSettings((current) => ({ ...current, enabled: true }));
    setDetection(null);
    bufferRef.current = [];
    setIsListening(true);
    setStatus("LISTENING");
  }, [isSupported, permissionState, requestPermission]);

  const reset = useCallback(() => {
    bufferRef.current = [];
    setDetection(null);
    setLatestSample(null);
    setError(null);
    setStatus(isListening ? "LISTENING" : isSupported ? "READY" : "UNSUPPORTED");
  }, [isListening, isSupported]);

  const updateSettings = useCallback((next: Partial<QuakeSenseSettings>) => {
    setSettings((current) => ({ ...current, ...next }));
  }, []);

  useEffect(() => {
    if (!isListening || !isSupported) return;

    const handleMotion = (event: DeviceMotionEvent) => {
      const acceleration = event.acceleration ?? event.accelerationIncludingGravity;
      const sample: QuakeSenseLocalSample = {
        timestamp: Date.now(),
        accelerationX: acceleration?.x ?? 0,
        accelerationY: acceleration?.y ?? 0,
        accelerationZ: acceleration?.z ?? 0,
        accelerationMagnitude: calculateAccelerationMagnitude({
          accelerationX: acceleration?.x ?? 0,
          accelerationY: acceleration?.y ?? 0,
          accelerationZ: acceleration?.z ?? 0,
        }),
        accelerationIncludingGravityMagnitude: event.accelerationIncludingGravity
          ? calculateAccelerationMagnitude({
              accelerationX: event.accelerationIncludingGravity.x ?? 0,
              accelerationY: event.accelerationIncludingGravity.y ?? 0,
              accelerationZ: event.accelerationIncludingGravity.z ?? 0,
            })
          : undefined,
        rotationRate: event.rotationRate ?? undefined,
        interval: event.interval ?? undefined,
      };
      bufferRef.current = [...bufferRef.current, sample].slice(-120);
      setLatestSample(sample);
      const result = detectShakeWindow(bufferRef.current, settings);
      if (result.detection) {
        setDetection(result.detection);
        setStatus("POSSIBLE_SHAKE");
      }
    };

    window.addEventListener("devicemotion", handleMotion);
    return () => window.removeEventListener("devicemotion", handleMotion);
  }, [isListening, isSupported, settings]);

  return {
    permissionState,
    status,
    isSupported,
    isListening,
    latestSample,
    detection,
    error,
    requestPermission,
    start,
    stop,
    reset,
    settings,
    updateSettings,
  };
}
