import { argusIncidentLimitations } from "@/lib/command/recommendedActions";

export default function ArgusLimitationsNotice() {
  return (
    <section className="rounded-lg border border-amber-300/15 bg-amber-400/8 p-3">
      <p className="text-[0.6rem] font-bold uppercase tracking-[0.16em] text-amber-200">
        Limitaciones ARGUS
      </p>
      <ul className="mt-2 grid gap-1 text-[0.68rem] leading-5 text-amber-100/85">
        {argusIncidentLimitations.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
