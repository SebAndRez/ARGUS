"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import SensitiveDataNotice from "@/components/profile/SensitiveDataNotice";
import VisibilityBadge from "@/components/profile/VisibilityBadge";
import { countries } from "@/data/countries";
import { visibilityOptions } from "@/data/profileVisibility";
import { useSession } from "@/hooks/useSession";
import type {
  ArgusProfileDraft,
  BloodType,
  CommunityRole,
  LocationPrecision,
  LocationSharingPreference,
  ProfileVisibility,
} from "@/types/argusProfile";

type ProfileMe = {
  email: string;
  publicAlias: string;
  displayName: string;
  countryCode: string | null;
  countryName: string | null;
  city: string | null;
  region: string | null;
  preferredLanguage: string;
  unitSystem: string;
  documentRegistered: boolean;
  termsAcceptedAt: string | null;
  privacyAcceptedAt: string | null;
  profileCompletedAt: string | null;
  role: string;
  accountStatus: string;
  trustScore: number;
  strikes: number;
};

const communityRoles: CommunityRole[] = [
  "ciudadano",
  "voluntario",
  "brigadista",
  "operador",
  "analista",
  "institucion",
  "unidad_medica",
  "otro",
];

const bloodTypes: BloodType[] = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
  "no_se",
  "prefiero_no_decir",
];

const locationSharingOptions: LocationSharingPreference[] = [
  "never",
  "sos_only",
  "sos_and_safety_check",
  "reports",
];

const locationPrecisionOptions: LocationPrecision[] = [
  "exact_emergency",
  "approximate",
  "manual",
];

const defaultProfile: ArgusProfileDraft = {
  publicProfile: {
    publicAlias: "",
    displayName: "",
    avatarUrl: "",
    approximateCity: "",
    communityRole: "ciudadano",
    preferredLanguage: "es",
    usualArea: "",
    displayNameVisibility: "PRIVATE",
  },
  privateContact: {
    email: "",
    phonePrimary: "",
    phoneSecondary: "",
    preferredContactMethod: "app",
    preferredHours: "",
    shareWithAuthorizedUnits: false,
    shareDuringEmergency: false,
    consentToStore: false,
  },
  emergencyContact: {
    name: "",
    relationship: "",
    phone: "",
    email: "",
    notes: "",
    consentConfirmed: false,
    visibility: "EMERGENCY_ONLY",
    priority: "primary",
  },
  medical: {
    bloodType: "prefiero_no_decir",
    allergies: "",
    medications: "",
    relevantConditions: "",
    mobilityNeeds: "",
    criticalDevice: "prefer_not",
    specialNeeds: "",
    emergencyMedicalNote: "",
    shareDuringEmergency: false,
    shareWithAuthorizedUnits: false,
    consentToStore: false,
  },
  privacy: {
    shareLocation: "sos_only",
    locationPrecision: "exact_emergency",
    allowAuthorizedUnitContact: false,
    allowEmergencyContactAccess: false,
    allowMedicalProfileAccess: false,
    allowSafetyChecks: true,
    allowNearbyAlerts: true,
    allowExternalSourceAlerts: true,
    allowQuakeSenseExperimental: false,
    understandsEmergencyLimits: false,
  },
};

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="grid gap-2 text-sm text-slate-200">
      <span className="font-semibold">{label}</span>
      {children}
      {hint ? <span className="text-xs leading-5 text-slate-500">{hint}</span> : null}
    </label>
  );
}

function inputClass() {
  return "min-h-11 rounded border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/60";
}

function StatusTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/10 bg-slate-900/65 p-3">
      <p className="text-[0.58rem] font-bold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-100">
        {value}
      </p>
    </div>
  );
}

function SectionCard({
  id,
  title,
  description,
  children,
  onSubmit,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      id={id}
      onSubmit={onSubmit}
      className="rounded-lg border border-white/10 bg-slate-950/76 p-4 shadow-2xl shadow-black/20"
    >
      <div className="mb-4">
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-cyan-300/75">
          Mi Perfil
        </p>
        <h2 className="mt-1 text-xl font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
      </div>
      <div className="grid gap-4">{children}</div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="submit"
          className="min-h-10 rounded border border-cyan-300/30 bg-cyan-400/15 px-4 text-sm font-bold text-cyan-50 hover:bg-cyan-400/25"
        >
          Guardar seccion
        </button>
        <button
          type="reset"
          className="min-h-10 rounded border border-white/10 bg-white/[0.03] px-4 text-sm font-semibold text-slate-300 hover:text-white"
        >
          Restablecer seccion
        </button>
      </div>
    </form>
  );
}

function completionScore(profile: ArgusProfileDraft) {
  const checks = [
    profile.publicProfile.publicAlias.trim().length >= 3,
    profile.privateContact.email.trim().length > 0 || profile.privateContact.phonePrimary.trim().length > 0,
    profile.emergencyContact.name.trim().length > 0 && profile.emergencyContact.consentConfirmed,
    profile.privacy.understandsEmergencyLimits,
    profile.medical.consentToStore || profile.medical.bloodType === "prefiero_no_decir",
    profile.privacy.allowSafetyChecks,
  ];
  return {
    checks,
    percent: Math.round((checks.filter(Boolean).length / checks.length) * 100),
  };
}

function emailLooksValid(value: string) {
  if (!value.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function ArgusProfileWorkspace() {
  const { user, loading } = useSession();
  const [accountProfile, setAccountProfile] = useState<ProfileMe | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [countryQuery, setCountryQuery] = useState("");
  const [profile, setProfile] = useState<ArgusProfileDraft>(() => ({
    ...defaultProfile,
    publicProfile: {
      ...defaultProfile.publicProfile,
      publicAlias: "",
      displayName: "",
    },
  }));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const completion = useMemo(() => completionScore(profile), [profile]);
  const filteredCountries = useMemo(() => {
    const query = countryQuery.trim().toLowerCase();
    return countries.filter((country) =>
      !query ||
      country.code.toLowerCase().includes(query) ||
      country.nameEs.toLowerCase().includes(query) ||
      country.nameEn.toLowerCase().includes(query)
    );
  }, [countryQuery]);

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      try {
        const response = await fetch("/api/profile/me", { cache: "no-store" });
        if (!response.ok) throw new Error("No se pudo cargar perfil.");
        const data = await response.json();
        if (!cancelled) setAccountProfile(data.profile);
      } catch {
        if (!cancelled) setAccountProfile(null);
      } finally {
        if (!cancelled) setAccountLoading(false);
      }
    }
    loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveAccountProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountProfile) return;
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicAlias: accountProfile.publicAlias,
          displayName: accountProfile.displayName,
          countryCode: accountProfile.countryCode,
          city: accountProfile.city,
          region: accountProfile.region,
          language: accountProfile.preferredLanguage,
          unitSystem: accountProfile.unitSystem,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar perfil.");
      setAccountProfile(data.profile);
      setMessage("Perfil base actualizado.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar perfil.");
    }
  }

  const saveSection = (sectionName: string, validator?: () => string | null) => {
    const validationError = validator?.() ?? null;
    if (validationError) {
      setError(validationError);
      setMessage(null);
      return;
    }
    setError(null);
    setMessage(`${sectionName} preparado en esta sesion. Persistencia segura pendiente de DB/RLS.`);
  };

  const emergencyContactHasData =
    profile.emergencyContact.name.trim() ||
    profile.emergencyContact.phone.trim() ||
    profile.emergencyContact.email.trim();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-lg border border-cyan-300/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_34%),rgba(2,6,23,0.94)] p-5 shadow-2xl shadow-black/30 sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-cyan-300">
                ARGUS Profile
              </p>
              <h1 className="mt-3 text-3xl font-semibold text-white sm:text-5xl">
                Mi Perfil
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-200">
                Controle su identidad, datos de contacto y configuracion de emergencia dentro de ARGUS.
              </p>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                Puede dejar campos vacios. En emergencias, menos friccion salva tiempo; mas control protege su privacidad.
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-950/72 p-4 lg:w-80">
              <p className="text-sm font-semibold text-white">Completitud preparada</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-cyan-300"
                  style={{ width: `${completion.percent}%` }}
                />
              </div>
              <p className="mt-2 text-2xl font-semibold text-cyan-100">{completion.percent}%</p>
              <p className="text-xs leading-5 text-slate-400">
                Este formulario no guarda datos sensibles de forma persistente hasta cerrar RLS, auditoria y roles.
              </p>
            </div>
          </div>
        </header>

        {!loading && !user ? (
          <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">
            No hay sesion activa. Puede revisar la estructura del perfil, pero el guardado persistente requiere autenticacion y controles de privacidad.
          </div>
        ) : null}

        <div className="sticky top-0 z-20 -mx-4 mt-4 overflow-x-auto border-y border-white/10 bg-slate-950/92 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <nav className="flex min-w-max gap-2" aria-label="Secciones de perfil">
            {[
              ["#publico", "Perfil publico"],
              ["#contacto", "Contacto"],
              ["#emergencia", "Emergencia"],
              ["#salud", "Salud"],
              ["#privacidad", "Privacidad"],
              ["#cuenta", "Cuenta"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="rounded border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-slate-300 hover:border-cyan-300/30 hover:text-cyan-100"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid gap-5">
            {message ? (
              <div className="rounded-lg border border-emerald-300/25 bg-emerald-400/10 p-4 text-sm text-emerald-100">
                {message}
              </div>
            ) : null}
            {error ? (
              <div className="rounded-lg border border-red-300/25 bg-red-400/10 p-4 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            <form
              onSubmit={saveAccountProfile}
              className="rounded-lg border border-cyan-300/20 bg-slate-950/76 p-4 shadow-2xl shadow-black/20"
            >
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-cyan-300/75">
                Cuenta ARGUS
              </p>
              <h2 className="mt-1 text-xl font-semibold text-white">Perfil base persistente</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Datos guardados desde registro/onboarding. El documento no se muestra:
                solo aparece su estado de registro.
              </p>
              {accountLoading ? (
                <p className="mt-4 text-sm text-slate-400">Cargando perfil...</p>
              ) : accountProfile ? (
                <div className="mt-4 grid gap-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Email">
                      <input value={accountProfile.email} readOnly className={inputClass()} />
                    </Field>
                    <Field label="Alias publico">
                      <input
                        value={accountProfile.publicAlias}
                        onChange={(event) =>
                          setAccountProfile((current) =>
                            current ? { ...current, publicAlias: event.target.value } : current
                          )
                        }
                        className={inputClass()}
                      />
                    </Field>
                    <Field label="Nombre visible">
                      <input
                        value={accountProfile.displayName}
                        onChange={(event) =>
                          setAccountProfile((current) =>
                            current ? { ...current, displayName: event.target.value } : current
                          )
                        }
                        className={inputClass()}
                      />
                    </Field>
                    <Field label="Buscar pais">
                      <input
                        value={countryQuery}
                        onChange={(event) => setCountryQuery(event.target.value)}
                        className={inputClass()}
                        placeholder="Chile, Argentina, United..."
                      />
                    </Field>
                    <Field label="Pais">
                      <select
                        value={accountProfile.countryCode ?? ""}
                        onChange={(event) =>
                          setAccountProfile((current) =>
                            current ? { ...current, countryCode: event.target.value } : current
                          )
                        }
                        className={inputClass()}
                      >
                        {filteredCountries.map((country) => (
                          <option key={country.code} value={country.code}>
                            {country.nameEs} ({country.code})
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={accountProfile.countryCode === "CL" ? "Ciudad o comuna" : "Ciudad / localidad"}>
                      <input
                        value={accountProfile.city ?? ""}
                        onChange={(event) =>
                          setAccountProfile((current) =>
                            current ? { ...current, city: event.target.value } : current
                          )
                        }
                        className={inputClass()}
                      />
                    </Field>
                    <Field label="Region / estado">
                      <input
                        value={accountProfile.region ?? ""}
                        onChange={(event) =>
                          setAccountProfile((current) =>
                            current ? { ...current, region: event.target.value } : current
                          )
                        }
                        className={inputClass()}
                      />
                    </Field>
                    <Field label="Idioma">
                      <select
                        value={accountProfile.preferredLanguage}
                        onChange={(event) =>
                          setAccountProfile((current) =>
                            current ? { ...current, preferredLanguage: event.target.value } : current
                          )
                        }
                        className={inputClass()}
                      >
                        <option value="es">Espanol</option>
                        <option value="en">English</option>
                        <option value="pt">Portugues</option>
                      </select>
                    </Field>
                    <Field label="Unidades">
                      <select
                        value={accountProfile.unitSystem}
                        onChange={(event) =>
                          setAccountProfile((current) =>
                            current ? { ...current, unitSystem: event.target.value } : current
                          )
                        }
                        className={inputClass()}
                      >
                        <option value="METRIC">Metrico</option>
                        <option value="US_CUSTOMARY">US customary</option>
                        <option value="IMPERIAL">Imperial</option>
                      </select>
                    </Field>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <StatusTile label="Documento" value={accountProfile.documentRegistered ? "Documento registrado" : "Pendiente"} />
                    <StatusTile label="Terminos" value={accountProfile.termsAcceptedAt ? "Aceptados" : "Pendiente"} />
                    <StatusTile label="Privacidad" value={accountProfile.privacyAcceptedAt ? "Aceptada" : "Pendiente"} />
                    <StatusTile label="Rol" value={accountProfile.role} />
                    <StatusTile label="Estado" value={accountProfile.accountStatus} />
                    <StatusTile label="Confianza" value={`${accountProfile.trustScore}`} />
                  </div>
                  <div className="rounded border border-amber-300/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
                    Cambiar documento requiere flujo de verificacion. Cambiar correo
                    requiere verificacion del nuevo correo. Estas funciones quedan pendientes.
                  </div>
                  <button
                    type="submit"
                    className="w-fit rounded border border-cyan-300/30 bg-cyan-400/15 px-4 py-3 text-sm font-bold text-cyan-50 hover:bg-cyan-400/25"
                  >
                    Guardar perfil base
                  </button>
                </div>
              ) : (
                <p className="mt-4 text-sm text-amber-100">No se pudo cargar el perfil autenticado.</p>
              )}
            </form>

            <SectionCard
              id="publico"
              title="Perfil publico"
              description="Datos que pueden aparecer cuando reporta, valida informacion o participa en funciones comunitarias."
              onSubmit={(event) => {
                event.preventDefault();
                saveSection("Perfil publico", () =>
                  profile.publicProfile.publicAlias.trim().length > 0 &&
                  profile.publicProfile.publicAlias.trim().length < 3
                    ? "El alias debe tener al menos 3 caracteres o quedar vacio."
                    : null
                );
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Alias publico" hint="Visible en interacciones comunitarias. No use documento ni telefono.">
                  <input
                    value={profile.publicProfile.publicAlias}
                    maxLength={32}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        publicProfile: {
                          ...current.publicProfile,
                          publicAlias: event.target.value,
                        },
                      }))
                    }
                    className={inputClass()}
                    placeholder="ej. vecino_norte"
                  />
                </Field>
                <Field label="Nombre visible">
                  <input
                    value={profile.publicProfile.displayName}
                    maxLength={60}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        publicProfile: {
                          ...current.publicProfile,
                          displayName: event.target.value,
                        },
                      }))
                    }
                    className={inputClass()}
                    placeholder="Nombre a mostrar"
                  />
                </Field>
                <Field label="Comuna o ciudad aproximada">
                  <input
                    value={profile.publicProfile.approximateCity}
                    maxLength={80}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        publicProfile: {
                          ...current.publicProfile,
                          approximateCity: event.target.value,
                        },
                      }))
                    }
                    className={inputClass()}
                    placeholder="Sin direccion exacta"
                  />
                </Field>
                <Field label="Rol comunitario">
                  <select
                    value={profile.publicProfile.communityRole}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        publicProfile: {
                          ...current.publicProfile,
                          communityRole: event.target.value as CommunityRole,
                        },
                      }))
                    }
                    className={inputClass()}
                  >
                    {communityRoles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Zona habitual aproximada" hint="Evite direccion exacta. Use referencias generales.">
                  <input
                    value={profile.publicProfile.usualArea}
                    maxLength={100}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        publicProfile: {
                          ...current.publicProfile,
                          usualArea: event.target.value,
                        },
                      }))
                    }
                    className={inputClass()}
                    placeholder="ej. sector rural norte"
                  />
                </Field>
                <Field label="Visibilidad del nombre visible">
                  <select
                    value={profile.publicProfile.displayNameVisibility}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        publicProfile: {
                          ...current.publicProfile,
                          displayNameVisibility: event.target.value as ProfileVisibility,
                        },
                      }))
                    }
                    className={inputClass()}
                  >
                    {visibilityOptions.map((visibility) => (
                      <option key={visibility} value={visibility}>
                        {visibility}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </SectionCard>

            <SectionCard
              id="contacto"
              title="Contacto privado"
              description="Datos privados para contacto operativo futuro. No se muestran a usuarios comunes."
              onSubmit={(event) => {
                event.preventDefault();
                saveSection("Contacto privado", () =>
                  emailLooksValid(profile.privateContact.email)
                    ? null
                    : "El email privado no tiene un formato valido."
                );
              }}
            >
              <SensitiveDataNotice />
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Email privado">
                  <input
                    value={profile.privateContact.email}
                    maxLength={120}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        privateContact: {
                          ...current.privateContact,
                          email: event.target.value,
                        },
                      }))
                    }
                    className={inputClass()}
                    placeholder="usted@ejemplo.cl"
                  />
                </Field>
                <Field label="Telefono principal">
                  <input
                    value={profile.privateContact.phonePrimary}
                    maxLength={30}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        privateContact: {
                          ...current.privateContact,
                          phonePrimary: event.target.value,
                        },
                      }))
                    }
                    className={inputClass()}
                    placeholder="+56..."
                  />
                </Field>
                <Field label="Metodo preferido">
                  <select
                    value={profile.privateContact.preferredContactMethod}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        privateContact: {
                          ...current.privateContact,
                          preferredContactMethod: event.target.value as ArgusProfileDraft["privateContact"]["preferredContactMethod"],
                        },
                      }))
                    }
                    className={inputClass()}
                  >
                    <option value="app">Notificacion app</option>
                    <option value="email">Email</option>
                    <option value="phone">Telefono</option>
                    <option value="future_whatsapp">WhatsApp futuro</option>
                  </select>
                </Field>
                <Field label="Horario preferido">
                  <input
                    value={profile.privateContact.preferredHours}
                    maxLength={80}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        privateContact: {
                          ...current.privateContact,
                          preferredHours: event.target.value,
                        },
                      }))
                    }
                    className={inputClass()}
                    placeholder="Opcional"
                  />
                </Field>
              </div>
              <label className="flex gap-3 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={profile.privateContact.consentToStore}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      privateContact: {
                        ...current.privateContact,
                        consentToStore: event.target.checked,
                      },
                    }))
                  }
                  className="mt-1"
                />
                Acepto guardar este dato en mi perfil de ARGUS cuando exista persistencia segura.
              </label>
            </SectionCard>

            <SectionCard
              id="emergencia"
              title="Contacto de emergencia"
              description="Contacto privado preparado para SOS o Safety Check critico, si el usuario autoriza su uso."
              onSubmit={(event) => {
                event.preventDefault();
                saveSection("Contacto de emergencia", () => {
                  if (emergencyContactHasData && !profile.emergencyContact.consentConfirmed) {
                    return "Para guardar un contacto de emergencia debe confirmar que tiene autorizacion para agregarlo.";
                  }
                  if (!emailLooksValid(profile.emergencyContact.email)) {
                    return "El email del contacto de emergencia no tiene formato valido.";
                  }
                  return null;
                });
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Nombre del contacto">
                  <input
                    value={profile.emergencyContact.name}
                    maxLength={80}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        emergencyContact: {
                          ...current.emergencyContact,
                          name: event.target.value,
                        },
                      }))
                    }
                    className={inputClass()}
                  />
                </Field>
                <Field label="Relacion">
                  <input
                    value={profile.emergencyContact.relationship}
                    maxLength={60}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        emergencyContact: {
                          ...current.emergencyContact,
                          relationship: event.target.value,
                        },
                      }))
                    }
                    className={inputClass()}
                    placeholder="familia, amigo, vecino..."
                  />
                </Field>
                <Field label="Telefono">
                  <input
                    value={profile.emergencyContact.phone}
                    maxLength={30}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        emergencyContact: {
                          ...current.emergencyContact,
                          phone: event.target.value,
                        },
                      }))
                    }
                    className={inputClass()}
                  />
                </Field>
                <Field label="Email opcional">
                  <input
                    value={profile.emergencyContact.email}
                    maxLength={120}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        emergencyContact: {
                          ...current.emergencyContact,
                          email: event.target.value,
                        },
                      }))
                    }
                    className={inputClass()}
                  />
                </Field>
              </div>
              <Field label="Notas opcionales">
                <textarea
                  value={profile.emergencyContact.notes}
                  maxLength={260}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      emergencyContact: {
                        ...current.emergencyContact,
                        notes: event.target.value,
                      },
                    }))
                  }
                  className={`${inputClass()} min-h-24`}
                  placeholder="Contactar primero, vive cerca, solo si no respondo..."
                />
              </Field>
              <div className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <VisibilityBadge visibility={profile.emergencyContact.visibility} showDescription />
                <label className="flex gap-3 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={profile.emergencyContact.consentConfirmed}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        emergencyContact: {
                          ...current.emergencyContact,
                          consentConfirmed: event.target.checked,
                        },
                      }))
                    }
                    className="mt-1"
                  />
                  Confirmo que tengo autorizacion para agregar este contacto de emergencia.
                </label>
              </div>
            </SectionCard>

            <SectionCard
              id="salud"
              title="Salud y alertas medicas opcionales"
              description="Datos minimos para apoyar una respuesta de emergencia. No se usan para reputacion, sanciones ni diagnostico."
              onSubmit={(event) => {
                event.preventDefault();
                saveSection("Salud opcional");
              }}
            >
              <SensitiveDataNotice />
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Grupo sanguineo">
                  <select
                    value={profile.medical.bloodType}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        medical: {
                          ...current.medical,
                          bloodType: event.target.value as BloodType,
                        },
                      }))
                    }
                    className={inputClass()}
                  >
                    {bloodTypes.map((bloodType) => (
                      <option key={bloodType} value={bloodType}>
                        {bloodType}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Dispositivo critico">
                  <select
                    value={profile.medical.criticalDevice}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        medical: {
                          ...current.medical,
                          criticalDevice: event.target.value as ArgusProfileDraft["medical"]["criticalDevice"],
                        },
                      }))
                    }
                    className={inputClass()}
                  >
                    <option value="prefer_not">Prefiero no decir</option>
                    <option value="yes">Si</option>
                    <option value="no">No</option>
                  </select>
                </Field>
              </div>
              {[
                ["Alergias", "allergies"],
                ["Medicamentos importantes", "medications"],
                ["Condiciones relevantes", "relevantConditions"],
                ["Necesidades de movilidad", "mobilityNeeds"],
                ["Necesidades especiales", "specialNeeds"],
                ["Nota medica breve", "emergencyMedicalNote"],
              ].map(([label, key]) => (
                <Field key={key} label={label}>
                  <textarea
                    value={profile.medical[key as keyof typeof profile.medical] as string}
                    maxLength={320}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        medical: {
                          ...current.medical,
                          [key]: event.target.value,
                        },
                      }))
                    }
                    className={`${inputClass()} min-h-20`}
                  />
                </Field>
              ))}
              <div className="grid gap-2">
                <label className="flex gap-3 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={profile.medical.shareDuringEmergency}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        medical: {
                          ...current.medical,
                          shareDuringEmergency: event.target.checked,
                        },
                      }))
                    }
                    className="mt-1"
                  />
                  Permito usar estos datos solo durante emergencia, SOS o Safety Check critico.
                </label>
                <label className="flex gap-3 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={profile.medical.consentToStore}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        medical: {
                          ...current.medical,
                          consentToStore: event.target.checked,
                        },
                      }))
                    }
                    className="mt-1"
                  />
                  Acepto guardar datos medicos opcionales cuando exista persistencia segura.
                </label>
              </div>
            </SectionCard>

            <SectionCard
              id="privacidad"
              title="Privacidad y seguridad"
              description="Controle como ARGUS deberia usar ubicacion, Safety Check, fuentes externas y contacto operativo."
              onSubmit={(event) => {
                event.preventDefault();
                saveSection("Privacidad");
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Compartir ubicacion">
                  <select
                    value={profile.privacy.shareLocation}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        privacy: {
                          ...current.privacy,
                          shareLocation: event.target.value as LocationSharingPreference,
                        },
                      }))
                    }
                    className={inputClass()}
                  >
                    {locationSharingOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Precision de ubicacion">
                  <select
                    value={profile.privacy.locationPrecision}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        privacy: {
                          ...current.privacy,
                          locationPrecision: event.target.value as LocationPrecision,
                        },
                      }))
                    }
                    className={inputClass()}
                  >
                    {locationPrecisionOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="grid gap-2">
                {[
                  ["allowAuthorizedUnitContact", "Permitir contacto por unidades verificadas cuando exista RBAC real."],
                  ["allowEmergencyContactAccess", "Permitir acceso al contacto de emergencia durante SOS o Safety Check critico."],
                  ["allowMedicalProfileAccess", "Permitir uso de datos medicos opcionales durante emergencia."],
                  ["allowSafetyChecks", "Recibir Safety Checks."],
                  ["allowNearbyAlerts", "Recibir alertas cercanas."],
                  ["allowExternalSourceAlerts", "Recibir alertas de fuentes externas."],
                  ["allowQuakeSenseExperimental", "Participar en QuakeSense experimental."],
                  ["understandsEmergencyLimits", "Entiendo que ARGUS no reemplaza servicios oficiales de emergencia."],
                ].map(([key, label]) => (
                  <label key={key} className="flex gap-3 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={Boolean(profile.privacy[key as keyof typeof profile.privacy])}
                      onChange={(event) =>
                        setProfile((current) => ({
                          ...current,
                          privacy: {
                            ...current.privacy,
                            [key]: event.target.checked,
                          },
                        }))
                      }
                      className="mt-1"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </SectionCard>
          </div>

          <aside className="grid h-fit gap-4 lg:sticky lg:top-20">
            <section id="cuenta" className="rounded-lg border border-white/10 bg-slate-950/76 p-4">
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-cyan-300/75">
                Cuenta y confianza
              </p>
              <h2 className="mt-1 text-xl font-semibold text-white">Estado actual</h2>
              <div className="mt-4 grid gap-3 text-sm">
                <div className="rounded border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-slate-500">Sesion</p>
                  <p className="font-semibold text-white">{user ? "Activa" : "No autenticada"}</p>
                </div>
                <div className="rounded border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-slate-500">Reputacion</p>
                  <p className="font-semibold text-white">{user?.trustScore ?? "Demo"} </p>
                </div>
                <div className="rounded border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-slate-500">Estado de cuenta</p>
                  <p className="font-semibold text-white">{user?.accountStatus ?? "No disponible"}</p>
                </div>
              </div>
              <p className="mt-4 text-xs leading-5 text-slate-400">
                La reputacion ayuda a reducir reportes falsos, pero no bloquea SOS. El usuario no puede editar reputacion ni sanciones.
              </p>
            </section>

            <section className="rounded-lg border border-red-300/20 bg-red-400/10 p-4 text-sm leading-6 text-red-100">
              En una emergencia real, contacte tambien los numeros oficiales si tiene senal. SOS sigue disponible aunque el perfil este incompleto.
            </section>

            <section className="rounded-lg border border-white/10 bg-slate-950/76 p-4">
              <p className="text-sm font-semibold text-white">Visibilidad por defecto</p>
              <div className="mt-3 grid gap-3">
                <VisibilityBadge visibility="PUBLIC" showDescription />
                <VisibilityBadge visibility="PRIVATE" showDescription />
                <VisibilityBadge visibility="AUTHORIZED_UNITS_ONLY" showDescription />
                <VisibilityBadge visibility="EMERGENCY_ONLY" showDescription />
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
