'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const PAGES = [
  { href: '/analysis/rules', label: 'Rules' },
  { href: '/analysis/pnl', label: 'PnL split' },
  { href: '/analysis/backtest', label: 'vs Backtest' },
];

export default function AnalysisShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const book = params.get('book') === 'l4' ? 'l4' : 'l2';

  function hrefFor(path: string) {
    return `${path}?book=${book}`;
  }

  function setBook(next: 'l2' | 'l4') {
    const path = PAGES.some((page) => pathname?.startsWith(page.href))
      ? pathname
      : '/analysis/rules';
    router.push(`${path}?book=${next}`);
  }

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Strategy Analysis</h1>
          <p className="text-xs text-hl-secondary">L2 and L4 only. Live pages are unchanged.</p>
        </div>
        <div className="flex gap-1">
          {(['l2', 'l4'] as const).map((id) => (
            <button
              key={id}
              onClick={() => setBook(id)}
              className={`px-3 py-1 text-sm rounded ${
                book === id ? 'bg-hl-accent text-hl-bg' : 'bg-hl-panel text-hl-secondary'
              }`}
            >
              {id.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-1">
        {PAGES.map((page) => {
          const active = pathname === page.href;
          return (
            <Link
              key={page.href}
              href={hrefFor(page.href)}
              className={`px-3 py-1 text-sm rounded ${
                active ? 'bg-hl-hover text-hl-text' : 'text-hl-secondary hover:text-hl-text'
              }`}
            >
              {page.label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
