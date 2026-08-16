'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { decodeState, encodeState, readUrlState, shareUrl, syncUrl } from '@/lib/edusat/urlstate';

/**
 * Configuration state that lives in the address bar.
 *
 * Two details worth knowing:
 *
 * 1. The initial value is read in an effect, not during render. Reading
 *    `window.location` while rendering would produce different HTML on the
 *    server and the client and hydration would tear. So the first paint is
 *    always the defaults, and the link's state arrives one tick later. The
 *    `hydrated` flag lets a caller hold off drawing an expensive chart until
 *    the real configuration has landed rather than drawing it twice.
 *
 * 2. URL writes are debounced. Dragging a slider fires dozens of updates a
 *    second and `history.replaceState` is not free; without this, Safari in
 *    particular starts dropping frames mid-drag.
 */
export function useUrlState<T extends Record<string, unknown>>(
  defaults: T,
  param = 's',
): {
  state: T;
  setState: (next: T | ((prev: T) => T)) => void;
  patch: (fields: Partial<T>) => void;
  reset: () => void;
  hydrated: boolean;
  warning: string | null;
  link: string;
} {
  const [state, setStateRaw] = useState<T>(defaults);
  const [hydrated, setHydrated] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const defaultsRef = useRef(defaults);

  useEffect(() => {
    const result = decodeState(readUrlState(param), defaultsRef.current);
    if (result.ok) {
      setStateRaw(result.value);
      setWarning(result.partial ? result.warning : null);
    } else {
      setWarning(result.warning);
    }
    setHydrated(true);
    // Intentionally keyed only on `param`: later URL changes come from this
    // hook itself, and re-reading them would fight the user's edits. The
    // defaults are held in a ref for the same reason — a caller that rebuilds
    // its defaults object on every render must not reset the form.
  }, [param]);

  useEffect(() => {
    if (!hydrated) return;
    const encoded = encodeState(state, defaultsRef.current);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      syncUrl(encoded, param);
      setLink(shareUrl(encoded, param));
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state, hydrated, param]);

  const setState = useCallback((next: T | ((prev: T) => T)) => {
    setStateRaw((prev) => (typeof next === 'function' ? (next as (p: T) => T)(prev) : next));
  }, []);

  const patch = useCallback((fields: Partial<T>) => {
    setStateRaw((prev) => ({ ...prev, ...fields }));
  }, []);

  const reset = useCallback(() => {
    setStateRaw(defaultsRef.current);
    setWarning(null);
  }, []);

  return { state, setState, patch, reset, hydrated, warning, link };
}

/** A copy-to-clipboard button state machine, shared by the simulators. */
export function useCopyLink(link: string): { copied: boolean; copy: () => void; supported: boolean } {
  const [copied, setCopied] = useState(false);
  const supported = typeof navigator !== 'undefined' && Boolean(navigator.clipboard);

  const copy = useCallback(() => {
    if (!link) return;
    void navigator.clipboard?.writeText(link).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      },
      () => setCopied(false),
    );
  }, [link]);

  return { copied, copy, supported };
}
