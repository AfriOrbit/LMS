'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * Light / dark, chosen by the reader, remembered between visits.
 *
 * Three states, not two. "System" is the default and it is a real option
 * rather than an absence of one: a reader whose laptop switches to dark at
 * sunset expects this to follow, and once they have explicitly chosen light or
 * dark, it must stop following. Collapsing that into a two-way toggle loses
 * the ability to go back to following the OS.
 */

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'afriorbit-theme';

/**
 * THE FLASH, AND WHY THIS IS A RAW SCRIPT TAG.
 *
 * If the theme is applied from a React effect, the browser paints the default
 * first and the correct theme a frame later — a white flash on every page load
 * for every dark-mode reader. It is the single most common defect in a theme
 * implementation and it cannot be fixed after the fact, only avoided.
 *
 * So this runs synchronously in <head>, before the body renders: it reads the
 * stored choice, falls back to the OS preference, and sets the attribute the
 * stylesheet keys off. It is deliberately tiny and dependency-free, because
 * anything in this position blocks first paint.
 *
 * The try/catch is not decorative. `localStorage` throws — not returns null,
 * throws — in a sandboxed iframe and in Safari's private mode with cookies
 * blocked. An uncaught throw here would leave the page unstyled.
 */
export function ThemeScript() {
  const js = `(function(){try{
var s=localStorage.getItem('${STORAGE_KEY}');
var m=window.matchMedia('(prefers-color-scheme: dark)').matches;
var t=(s==='light'||s==='dark')?s:(m?'dark':'light');
document.documentElement.setAttribute('data-theme',t);
document.documentElement.style.colorScheme=t;
}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}

function apply(theme: Theme) {
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.style.colorScheme = resolved;
}

/*
 * `useSyncExternalStore`, not `useState` + `useEffect`.
 *
 * localStorage IS an external store, and React has a hook for exactly this
 * shape. The obvious version — state initialised to 'system', an effect that
 * reads storage and calls setState — lints as an error and deserves to: it
 * renders once with the wrong value and then re-renders, and during hydration
 * that is a mismatch React has to reconcile.
 *
 * `getServerSnapshot` is what makes it safe: React uses it for the server
 * render and the hydration pass, then switches to the client snapshot, with no
 * mismatch and no extra render. The inline head script has already painted the
 * correct colours by that point, so nothing flickers either way.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // 'storage' only fires in OTHER tabs, so a same-tab change is broadcast by
  // notifying the listeners directly in setTheme. Both paths are needed: one
  // keeps two open tabs in step, the other keeps this one in step with itself.
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function getSnapshot(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

/** The server has no storage and no OS preference, so it assumes 'system'. */
function getServerSnapshot(): Theme {
  return 'system';
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Follow the OS while, and only while, the choice is 'system'.
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable — the choice lasts for this page only */
    }
    apply(next);
    listeners.forEach((l) => l());
  }, []);

  return { theme, setTheme };
}

const OPTIONS: { value: Theme; label: string; glyph: string }[] = [
  { value: 'light', label: 'Light', glyph: '○' },
  { value: 'dark', label: 'Dark', glyph: '●' },
  { value: 'system', label: 'System', glyph: '◐' },
];

/**
 * A three-position segmented control, not an icon that cycles.
 *
 * A single cycling button hides the current state and gives no way to predict
 * what the next press does. Three labelled segments show which is active and
 * cost one row of a header.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={`inline-flex border border-[var(--border)] ${className ?? ''}`}
    >
      {OPTIONS.map((o) => {
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={`${o.label} theme`}
            onClick={() => setTheme(o.value)}
            className={`flex h-7 w-7 items-center justify-center text-[0.7rem] transition-colors ${
              active
                ? 'bg-[var(--invert-bg)] text-[var(--invert-fg)]'
                : 'text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]'
            }`}
          >
            <span aria-hidden>{o.glyph}</span>
            <span className="sr-only">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
