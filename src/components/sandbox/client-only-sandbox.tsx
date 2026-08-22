'use client';

import { useEffect, useRef, useState } from 'react';

import { SandboxMount } from './sandbox-mount';

/**
 * Mount a sandbox on the client only.
 *
 * Why this exists, on the public simulator index specifically:
 *
 * These are interactive calculators. Server-rendering their computed state
 * buys nothing — there is no SEO value in an apogee figure that changes the
 * moment a visitor touches a slider, and no first-paint benefit either,
 * because the numbers are meaningless until the controls are usable.
 *
 * What it costs is a hydration surface. Six independent simulators, each
 * recomputing on mount, is six chances for a server-rendered string to differ
 * from its client-rendered counterpart by a rounding step, a locale detail or
 * a text-node boundary. React reacts to any one of those by throwing away the
 * server HTML for that subtree — so the "benefit" of SSR is discarded anyway,
 * and the visitor gets a console error for it.
 *
 * A lesson page mounts exactly one sandbox alongside content that genuinely
 * should be server-rendered, and those pages hydrate clean; they keep using
 * `SandboxMount` directly. This wrapper is for the index, where the sandboxes
 * are the entire payload and none of them benefit from being pre-rendered.
 *
 * The placeholder is sized to roughly match so the page does not jump.
 *
 * MOUNTING IS ALSO DEFERRED UNTIL THE SANDBOX IS NEAR THE VIEWPORT.
 *
 * The index stacks ten of these. Four are code-split and carry real data — the
 * parsed KiCad boards and the decimated CubeSat mesh — and one starts a WebGL
 * context and an animation loop. Mounting all ten on load means fetching every
 * chunk and running every simulation before the visitor has scrolled past the
 * first, on a page most people open to look at one thing.
 *
 * An IntersectionObserver with a generous root margin starts the work about a
 * screen ahead of the scroll, which in practice means the sandbox is ready by
 * the time it is looked at. Once mounted it stays mounted: unmounting would
 * throw away whatever the visitor had typed into it.
 *
 * Where IntersectionObserver is unavailable, the sandbox mounts on the next
 * tick instead — still after hydration, just without the scroll gate.
 *
 * The placeholder must render on the server AND on the first client pass. An
 * earlier revision keyed the placeholder on whether IntersectionObserver
 * existed, which is false on the server: that quietly server-rendered every
 * sandbox again and put back the hydration mismatch this component exists to
 * prevent. The gate has to be state that starts false everywhere.
 */
export function ClientOnlySandbox({ simulationKey }: { simulationKey: string }) {
  const [visible, setVisible] = useState(false);
  const holder = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = holder.current;

    if (!el || typeof IntersectionObserver === 'undefined') {
      // Mount on the next tick rather than synchronously here: setting state
      // inside the effect body would cascade a second render of the whole
      // sandbox tree before the browser has painted the placeholder.
      const t = setTimeout(() => setVisible(true), 0);
      return () => clearTimeout(t);
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (!visible) {
    return (
      <div
        ref={holder}
        className="flex min-h-[420px] items-center justify-center border border-[var(--border)] bg-[var(--bg-card)]"
        aria-busy="true"
      >
        <p className="text-sm text-[var(--text-muted)]">Loading the simulator…</p>
      </div>
    );
  }

  return <SandboxMount simulationKey={simulationKey} />;
}
