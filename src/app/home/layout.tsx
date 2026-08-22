import { SiteFooter, SiteNav } from '@/components/site-nav';

/**
 * The marketing section wears the platform's own chrome.
 *
 * These nine pages used to be a separate deployment with its own header and
 * footer. Keeping those would have produced two navigations inside one
 * product — the thing this merge exists to remove. So they get the LMS nav and
 * footer, which is what makes /home read as part of the platform rather than
 * as a site that happens to be reachable from it.
 */
export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteNav />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
