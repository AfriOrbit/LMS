import { Suspense } from 'react';

import { CodeViewer } from '@/components/code/code-viewer';

export const metadata = { title: 'Lab code', robots: { index: false } };

/** /sims/code/?path=… — the lab code viewer that LMS lessons embed under their "Code:" line. */
export default function CodePage() {
  return (
    <main id="main" className="p-0">
      <Suspense fallback={null}>
        <CodeViewer />
      </Suspense>
    </main>
  );
}
