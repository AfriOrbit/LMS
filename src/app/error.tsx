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

      {/*
        PRESENCE OF A DIGEST IS ITSELF THE DIAGNOSIS, and this page used to
        throw that away by asserting "the failure happened on the server"
        unconditionally.

        Next attaches `digest` when a SERVER component throws — it is the hash
        that appears in the platform's Runtime Log. An error thrown in the
        BROWSER, by a client component, reaches this same boundary with no
        digest at all, because there is no server-side log line to point at.

        Telling someone to search the Runtime Logs for a client-side error
        sends them to a log that will never contain it. They search, find
        nothing, and reasonably conclude the logging is broken. So the two
        cases now say different things, and the absent digest is reported as a
        fact rather than hidden.
      */}
      <p className="mt-3 text-sm text-[var(--text-muted)]">
        {error.digest
          ? 'The failure happened on the server, so retrying may well work. If it does not, the reference below identifies this exact error in the server log.'
          : 'This one failed in the browser rather than on the server — there is no server log entry for it. Retrying may well work.'}
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
        <a
          href="/api/health/db"
          className="border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--bg-hover)]"
        >
          Check database
        </a>
      </div>

      {error.digest ? (
        <p className="mt-8 text-xs text-[var(--text-muted)]">
          Administrators: open the deployment&rsquo;s <strong>Runtime Logs</strong> (not the
          build logs) and search for <code className="font-mono">{error.digest}</code> or{' '}
          <code className="font-mono">AFRIORBIT_SERVER_ERROR</code>. The full message and stack
          are there.
        </p>
      ) : (
        <p className="mt-8 text-xs text-[var(--text-muted)]">
          Administrators: <strong>no error reference was issued</strong>, which means this threw
          in the browser, not on the server &mdash; the Runtime Logs will not contain it. Open
          the browser console (F12 &rarr; Console) for the real message. Before that, try{' '}
          <strong>Check database</strong> above: a missing table is the most common cause, and it
          surfaces here rather than in the log.
        </p>
      )}
    </div>
  );
}
