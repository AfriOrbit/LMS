import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { headers } from 'next/headers';

import { serverEnv } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/* -------------------------------------------------------------------------- */
/* Request fingerprinting                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Salted hash of the client IP.
 *
 * We keep this rather than the raw address so the audit log and rate limiter
 * remain useful for incident review without becoming a register of learners'
 * network locations. The salt must be stable across instances but is otherwise
 * arbitrary; rotating it resets all rate-limit buckets, which is acceptable.
 */
/**
 * A MISSING SALT MUST NOT TAKE REGISTRATION DOWN, and it used to.
 *
 * `serverEnv.ipHashSalt` throws when `IP_HASH_SALT` is unset, and this function
 * is the FIRST server call in `registerAction` — before validation results are
 * used, before Supabase is touched. So a deployment that had every Supabase
 * variable set correctly, and a database that was perfectly healthy, still
 * answered every registration attempt with a blank 500. The one variable that
 * has nothing to do with Supabase was the one breaking the Supabase-looking
 * page, which sent the search in exactly the wrong direction.
 *
 * The fallback is an ephemeral salt generated once per process. What that costs
 * is real but narrow: rate-limit buckets no longer agree between serverless
 * instances, and hashes stop correlating with older audit rows. What it does
 * NOT cost is privacy — a random secret salt is, if anything, a stronger hash
 * input than a configured one. Trading cross-instance correlation for a working
 * signup form is the right trade; trading it silently is not, so it is logged
 * once at startup-of-use rather than per request.
 */
let ephemeralSalt: string | null = null;

function ipHashSalt(): string {
  try {
    return serverEnv.ipHashSalt;
  } catch {
    if (!ephemeralSalt) {
      ephemeralSalt = randomBytes(32).toString('hex');
      console.error(
        '[security] IP_HASH_SALT is not set. Using a random per-process salt so ' +
          'registration and sign-in keep working. Rate-limit buckets will not be ' +
          'shared between instances and audit hashes will not correlate with older ' +
          'rows. Set IP_HASH_SALT (openssl rand -hex 32) and redeploy.',
      );
    }
    return ephemeralSalt;
  }
}

export async function clientIpHash(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for') ?? '';
  const ip = forwarded.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
  return createHash('sha256').update(`${ipHashSalt()}:${ip}`).digest('hex');
}

export async function clientUserAgent(): Promise<string> {
  const h = await headers();
  return (h.get('user-agent') ?? 'unknown').slice(0, 300);
}

/* -------------------------------------------------------------------------- */
/* Rate limiting                                                               */
/* -------------------------------------------------------------------------- */

export interface RateLimitResult {
  allowed: boolean;
  hits: number;
  limit: number;
  resetAt: string;
}

/**
 * Fixed-window rate limit, counted in Postgres.
 *
 * `scope` should identify the action ('login', 'verify-cert', 'quiz-submit').
 * `key` should identify the actor — a user id where one exists, otherwise the
 * hashed IP. Prefer the user id when available so a shared NAT does not lock
 * out a whole classroom.
 */
export async function rateLimit(
  scope: string,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const open = (): RateLimitResult => ({
    allowed: true,
    hits: 0,
    limit,
    resetAt: new Date().toISOString(),
  });

  /*
   * `createSupabaseAdminClient()` USED TO SIT OUTSIDE THIS GUARD, which made
   * the fail-open below a promise this function could not keep.
   *
   * It throws — on absent Supabase config, and on a missing
   * SUPABASE_SERVICE_ROLE_KEY. The `if (error)` path caught RPC failures and
   * correctly refused to lock everyone out, but a constructor throw sailed past
   * it and became a 500 on the registration page. So the one branch written to
   * degrade gracefully was bypassed by the failure most likely to occur, and a
   * deployment missing a single server-only key could not register anyone.
   */
  let data: unknown;
  try {
    const admin = createSupabaseAdminClient();
    const res = await admin.schema('app').rpc('rate_limit_hit', {
      p_bucket: `${scope}:${key}`,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (res.error) {
      // Fail open on infrastructure error rather than locking everyone out,
      // but make the failure loud in the logs.
      console.error('[rate-limit] backend error', res.error.message);
      return open();
    }
    data = res.data;
  } catch (err) {
    console.error(
      `[rate-limit] cannot reach the limiter for "${scope}" — failing open. ` +
        'This is usually a missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).',
      err,
    );
    return open();
  }

  /*
   * A SUCCESSFUL RPC THAT RETURNS NOTHING is not hypothetical: a half-applied
   * schema can leave `rate_limit_hit` present but returning NULL, which reports
   * no error at all. Reading `.allowed` off that throws a TypeError from inside
   * the one function whose entire contract is to never block a request, and the
   * 500 lands on the registration page again by a different route.
   */
  if (!data || typeof data !== 'object') {
    console.error('[rate-limit] rate_limit_hit returned no result — failing open.');
    return open();
  }

  const result = data as {
    allowed: boolean;
    hits: number;
    limit: number;
    reset_at: string;
  };
  return {
    allowed: result.allowed,
    hits: result.hits,
    limit: result.limit,
    resetAt: result.reset_at,
  };
}

/* -------------------------------------------------------------------------- */
/* Audit                                                                       */
/* -------------------------------------------------------------------------- */

export async function audit(
  action: string,
  opts: {
    entity?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.schema('app').rpc('write_audit', {
      p_action: action,
      p_entity: opts.entity ?? null,
      p_entity_id: opts.entityId ?? null,
      p_metadata: opts.metadata ?? {},
      p_ip_hash: await clientIpHash(),
      p_user_agent: await clientUserAgent(),
    });
  } catch (err) {
    // Auditing must never break the user-facing operation.
    console.error('[audit] failed', action, err);
  }
}

/** Audit an event for a user we know by id but who may not have a session. */
export async function auditAsSystem(
  action: string,
  opts: {
    actorId?: string | null;
    actorEmail?: string | null;
    entity?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    await admin.from('audit_log').insert({
      actor_id: opts.actorId ?? null,
      actor_email: opts.actorEmail ?? null,
      action,
      entity: opts.entity ?? null,
      entity_id: opts.entityId ?? null,
      metadata: opts.metadata ?? {},
      ip_hash: await clientIpHash().catch(() => null),
    });
  } catch (err) {
    console.error('[audit:system] failed', action, err);
  }
}

/* -------------------------------------------------------------------------- */
/* MFA recovery codes                                                          */
/* -------------------------------------------------------------------------- */

const RECOVERY_CODE_COUNT = 10;
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(): string {
  const bytes = randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i += 1) {
    out += RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length];
    if (i === 4) out += '-';
  }
  return out;
}

export function hashRecoveryCode(code: string): string {
  return createHash('sha256')
    .update(code.replace(/[^A-Za-z0-9]/g, '').toUpperCase())
    .digest('hex');
}

/**
 * Generate a fresh set of recovery codes, store only their hashes, and return
 * the plaintext exactly once. Any previously issued set is invalidated.
 */
export async function issueRecoveryCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, randomCode);
  const hashes = codes.map(hashRecoveryCode);

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('profiles')
    .update({
      recovery_codes: hashes,
      recovery_codes_generated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) throw new Error(`Could not store recovery codes: ${error.message}`);
  return codes;
}

/**
 * Consume a recovery code. Returns true if it matched, and removes it so the
 * code cannot be replayed. Comparison is constant-time per candidate.
 */
export async function consumeRecoveryCode(
  userId: string,
  submitted: string,
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('recovery_codes')
    .eq('id', userId)
    .single<{ recovery_codes: string[] }>();

  if (error || !data) return false;

  const candidate = Buffer.from(hashRecoveryCode(submitted), 'hex');
  let matchedIndex = -1;

  data.recovery_codes.forEach((stored, index) => {
    const storedBuf = Buffer.from(stored, 'hex');
    if (storedBuf.length === candidate.length && timingSafeEqual(storedBuf, candidate)) {
      matchedIndex = index;
    }
  });

  if (matchedIndex === -1) return false;

  const remaining = data.recovery_codes.filter((_, i) => i !== matchedIndex);
  await admin.from('profiles').update({ recovery_codes: remaining }).eq('id', userId);
  return true;
}
