"use client";

import { useState } from "react";
import type { VestaEmergencyContact, VestaFamilyMember, VestaFamilyPlan } from "@/modules/vesta/types";

interface Props {
  familyPlan: VestaFamilyPlan;
  contacts: VestaEmergencyContact[];
  canEdit: boolean;
  onSave: (plan: VestaFamilyPlan, contacts: VestaEmergencyContact[]) => Promise<void> | void;
}

function textInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  const { label, value, onChange, placeholder, textarea } = props;
  return (
    <label className="grid gap-1 text-[0.65rem] text-slate-400">
      {label}
      {textarea ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={2}
          className="border border-white/10 bg-slate-950 px-2 py-1.5 text-xs text-white placeholder:text-slate-600"
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-9 border border-white/10 bg-slate-950 px-2 text-xs text-white placeholder:text-slate-600"
        />
      )}
    </label>
  );
}

export default function VestaFamilyPlanPanel({ familyPlan, contacts, canEdit, onSave }: Props) {
  const [members, setMembers] = useState<VestaFamilyMember[]>(familyPlan.members);
  const [primaryMeetingPoint, setPrimaryMeetingPoint] = useState(familyPlan.primaryMeetingPoint ?? "");
  const [alternateMeetingPoint, setAlternateMeetingPoint] = useState(familyPlan.alternateMeetingPoint ?? "");
  const [evacuationRouteNotes, setEvacuationRouteNotes] = useState(familyPlan.evacuationRouteNotes ?? "");
  const [medicalNeedsNotes, setMedicalNeedsNotes] = useState(familyPlan.medicalNeedsNotes ?? "");
  const [petsNotes, setPetsNotes] = useState(familyPlan.petsNotes ?? "");
  const [observations, setObservations] = useState(familyPlan.observations ?? "");
  const [contactList, setContactList] = useState<VestaEmergencyContact[]>(contacts);
  const [saving, setSaving] = useState(false);

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-slate-400">Integrantes</p>
        {members.map((member, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <input
              value={member.name}
              disabled={!canEdit}
              onChange={(event) =>
                setMembers((current) =>
                  current.map((item, itemIndex) => (itemIndex === index ? { ...item, name: event.target.value } : item))
                )
              }
              placeholder="Nombre"
              className="h-9 flex-1 border border-white/10 bg-slate-950 px-2 text-xs text-white placeholder:text-slate-600 disabled:opacity-50"
            />
            <input
              value={member.relationship ?? ""}
              disabled={!canEdit}
              onChange={(event) =>
                setMembers((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, relationship: event.target.value } : item
                  )
                )
              }
              placeholder="Relación"
              className="h-9 w-32 border border-white/10 bg-slate-950 px-2 text-xs text-white placeholder:text-slate-600 disabled:opacity-50"
            />
            <label className="flex items-center gap-1 text-[0.65rem] text-slate-400">
              <input
                type="checkbox"
                checked={Boolean(member.isDependent)}
                disabled={!canEdit}
                onChange={(event) =>
                  setMembers((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, isDependent: event.target.checked } : item
                    )
                  )
                }
              />
              Dependiente
            </label>
            {canEdit && (
              <button
                type="button"
                onClick={() => setMembers((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                className="h-9 border border-white/10 bg-white/[0.03] px-2 text-xs text-slate-400"
              >
                Quitar
              </button>
            )}
          </div>
        ))}
        {canEdit && (
          <button
            type="button"
            onClick={() => setMembers((current) => [...current, { name: "" }])}
            className="w-fit border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300"
          >
            + Agregar integrante
          </button>
        )}
      </div>

      <div className="grid gap-2">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-slate-400">Contactos de emergencia</p>
        {contactList.map((contact, index) => (
          <div key={contact.id || index} className="flex flex-wrap items-center gap-2">
            <input
              value={contact.name}
              disabled={!canEdit}
              onChange={(event) =>
                setContactList((current) =>
                  current.map((item, itemIndex) => (itemIndex === index ? { ...item, name: event.target.value } : item))
                )
              }
              placeholder="Nombre"
              className="h-9 flex-1 border border-white/10 bg-slate-950 px-2 text-xs text-white placeholder:text-slate-600 disabled:opacity-50"
            />
            <input
              value={contact.phone ?? ""}
              disabled={!canEdit}
              onChange={(event) =>
                setContactList((current) =>
                  current.map((item, itemIndex) => (itemIndex === index ? { ...item, phone: event.target.value } : item))
                )
              }
              placeholder="Teléfono"
              className="h-9 w-36 border border-white/10 bg-slate-950 px-2 text-xs text-white placeholder:text-slate-600 disabled:opacity-50"
            />
            {canEdit && (
              <button
                type="button"
                onClick={() => setContactList((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                className="h-9 border border-white/10 bg-white/[0.03] px-2 text-xs text-slate-400"
              >
                Quitar
              </button>
            )}
          </div>
        ))}
        {canEdit && (
          <button
            type="button"
            onClick={() =>
              setContactList((current) => [
                ...current,
                { id: "", name: "", relationship: null, phone: null, email: null, priority: current.length + 1 },
              ])
            }
            className="w-fit border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300"
          >
            + Agregar contacto
          </button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {textInput({ label: "Punto de encuentro principal", value: primaryMeetingPoint, onChange: setPrimaryMeetingPoint })}
        {textInput({ label: "Punto de encuentro alternativo", value: alternateMeetingPoint, onChange: setAlternateMeetingPoint })}
      </div>
      {textInput({ label: "Ruta de evacuación", value: evacuationRouteNotes, onChange: setEvacuationRouteNotes, textarea: true })}
      {textInput({ label: "Necesidades médicas", value: medicalNeedsNotes, onChange: setMedicalNeedsNotes, textarea: true })}
      {textInput({ label: "Mascotas", value: petsNotes, onChange: setPetsNotes, textarea: true })}
      {textInput({ label: "Observaciones", value: observations, onChange: setObservations, textarea: true })}

      {canEdit && (
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(
                {
                  members: members.filter((member) => member.name.trim().length > 0),
                  primaryMeetingPoint: primaryMeetingPoint || null,
                  alternateMeetingPoint: alternateMeetingPoint || null,
                  evacuationRouteNotes: evacuationRouteNotes || null,
                  medicalNeedsNotes: medicalNeedsNotes || null,
                  petsNotes: petsNotes || null,
                  observations: observations || null,
                  updatedAt: null,
                },
                contactList.filter((contact) => contact.name.trim().length > 0)
              );
            } finally {
              setSaving(false);
            }
          }}
          className="w-fit border border-cyan-300/30 bg-cyan-400/12 px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-cyan-100 disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar plan familiar"}
        </button>
      )}
    </div>
  );
}
