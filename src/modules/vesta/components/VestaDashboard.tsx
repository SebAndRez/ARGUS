"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { resolveVestaRole } from "@/modules/vesta/vestaAccess";
import { VESTA_CATEGORY_LABELS, VESTA_DEFAULT_CHECKLIST_ITEMS } from "@/modules/vesta/data";
import { prioritizeVestaCategories } from "@/modules/vesta/vestaTalosBridge";
import { calculateVestaCategoryProgress, calculateVestaOverallPercentage } from "@/modules/vesta/vestaChecklist";
import { auraDemoProfile } from "@/modules/aura/data";
import { suggestVestaEmergencyContactFromAura, suggestVestaMedicalNotesFromAura } from "@/modules/vesta/vestaAuraBridge";
import VestaCategoryGrid from "@/modules/vesta/components/VestaCategoryGrid";
import VestaChecklistPanel from "@/modules/vesta/components/VestaChecklistPanel";
import VestaFamilyPlanPanel from "@/modules/vesta/components/VestaFamilyPlanPanel";
import VestaRemindersPanel from "@/modules/vesta/components/VestaRemindersPanel";
import VestaThreatGuides from "@/modules/vesta/components/VestaThreatGuides";
import type {
  VestaChecklistCategory,
  VestaChecklistItem,
  VestaChecklistStatus,
  VestaEmergencyContact,
  VestaFamilyPlan,
  VestaProfileSummary,
} from "@/modules/vesta/types";

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-emerald-300/20 bg-slate-950/80 p-4 shadow-xl shadow-black/20">
      <h2 className="text-[0.7rem] font-bold uppercase tracking-[0.18em] text-emerald-200">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const GUEST_PREVIEW_CHECKLIST: VestaChecklistItem[] = Object.entries(VESTA_DEFAULT_CHECKLIST_ITEMS).flatMap(
  ([category, labels]) =>
    labels.map((label, index) => ({
      id: `preview-${category}-${index}`,
      category: category as VestaChecklistCategory,
      label,
      status: "pending" as const,
      isCustom: false,
      notes: null,
      expiresAt: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }))
);

export default function VestaDashboard() {
  const { user, loading } = useSession();
  const role = resolveVestaRole(user);
  const [profile, setProfile] = useState<VestaProfileSummary | null>(null);
  const [fetching, setFetching] = useState(false);
  const [reviewSavedAt, setReviewSavedAt] = useState<number | null>(null);
  const [familyPlanFormVersion, setFamilyPlanFormVersion] = useState(0);

  const fetchProfile = useCallback(async () => {
    setFetching(true);
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      if (typeof window !== "undefined" && "geolocation" in navigator) {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              lat = position.coords.latitude;
              lng = position.coords.longitude;
              resolve();
            },
            () => resolve(),
            { timeout: 2500 }
          );
        });
      }
      const params = new URLSearchParams();
      if (lat !== null && lng !== null) {
        params.set("lat", String(lat));
        params.set("lng", String(lng));
      }
      const response = await fetch(`/api/vesta/profile?${params.toString()}`, { cache: "no-store" });
      if (response.ok) {
        setProfile(await response.json());
      } else {
        setProfile(null);
      }
    } catch {
      setProfile(null);
    } finally {
      setFetching(false);
      setFamilyPlanFormVersion((current) => current + 1);
    }
  }, []);

  const prefillFromAura = useCallback(() => {
    const suggestedNotes = suggestVestaMedicalNotesFromAura(auraDemoProfile);
    const suggestedContact = suggestVestaEmergencyContactFromAura(auraDemoProfile.emergencyContact);
    setProfile((current) => {
      if (!current) return current;
      const alreadyLinked = suggestedContact
        ? current.emergencyContacts.some((contact) => contact.id === suggestedContact.id)
        : true;
      return {
        ...current,
        familyPlan: {
          ...current.familyPlan,
          medicalNeedsNotes: suggestedNotes ?? current.familyPlan.medicalNeedsNotes,
        },
        emergencyContacts:
          suggestedContact && !alreadyLinked
            ? [...current.emergencyContacts, suggestedContact]
            : current.emergencyContacts,
      };
    });
    setFamilyPlanFormVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    const timeoutId = window.setTimeout(() => {
      void fetchProfile();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loading, user, fetchProfile]);

  const isGuest = !loading && !user;
  const checklist = profile?.checklist ?? GUEST_PREVIEW_CHECKLIST;
  const categoryProgress = useMemo(
    () => profile?.categoryProgress ?? calculateVestaCategoryProgress(checklist),
    [profile, checklist]
  );
  const overallPercentage = profile?.overallPercentage ?? calculateVestaOverallPercentage(checklist);
  const priorityOrder = useMemo(
    () => prioritizeVestaCategories(profile?.riskContexts ?? []),
    [profile?.riskContexts]
  );

  const updateChecklistStatus = useCallback(async (id: string, status: VestaChecklistStatus) => {
    setProfile((current) => {
      if (!current) return current;
      const nextChecklist = current.checklist.map((item) => (item.id === id ? { ...item, status } : item));
      return {
        ...current,
        checklist: nextChecklist,
        overallPercentage: calculateVestaOverallPercentage(nextChecklist),
        categoryProgress: calculateVestaCategoryProgress(nextChecklist),
      };
    });
    await fetch(`/api/vesta/checklist/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }, []);

  const addChecklistItem = useCallback(async (category: VestaChecklistCategory, label: string) => {
    const response = await fetch("/api/vesta/checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, label }),
    });
    if (!response.ok) return;
    const created = await response.json();
    setProfile((current) => {
      if (!current) return current;
      const nextChecklist = [...current.checklist, created];
      return {
        ...current,
        checklist: nextChecklist,
        overallPercentage: calculateVestaOverallPercentage(nextChecklist),
        categoryProgress: calculateVestaCategoryProgress(nextChecklist),
      };
    });
  }, []);

  const saveFamilyPlan = useCallback(async (plan: VestaFamilyPlan, contacts: VestaEmergencyContact[]) => {
    const [planResponse, contactsResponse] = await Promise.all([
      fetch("/api/vesta/family-plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan),
      }),
      fetch("/api/vesta/contacts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts }),
      }),
    ]);
    const updatedPlan = planResponse.ok ? await planResponse.json() : plan;
    const updatedContacts = contactsResponse.ok ? (await contactsResponse.json()).contacts : contacts;
    setProfile((current) => (current ? { ...current, familyPlan: updatedPlan, emergencyContacts: updatedContacts } : current));
    setFamilyPlanFormVersion((current) => current + 1);
  }, []);

  const completeReminder = useCallback(async (id: string) => {
    const response = await fetch(`/api/vesta/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "done" }),
    });
    if (!response.ok) return;
    const updated = await response.json();
    setProfile((current) =>
      current
        ? { ...current, reminders: current.reminders.map((reminder) => (reminder.id === id ? updated : reminder)) }
        : current
    );
  }, []);

  const skipReminder = useCallback(async (id: string) => {
    const response = await fetch(`/api/vesta/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "skip" }),
    });
    if (!response.ok) return;
    const updated = await response.json();
    setProfile((current) =>
      current
        ? { ...current, reminders: current.reminders.map((reminder) => (reminder.id === id ? updated : reminder)) }
        : current
    );
  }, []);

  const addReminder = useCallback(async (title: string, frequencyDays: number | null) => {
    const response = await fetch("/api/vesta/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, frequencyDays }),
    });
    if (!response.ok) return;
    const created = await response.json();
    setProfile((current) => (current ? { ...current, reminders: [...current.reminders, created] } : current));
  }, []);

  const markReviewComplete = useCallback(async () => {
    const response = await fetch("/api/vesta/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markReviewComplete: true }),
    });
    if (!response.ok) return;
    const { lastFullReviewAt } = await response.json();
    setProfile((current) => (current ? { ...current, lastFullReviewAt } : current));
    setReviewSavedAt(Date.now());
  }, []);

  const exportPlan = useCallback(() => {
    if (!profile) return;
    const lines = [
      "ARGUS VESTA - Plan de preparación familiar",
      `Preparación general: ${overallPercentage}%`,
      "",
      "Checklist:",
      ...profile.checklist.map((item) => `- [${item.status}] ${VESTA_CATEGORY_LABELS[item.category]}: ${item.label}`),
      "",
      "Plan familiar:",
      `Punto de encuentro principal: ${profile.familyPlan.primaryMeetingPoint ?? "-"}`,
      `Punto de encuentro alternativo: ${profile.familyPlan.alternateMeetingPoint ?? "-"}`,
      `Ruta de evacuación: ${profile.familyPlan.evacuationRouteNotes ?? "-"}`,
      `Necesidades médicas: ${profile.familyPlan.medicalNeedsNotes ?? "-"}`,
      `Mascotas: ${profile.familyPlan.petsNotes ?? "-"}`,
      `Observaciones: ${profile.familyPlan.observations ?? "-"}`,
      "",
      "Integrantes:",
      ...profile.familyPlan.members.map((member) => `- ${member.name}${member.relationship ? ` (${member.relationship})` : ""}`),
      "",
      "Contactos de emergencia:",
      ...profile.emergencyContacts.map((contact) => `- ${contact.name}: ${contact.phone ?? "sin teléfono"}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "argus-vesta-plan.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  }, [profile, overallPercentage]);

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Cargando ARGUS VESTA...</main>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10 bg-slate-950/95 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.28em] text-emerald-300">
              Preparación familiar y resiliencia ciudadana
            </p>
            <h1 className="mt-1 text-2xl font-bold uppercase tracking-[0.06em]">ARGUS VESTA</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="border border-emerald-300/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold uppercase text-emerald-100">
              Core público / gratuito
            </span>
            {isGuest && (
              <span className="border border-amber-300/30 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-100">
                Inicia sesión para guardar tu progreso
              </span>
            )}
            <span className="border border-cyan-300/25 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-100">Rol: {role}</span>
            <a href="/modules" className="border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300">
              Volver a módulos
            </a>
          </div>
        </div>
      </header>

      <main className="grid gap-4 px-4 py-5 sm:px-6">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="border border-white/10 bg-white/[0.035] p-3">
            <p className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">Preparación general</p>
            <p className="mt-1 text-2xl font-bold text-emerald-300">{overallPercentage}%</p>
          </div>
          <div className="border border-white/10 bg-white/[0.035] p-3">
            <p className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">Ítems listos</p>
            <p className="mt-1 text-xl font-bold">
              {checklist.filter((item) => item.status === "ready").length}/{checklist.filter((item) => item.status !== "notApplicable").length}
            </p>
          </div>
          <div className="border border-white/10 bg-white/[0.035] p-3">
            <p className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">Recordatorios pendientes</p>
            <p className="mt-1 text-xl font-bold">{profile?.reminders.filter((reminder) => reminder.status === "pending").length ?? 0}</p>
          </div>
          <div className="border border-white/10 bg-white/[0.035] p-3">
            <p className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">Última revisión completa</p>
            <p className="mt-1 text-sm font-semibold">
              {profile?.lastFullReviewAt ? new Date(profile.lastFullReviewAt).toLocaleDateString("es-CL") : "Sin registro"}
            </p>
          </div>
        </section>

        {!isGuest && profile && (
          <section className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={markReviewComplete}
              className="min-h-9 border border-emerald-300/30 bg-emerald-500/15 px-3 text-xs font-bold uppercase text-emerald-100"
            >
              {reviewSavedAt ? "Revisión marcada ✓" : "Marcar revisión completa"}
            </button>
            <button
              type="button"
              onClick={exportPlan}
              className="min-h-9 border border-white/10 bg-white/[0.04] px-3 text-xs font-bold uppercase text-slate-200"
            >
              Exportar plan simple
            </button>
            <button
              type="button"
              onClick={() => void fetchProfile()}
              disabled={fetching}
              className="min-h-9 border border-white/10 bg-white/[0.04] px-3 text-xs font-bold uppercase text-slate-200 disabled:opacity-50"
            >
              {fetching ? "Actualizando..." : "Actualizar"}
            </button>
          </section>
        )}

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid gap-4">
            <Panel title="Preparación por categoría">
              <VestaCategoryGrid categories={categoryProgress} />
            </Panel>

            <Panel title="Checklist de mochila de emergencia">
              <VestaChecklistPanel
                items={checklist}
                canEdit={!isGuest}
                onStatusChange={updateChecklistStatus}
                onAddItem={addChecklistItem}
                priorityOrder={priorityOrder}
              />
            </Panel>

            <Panel title="Plan familiar">
              {profile ? (
                <div className="grid gap-3">
                  <button
                    type="button"
                    onClick={prefillFromAura}
                    className="w-fit border border-rose-300/25 bg-rose-400/10 px-3 py-1.5 text-[0.65rem] font-bold uppercase text-rose-100"
                  >
                    Reutilizar datos de AURA
                  </button>
                  <VestaFamilyPlanPanel
                    key={familyPlanFormVersion}
                    familyPlan={profile.familyPlan}
                    contacts={profile.emergencyContacts}
                    canEdit={!isGuest}
                    onSave={saveFamilyPlan}
                  />
                </div>
              ) : (
                <p className="text-xs text-slate-500">Inicia sesión para crear tu plan familiar.</p>
              )}
            </Panel>
          </div>

          <aside className="grid auto-rows-max gap-4">
            <Panel title="Próximas tareas">
              {profile ? (
                <VestaRemindersPanel
                  reminders={profile.reminders}
                  canEdit={!isGuest}
                  onComplete={completeReminder}
                  onSkip={skipReminder}
                  onAdd={addReminder}
                />
              ) : (
                <p className="text-xs text-slate-500">Inicia sesión para activar recordatorios preventivos.</p>
              )}
            </Panel>

            <Panel title="Recomendaciones por amenaza">
              <VestaThreatGuides />
            </Panel>

            <Panel title="Integraciones preparadas">
              <ul className="grid gap-2 text-sm text-slate-300">
                <li>AURA: reutiliza grupo sanguíneo, alergias, medicamentos y contacto de emergencia.</li>
                <li>HERMES/FÉNIX: rutas de evacuación y refugios sugeridos.</li>
                <li>ARCA: guías oficiales (SENAPRED, Ready.gov/FEMA, Cruz Roja).</li>
                <li>TALOS/ORÁCULO: prioriza el checklist según riesgo local reciente.</li>
              </ul>
            </Panel>
          </aside>
        </section>
      </main>
    </div>
  );
}
