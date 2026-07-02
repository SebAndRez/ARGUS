"use client";

import { useMemo, useState } from "react";
import { demoMedicalPoints } from "@/data/medicalPoints";
import { createDemoMedicalAidRequest } from "@/lib/medical/medicalAidEngine";
import { sortMedicalPointsByDistance } from "@/lib/medical/medicalDistance";
import { getEmergencyVisibleMedicalProfile } from "@/lib/medical/medicalPrivacy";
import MedicalDisclaimer from "@/components/medical/MedicalDisclaimer";
import MedicalEmergencyQR from "@/components/medical/MedicalEmergencyQR";
import MedicalPointsList from "@/components/medical/MedicalPointsList";
import MedicalProfileCard from "@/components/medical/MedicalProfileCard";
import type { MedicalAidRequest, MedicalAidType, MedicalProfile } from "@/types/medical";

interface Props {
  location: { latitude: number; longitude: number };
  onClose: () => void;
  onMedicalAidCreated?: (request: MedicalAidRequest) => void;
}

const defaultProfile: MedicalProfile = {
  bloodType: "unknown",
  visibilityConsent: {
    showBloodType: false,
    showAllergies: false,
    showCriticalMedications: false,
    showRelevantConditions: false,
    showEmergencyContact: false,
  },
};

const aidTypes: Array<{ value: MedicalAidType; label: string }> = [
  { value: "need_help", label: "Necesito ayuda" },
  { value: "bleeding", label: "Sangrado" },
  { value: "breathing_difficulty", label: "Dificultad respiratoria" },
  { value: "injury", label: "Lesion" },
  { value: "trapped", label: "Atrapado" },
  { value: "other", label: "Otro" },
];

export default function AuraMedicalPanel({
  location,
  onClose,
  onMedicalAidCreated,
}: Props) {
  const [aidType, setAidType] = useState<MedicalAidType>("need_help");
  const [profile, setProfile] = useState<MedicalProfile>(defaultProfile);
  const [request, setRequest] = useState<MedicalAidRequest | null>(null);
  const nearbyPoints = useMemo(
    () =>
      sortMedicalPointsByDistance(demoMedicalPoints, {
        latitude: location.latitude,
        longitude: location.longitude,
      }),
    [location.latitude, location.longitude]
  );
  const publicProfile = getEmergencyVisibleMedicalProfile(profile);

  const createAid = () => {
    const nextRequest = createDemoMedicalAidRequest({
      type: aidType,
      latitude: location.latitude,
      longitude: location.longitude,
      nearestMedicalPoint: nearbyPoints[0],
    });
    setRequest(nextRequest);
    onMedicalAidCreated?.(nextRequest);
  };

  return (
    <aside className="argus-medical-panel pointer-events-auto fixed z-[62] max-h-[calc(100svh-1rem)] w-[390px] max-w-[calc(100%-1rem)] overflow-y-auto rounded-lg border border-rose-300/20 bg-slate-950/96 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-rose-300">
            AURA Basic
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">SOS Médico</h2>
          <p className="mt-1 text-xs text-slate-400">
            Alerta y ficha opcional para emergencia.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.58rem] font-bold uppercase text-slate-300"
        >
          Cerrar
        </button>
      </header>

      <div className="mt-4 grid gap-3">
        <MedicalDisclaimer />
        <div className="grid grid-cols-2 gap-2">
          {aidTypes.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setAidType(item.value)}
              className={`min-h-10 border px-2 py-2 text-xs font-semibold ${
                aidType === item.value
                  ? "border-rose-300/35 bg-rose-400/14 text-rose-100"
                  : "border-white/10 bg-white/[0.03] text-slate-300"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={createAid}
          className="min-h-11 rounded bg-rose-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-rose-950/35"
        >
          Crear alerta medica demo
        </button>
        {request && (
          <div className="rounded border border-rose-300/20 bg-rose-400/10 p-3 text-xs text-rose-100">
            Alerta creada: {request.severity} - {request.status}. Punto cercano:
            {" "}
            {request.nearestMedicalPoint?.name ?? "sin punto demo"}.
          </div>
        )}
        <MedicalPointsList points={nearbyPoints} />
        <MedicalProfileCard profile={profile} onChange={setProfile} />
        <MedicalEmergencyQR profile={publicProfile} />
      </div>
    </aside>
  );
}
