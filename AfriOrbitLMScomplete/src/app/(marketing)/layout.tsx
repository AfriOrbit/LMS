import { SiteFooter, SiteNav } from '@/components/site-nav';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteNav />
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-12 sm:px-6">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
