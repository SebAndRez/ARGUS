export default function TrustProgressBar({ value }: { value: number }) {
  const bounded = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full bg-cyan-300"
        style={{ width: `${bounded}%` }}
      />
    </div>
  );
}
