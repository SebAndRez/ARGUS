export default function RecommendedActionsList({
  actions,
}: {
  actions: string[];
}) {
  return (
    <ul className="grid gap-1.5 text-xs text-slate-300">
      {actions.map((action) => (
        <li key={action} className="rounded border border-white/8 bg-white/[0.03] px-2 py-1.5">
          {action}
        </li>
      ))}
    </ul>
  );
}
