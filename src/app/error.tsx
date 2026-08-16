'use client';

/**
 * What a visitor sees when a server render throws.
 *
 * Without this file Next sends a bare page reading "Internal Server Error".
 * That page is a dead end for everyone: the visitor cannot tell whether the
 * site is down or their account is broken, and whoever is on the other end of
 * the support message has nothing to search for.
 *
 * The error's `digest` is the one piece of information Next carries across the
 * server/client boundary in production — the message and stack are withheld on
 * purpose. Showing the digest costs nothing (it is a hash, it reveals nothing)
 * and makes the log searchable: the same digest appears on the
 * AFRIORBIT_SERVER_ERROR line written by src/instrumentation.ts.
 */

import { useEffect } from 'react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Development and preview builds do carry the message; print it where a
    // developer will actually look.
    console.error('[error boundary]', error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center px-4 py-16">
      <p className="font-mono text-xs uppercase tracking-widest text-[var(--text-muted)]">
        Something went wrong
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        This page could not be rendered
      </h1>
      <p className="mt-3 text-sm text-[var(--text-muted)]">
        The failure happened on the server, so retrying may well work. If it does not,
        the reference below identifies this exact error in the server log.
      </p>

      {error.digest ? (
        <dl className="mt-6 border border-[var(--border)] bg-[var(--bg-raised,transparent)] p-4 text-sm">
          <dt className="text-[var(--text-muted)]">Error reference</dt>
          <dd className="mt-1 font-mono text-base">{error.digest}</dd>
        </dl>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-ink)] hover:bg-[var(--accent-hover)]"
        >
          Try again
        </button>
        <a
          href="/dashboard"
          className="border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--bg-hover)]"
        >
          Back to the dashboard
        </a>
        <a
          href="/api/health"
          className="border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--bg-hover)]"
        >
          Check configuration
        </a>
      </div>

      <p className="mt-8 text-xs text-[var(--text-muted)]">
        Administrators: open the deployment&rsquo;s <strong>Runtime Logs</strong> (not the build
        logs) and search for <code className="font-mono">AFRIORBIT_SERVER_ERROR</code>
        {error.digest ? (
          <>
            {' '}
            or <code className="font-mono">{error.digest}</code>
          </>
        ) : null}
        . The full message and stack are there.
      </p>
    </div>
  );
}
