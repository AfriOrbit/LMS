/**
 * Server-error reporting.
 *
 * WHY THIS FILE EXISTS
 *
 * A Server Component that throws in production shows the visitor the words
 * "Internal Server Error" and nothing else — no message, no stack, no route.
 * That is deliberate on Next's part (an error message can leak table names,
 * connection strings, row contents) but it means the person looking at the
 * broken page and the person who has to fix it are given exactly the same
 * information: none.
 *
 * `onRequestError` fires on the server for every such error, before the blank
 * page is sent. Writing a single clearly-marked line to stderr here turns a
 * Vercel Runtime Log from a wall of request lines into something you can find
 * by searching for one string: AFRIORBIT_SERVER_ERROR.
 *
 * Nothing is sent anywhere. stderr goes to the platform's log stream, which on
 * Vercel is Deployments → (deployment) → Runtime Logs. Not the Build Logs —
 * that distinction has cost real hours; the build can be perfectly green while
 * every request fails.
 */

import type { Instrumentation } from 'next';

/**
 * Headers worth having and safe to print. `cookie` and `authorization` are
 * deliberately absent: a session cookie in a log file is a session anyone with
 * log access can resume.
 */
const SAFE_HEADERS = ['host', 'user-agent', 'referer', 'x-vercel-id'] as const;

export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context,
) => {
  const err = error as { message?: string; stack?: string; digest?: string; code?: string } | null;

  const headers: Record<string, string> = {};
  for (const name of SAFE_HEADERS) {
    const value = request.headers?.[name];
    if (typeof value === 'string') headers[name] = value;
    else if (Array.isArray(value)) headers[name] = value.join(', ');
  }

  // The digest is the only thing the visitor can see. Printing it here is what
  // lets someone paste a digest from a browser into log search and land on the
  // stack trace that produced it.
  console.error(
    'AFRIORBIT_SERVER_ERROR ' +
      JSON.stringify({
        digest: err?.digest ?? null,
        message: err?.message ?? String(error),
        code: err?.code ?? null,
        path: request.path,
        method: request.method,
        routePath: context.routePath,
        routeType: context.routeType,
        renderSource: context.renderSource ?? null,
        headers,
      }),
  );

  // Separate call so the stack is not JSON-escaped into one unreadable line.
  if (err?.stack) console.error(err.stack);
};
