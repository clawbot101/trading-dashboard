import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Algo Terminal',
  description: 'Live trading algo dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Google Fonts: Inter + IBM Plex Mono */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-hl-bg text-hl-text antialiased">
        {/* Top Navbar */}
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
                <div className="font-num text-sm font-medium">$--</div>
              </div>

              {/* 24h PnL */}
              <div className="text-right">
                <div className="text-xs text-hl-secondary">24h PnL</div>
                <div className="font-num text-sm font-medium">--</div>
              </div>
            </div>
          </div>
        </nav>

        {/* Main content */}
        <main className="pt-12 min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}

// NavLink component
function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  // In production, we'd use Next.js router to detect active path
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