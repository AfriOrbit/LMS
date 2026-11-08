export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="text-xl font-semibold">Simulator not found</h1>
      <p className="mt-3 text-sm text-[var(--text-muted)]">
        <a href="/sims/" className="text-[var(--accent)]">See all simulators</a>
      </p>
    </main>
  );
}
