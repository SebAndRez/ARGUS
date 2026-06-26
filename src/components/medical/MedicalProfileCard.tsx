"use client";

import type { MedicalProfile } from "@/types/medical";

interface Props {
  profile: MedicalProfile;
  onChange: (profile: MedicalProfile) => void;
}

export default function MedicalProfileCard({ profile, onChange }: Props) {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-900/65 p-3">
      <p className="text-[0.6rem] font-bold uppercase tracking-[0.16em] text-slate-500">
        Ficha opcional
      </p>
      <div className="mt-3 grid gap-2">
        <input
          value={profile.bloodType ?? ""}
          onChange={(event) =>
            onChange({ ...profile, bloodType: event.target.value as MedicalProfile["bloodType"] })
          }
          placeholder="Grupo sanguineo opcional"
          className="rounded border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white outline-none"
        />
        <input
          value={profile.allergies ?? ""}
          onChange={(event) => onChange({ ...profile, allergies: event.target.value })}
          placeholder="Alergias opcionales"
          className="rounded border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white outline-none"
        />
        <input
          value={profile.criticalMedications ?? ""}
          onChange={(event) =>
            onChange({ ...profile, criticalMedications: event.target.value })
          }
          placeholder="Medicamentos criticos opcionales"
          className="rounded border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white outline-none"
        />
        <input
          value={profile.emergencyContact?.name ?? ""}
          onChange={(event) =>
            onChange({
              ...profile,
              emergencyContact: {
                ...profile.emergencyContact,
                name: event.target.value,
              },
            })
          }
          placeholder="Contacto de emergencia opcional"
          className="rounded border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white outline-none"
        />
      </div>
      <label className="mt-3 flex items-center gap-2 text-xs text-slate-300">
        <input
          type="checkbox"
          checked={profile.visibilityConsent.showBloodType}
          onChange={(event) =>
            onChange({
              ...profile,
              visibilityConsent: {
                ...profile.visibilityConsent,
                showBloodType: event.target.checked,
              },
            })
          }
        />
        Mostrar datos autorizados en emergencia.
      </label>
    </section>
  );
}
