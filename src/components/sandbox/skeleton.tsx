/**
 * A placeholder the same rough height as the sandbox it stands in for, so the
 * page does not jump when the real component arrives.
 */
export function Skeleton({ label, height = 420 }: { label: string; height?: number }) {
  return (
    <div
      className="flex items-center justify-center border border-[var(--border)] bg-[var(--bg-card)]"
      style={{ minHeight: height }}
      aria-busy="true"
    >
      <p className="text-sm text-[var(--text-muted)]">{label}</p>
    </div>
  );
}
