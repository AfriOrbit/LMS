'use client';

import { Alert, Button } from '@/components/ui/primitives';

import { useCopyLink } from './use-url-state';

/**
 * The bar that turns a configuration into a link.
 *
 * Shown on every simulator, because the persistence model here is "the URL is
 * the save file" and a learner has no reason to guess that unless it is said
 * plainly.
 */
export function ShareBar({
  link,
  warning,
  onReset,
  what,
}: {
  link: string;
  warning: string | null;
  onReset: () => void;
  what: string;
}) {
  const { copied, copy, supported } = useCopyLink(link);

  return (
    <div className="space-y-3">
      {warning ? (
        <Alert tone="warning" title="That link did not load cleanly">
          {warning}
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
        <p className="min-w-0 flex-1 text-sm text-[var(--text-muted)]">
          {link
            ? `This ${what} is in the address bar. Copy the link to share it — no account needed.`
            : `Change something and this ${what} becomes a shareable link.`}
        </p>
        {supported ? (
          <Button type="button" variant="secondary" onClick={copy} disabled={!link}>
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={onReset}>
          Reset
        </Button>
      </div>
    </div>
  );
}
