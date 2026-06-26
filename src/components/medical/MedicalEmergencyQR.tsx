import type { PublicMedicalProfile } from "@/types/medical";

export default function MedicalEmergencyQR({
  profile,
}: {
  profile: PublicMedicalProfile;
}) {
  const rows = [
    ["Sangre", profile.bloodType],
    ["Alergias", profile.allergies],
    ["Medicamentos", profile.criticalMedications],
    ["Condiciones", profile.relevantConditions],
    ["Contacto", profile.emergencyContact?.name],
  ].filter(([, value]) => Boolean(value));

  return (
    <section className="rounded-lg border border-white/10 bg-slate-900/70 p-3">
      <div className="flex items-center gap-3">
        <div className="grid h-20 w-20 shrink-0 grid-cols-4 gap-1 border border-cyan-300/20 bg-slate-950 p-2">
          {Array.from({ length: 16 }).map((_, index) => (
            <span
              key={index}
              className={index % 3 === 0 || index % 5 === 0 ? "bg-cyan-200" : "bg-slate-800"}
            />
          ))}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-cyan-200">QR medico demo</p>
          <p className="mt-1 text-[0.68rem] leading-5 text-slate-400">
            Bloque visual local. No envia datos a terceros.
          </p>
        </div>
      </div>
      <div className="mt-3 grid gap-1 text-xs">
        {rows.length > 0 ? (
          rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 border-t border-white/8 pt-1">
              <span className="text-slate-500">{label}</span>
              <span className="truncate text-slate-200">{value}</span>
            </div>
          ))
        ) : (
          <p className="text-slate-500">Sin datos autorizados para mostrar.</p>
        )}
      </div>
    </section>
  );
}
