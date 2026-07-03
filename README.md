# Algo Terminal — Trading Dashboard

Production-quality web dashboard for a multi-strategy crypto perps trading bot (Hyperliquid + Lighter).

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS (Hyperliquid dark theme)
- TradingView Lightweight Charts (equity/price charts)
- Recharts (analytics charts)
- PostgreSQL (TimescaleDB)

## Quick Start

```bash
# Install dependencies
npm install --legacy-peer-deps

# Set up environment
cp .env.example .env.local
# Edit .env.local with your TimescaleDB connection string:
# TIMESCALEDB_TRADING_URL="postgres://user:pass@host:port/db?sslmode=require"

# Run development server
npm run dev
```

Open http://localhost:3000

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TIMESCALEDB_TRADING_URL` | PostgreSQL connection string for trading data |

## Database Schema

The dashboard reads from an existing PostgreSQL database with these tables:

- `trading_sessions` — Strategy instance metadata
- `trading_state` — Live position state (5s refresh)
- `equity_snapshots` — Historical equity curve
- `fills` — Trade execution history
- `order_events` — Order lifecycle events
- `funding_payments` — Perp funding payments
- `strategy_signals` — Strategy signal data

See SPEC.md for full schema details.

## Pages (Phase 1)

| Path | Description | Refresh |
|------|-------------|---------|
| `/` | Overview — stats, equity curve, strategy leaderboard, PnL attribution | 60s |
| `/positions` | Live Positions — dense table, summary strip, expandable rows | 5s |
| `/trades` | Trades & Orders — fills history, order events lifecycle | 5s |

## Phase 2 (Pending)

| Path | Description |
|------|-------------|
| `/strategy/[name]` | Strategy Detail — per-strategy equity, signals, regime |
| `/sessions` | Sessions & Risk — session history, config diff, volatility |

## Recommended SQL Indexes

```sql
-- Equity snapshots (time-series queries)
CREATE INDEX idx_equity_snapshots_ts ON equity_snapshots(ts DESC);
CREATE INDEX idx_equity_snapshots_session ON equity_snapshots(session_id, ts DESC);

-- Fills (paginated queries)
CREATE INDEX idx_fills_ts ON fills(ts DESC);
CREATE INDEX idx_fills_session ON fills(session_id, ts DESC);
CREATE INDEX idx_fills_symbol ON fills(symbol, ts DESC);

-- Order events (lifecycle queries)
CREATE INDEX idx_order_events_strategy_order ON order_events(strategy_order_id, ts);
CREATE INDEX idx_order_events_status ON order_events(event_status);

-- Trading state (live positions)
CREATE INDEX idx_trading_state_qty ON trading_state(position_qty) WHERE position_qty != 0;
CREATE INDEX idx_trading_state_updated ON trading_state(updated_at DESC);
```

## API Timeout Budget

- Target: 3 seconds
- Hard limit: 8 seconds
- All queries use parameterized SQL (no string concatenation)

## Phase 1 Completion Checklist

- [x] lib/db.ts — Database connection + schema types
- [x] lib/format.ts — Number formatting utilities
- [x] lib/metrics.ts — KPI calculation functions
- [x] lib/queries/overview.ts — Overview page SQL queries
- [x] lib/queries/positions.ts — Positions page SQL queries
- [x] lib/queries/trades.ts — Trades page SQL queries
- [x] app/api/overview/route.ts — Overview API endpoint
- [x] app/api/positions/route.ts — Positions API endpoint
- [x] app/api/fills/route.ts — Fills API endpoint
- [x] app/api/orders/route.ts — Orders API endpoint
- [x] app/layout.tsx — Dark theme + navbar
- [x] app/page.tsx — Overview page
- [x] app/positions/page.tsx — Live Positions page
- [x] app/trades/page.tsx — Trades & Orders page
- [x] app/globals.css — Tailwind + Hyperliquid theme
- [x] tailwind.config.ts — Custom color tokens
- [x] SPEC.md — Full specification reference

## Phase 2 Pending

- [ ] app/api/strategy/[name]/route.ts
- [ ] app/strategy/[name]/page.tsx
- [ ] app/api/sessions/route.ts
- [ ] app/sessions/page.tsx
- [ ] lib/queries/strategy.ts
- [ ] lib/queries/sessions.ts
- [ ] TradingView chart integration
- [ ] Recharts stacked bar integration
- [ ] BTC benchmark overlay
- [ ] Config diff viewer
- [ ] Round-trip trade grouping