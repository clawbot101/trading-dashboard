'use client';

import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function HeaderBar() {
  const { data } = useSWR('/api/overview?range=24h', fetcher, {
    refreshInterval: 30000, // 30s refresh
    dedupingInterval: 10000,
  });

  const stats = data?.data?.stats;
  const equity = stats?.total_equity;
  const pnl24h = stats?.pnl_24h;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-hl-panel border-b border-hl-border">
      <div className="flex items-center justify-between px-4 py-2">
        {/* Left: Logo */}
        <div className="flex items-center gap-2">
          <span className="text-hl-accent text-xl font-bold">⬡</span>
          <span className="text-hl-text font-semibold">Algo Terminal</span>
        </div>

        {/* Center: Page Tabs */}
        <div className="flex items-center gap-1">
          <NavLink href="/">Overview</NavLink>
          <NavLink href="/positions">Positions</NavLink>
          <NavLink href="/trades">Trades</NavLink>
          <NavLink href="/lifecycles">Lifecycles</NavLink>
        </div>

        {/* Right: Venue status + Equity + 24h PnL */}
        <div className="flex items-center gap-4">
          {/* Venue connection dots */}
          <div className="flex items-center gap-2">
            <VenueDot name="HL" connected={true} />
            <VenueDot name="LT" connected={false} />
          </div>

          {/* Account equity */}
          <div className="text-right">
            <div className="text-xs text-hl-secondary">Equity</div>
            <div className="font-num text-sm font-medium">
              {formatUsdShort(equity)}
            </div>
          </div>

          {/* 24h PnL */}
          <div className="text-right">
            <div className="text-xs text-hl-secondary">24h PnL</div>
            <div className={`font-num text-sm font-medium ${pnl24h >= 0 ? 'text-hl-profit' : 'text-hl-loss'}`}>
              {formatPnlShort(pnl24h)}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

// NavLink component
function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="px-3 py-1 text-sm text-hl-secondary hover:text-hl-text hover:bg-hl-hover rounded transition-colors"
    >
      {children}
    </a>
  );
}

// Venue connection dot
function VenueDot({ name, connected }: { name: string; connected: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <div
        className={`w-2 h-2 rounded-full ${
          connected ? 'bg-hl-profit' : 'bg-hl-loss'
        }`}
      />
      <span className="text-xs text-hl-muted">{name}</span>
    </div>
  );
}

// Short formatting for header
function formatUsdShort(n: number | null | undefined) {
  if (!n && n !== 0) return '$--';
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function formatPnlShort(n: number | null | undefined) {
  if (!n && n !== 0) return '--';
  const sign = n >= 0 ? '+' : '';
  if (Math.abs(n) >= 1e6) return `${sign}${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${sign}${(n / 1e3).toFixed(2)}K`;
  return `${sign}${n.toFixed(2)}`;
}