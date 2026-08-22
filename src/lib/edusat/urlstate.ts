/**
 * urlstate.ts — every simulator configuration is a shareable link.
 *
 * There is no account and no database behind these tools. A learner who builds
 * a spacecraft that closes, or one that fails in an interesting way, shares it
 * by copying the address bar; an instructor sets an exercise by sending a link
 * with the starting configuration already loaded. That only works if the
 * encoding is compact enough to survive a chat client's URL detection and
 * stable enough that a link still opens next term.
 *
 * DESIGN
 *   - Base64url of JSON, with short keys. Not the prettiest, but it round-trips
 *     exactly and needs no schema registry.
 *   - Only fields that DIFFER from the default are stored, so a lightly-edited
 *     configuration produces a short link and the defaults can be improved
 *     later without invalidating old links.
 *   - A version tag rides along. When the shape changes, old links can be
 *     migrated rather than silently misread — a v1 link decoded as v2 would
 *     quietly hand someone the wrong spacecraft.
 *   - Decoding NEVER throws. A truncated or mangled link falls back to the
 *     defaults and says so, because a broken share link should degrade to a
 *     working page, not a stack trace.
 */

export const STATE_VERSION = 1;

export type DecodeResult<T> =
  | { ok: true; value: T; partial: false }
  | { ok: true; value: T; partial: true; warning: string }
  | { ok: false; warning: string };

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
    if (typeof atob === 'function') {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k += 1) bytes[k] = bin.charCodeAt(k);
      return new TextDecoder().decode(bytes);
    }
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

/** Deep-ish equality, sufficient for the scalar and array values held in state. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => same(x, b[i]));
  }
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-12;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    return (
      ka.length === kb.length &&
      ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
    );
  }
  return false;
}

/** Encode only what differs from `defaults`. Returns '' when nothing does. */
export function encodeState<T extends Record<string, unknown>>(value: T, defaults: T): string {
  const diff: Record<string, unknown> = {};
  for (const k of Object.keys(value)) {
    if (!same(value[k], defaults[k])) diff[k] = value[k];
  }
  if (Object.keys(diff).length === 0) return '';
  return toBase64Url(JSON.stringify({ v: STATE_VERSION, d: diff }));
}

/**
 * Decode, merging over `defaults`. Unknown keys are dropped rather than passed
 * through: a stale link from an older build must not inject a field the current
 * code will read as configuration.
 */
export function decodeState<T extends Record<string, unknown>>(
  encoded: string | null | undefined,
  defaults: T,
): DecodeResult<T> {
  if (!encoded) return { ok: true, value: defaults, partial: false };

  const json = fromBase64Url(encoded);
  if (json === null) return { ok: false, warning: 'That shared link is not readable. Showing the defaults instead.' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, warning: 'That shared link is damaged. Showing the defaults instead.' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, warning: 'That shared link does not contain a configuration.' };
  }

  const env = parsed as { v?: unknown; d?: unknown };
  if (env.v !== STATE_VERSION) {
    return {
      ok: false,
      warning:
        `That link was made with version ${String(env.v)} of this simulator and this is ` +
        `version ${STATE_VERSION}. Showing the defaults rather than guessing.`,
    };
  }
  if (!env.d || typeof env.d !== 'object') {
    return { ok: false, warning: 'That shared link has no settings in it.' };
  }

  const incoming = env.d as Record<string, unknown>;
  const out = { ...defaults } as Record<string, unknown>;
  const unknown: string[] = [];
  const mistyped: string[] = [];

  for (const [k, v] of Object.entries(incoming)) {
    if (!(k in defaults)) {
      unknown.push(k);
      continue;
    }
    const want = defaults[k];
    // Type must match the default's shape, or the simulator gets a string where
    // it expects a number and produces NaN all the way down.
    const typeOk =
      Array.isArray(want) ? Array.isArray(v) : want === null ? true : typeof v === typeof want;
    if (!typeOk) {
      mistyped.push(k);
      continue;
    }
    if (typeof v === 'number' && !Number.isFinite(v)) {
      mistyped.push(k);
      continue;
    }
    out[k] = v;
  }

  const problems = [...unknown.map((k) => `unknown setting "${k}"`), ...mistyped.map((k) => `bad value for "${k}"`)];
  if (problems.length > 0) {
    return {
      ok: true,
      value: out as T,
      partial: true,
      warning: `Loaded the link, but ignored ${problems.join(', ')}.`,
    };
  }
  return { ok: true, value: out as T, partial: false };
}

/** Build a shareable absolute URL for the current page with `s=` set. */
export function shareUrl(encoded: string, param = 's'): string {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  if (encoded) url.searchParams.set(param, encoded);
  else url.searchParams.delete(param);
  return url.toString();
}

/**
 * Replace the query string without adding a history entry.
 *
 * `replaceState` rather than `pushState` deliberately: these simulators have
 * sliders, and pushing history on every drag makes the back button useless.
 */
export function syncUrl(encoded: string, param = 's'): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (encoded) url.searchParams.set(param, encoded);
  else url.searchParams.delete(param);
  window.history.replaceState(null, '', url.toString());
}

export function readUrlState(param = 's'): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(param);
}
