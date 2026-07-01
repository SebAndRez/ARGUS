export default function ExperimentalNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-violet-300/20 bg-violet-400/10 p-3 text-xs leading-5 text-violet-100">
      {children}
    </div>
  );
}
