export function LoadingResult() {
  return (
    <div className="flex flex-col gap-3 p-1">
      {[100, 90, 95, 60].map((w, i) => (
        <div key={i} className="h-3 animate-pulse rounded bg-white/[.06]" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}
