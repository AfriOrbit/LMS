'use client';

/**
 * The last-resort boundary: it catches failures in the ROOT layout itself,
 * which src/app/error.tsx cannot, because that one renders inside the layout
 * that just failed.
 *
 * It therefore has to supply its own <html> and <body>, and it must not depend
 * on anything the root layout provides — no design tokens, no fonts, no
 * globals.css. Every style here is inline for that reason. A boundary that
 * needs the thing it is catching the failure of is not a boundary.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#05070d',
          color: '#e7ecf5',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          padding: '2rem',
        }}
      >
        <main style={{ maxWidth: '34rem' }}>
          <p
            style={{
              margin: 0,
              fontSize: '0.75rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#8b97ab',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            AfriOrbit Learning
          </p>
          <h1 style={{ margin: '0.5rem 0 0', fontSize: '1.5rem', lineHeight: 1.25 }}>
            The application failed to start rendering
          </h1>
          <p style={{ color: '#8b97ab', fontSize: '0.9rem', lineHeight: 1.6 }}>
            This is not a problem with the page you asked for &mdash; something in the
            application shell threw before any page could render. Configuration is the
            usual cause.
          </p>

          {error.digest ? (
            <p
              style={{
                margin: '1.5rem 0',
                padding: '0.75rem 1rem',
                border: '1px solid #1d2635',
                borderRadius: '0.5rem',
                fontSize: '0.9rem',
              }}
            >
              <span style={{ color: '#8b97ab' }}>Error reference</span>
              <br />
              <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                {error.digest}
              </code>
            </p>
          ) : null}

          <p style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={reset}
              style={{
                background: '#3da9fc',
                color: '#05070d',
                border: 0,
                borderRadius: '0.5rem',
                padding: '0.55rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <a
              href="/api/health"
              style={{
                border: '1px solid #1d2635',
                borderRadius: '0.5rem',
                padding: '0.55rem 1rem',
                fontSize: '0.875rem',
                color: '#e7ecf5',
                textDecoration: 'none',
              }}
            >
              Check configuration
            </a>
          </p>

          <p style={{ color: '#8b97ab', fontSize: '0.75rem', lineHeight: 1.6 }}>
            Administrators: the full stack is in the deployment&rsquo;s Runtime Logs under{' '}
            <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              AFRIORBIT_SERVER_ERROR
            </code>
            .
          </p>
        </main>
      </body>
    </html>
  );
}
