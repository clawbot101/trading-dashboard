# Trading Dashboard Spec

You are building a production-quality web dashboard for a multi-strategy crypto perps trading bot that trades on Hyperliquid and Lighter. The dashboard reads from an existing PostgreSQL database (schema below; do not invent columns). Build it as a Next.js 14 (App Router) + TypeScript + Tailwind CSS app, with TradingView Lightweight Charts for equity/price charts and Recharts for bar/heatmap-style analytics. Data access via server-side API routes querying Postgres (use pg or Drizzle). All live panels auto-refresh every 5s, analytics every 60s, with a visible "last updated" timestamp and a pause toggle.

## Visual Design — match Hyperliquid / Hyperdash

Theme: dark only. Background #0f1a1f (page), panels/cards #16232b with 1px border #1e3038, hover #1a2a33.
Accent: Hyperliquid mint/teal #50d2c1 for primary actions, active tabs, links, and the equity curve line.
Semantic colors: profit/long = #26a69a (green-teal), loss/short = #ef5350 (red). Never use pure #00ff00/#ff0000.
Text: primary #f0f4f5, secondary #8b979e, muted #5c6b73.
Typography: UI text in Inter; ALL numbers (prices, PnL, qty, percentages) in a monospace font (IBM Plex Mono or JetBrains Mono), right-aligned in tables, thousands separators, consistent decimals (prices 4dp, PnL 2dp, percentages 2dp with explicit +/− sign).
Density: compact rows (~36px), thin dividers, no heavy card shadows.
PnL rendering: green text with subtle green background tint rgba(38,166,154,0.08) when positive, red equivalent when negative. Flash-highlight a cell briefly when its value changes on refresh.
Top navbar: left = logo/title "Algo Terminal", center = page tabs, right = venue connection status dots (Hyperliquid / Lighter, green if data seen in last 60s), account equity, and 24h PnL.

## Database Schema (read-only; do not invent columns)

```sql
trading_sessions(session_id uuid PK, strategy_name text, strategy_slot text,
  venue text, account_id text, token_pair text, started_at timestamptz,
  ended_at timestamptz, status text, config_snapshot jsonb,
  initial_capital numeric, strategy_version text)

trading_state(state_key text PK, updated_at timestamptz, session_id uuid,
  strategy_name text, strategy_slot text, venue text, account_id text,
  symbol text, base_asset text, quote_asset text, position_qty numeric,
  avg_entry_price numeric, mark_price numeric, unrealized_pnl numeric,
  realized_pnl numeric, leverage numeric, equity numeric, cash_balance numeric,
  config_name text, liquidation_price numeric, margin numeric,
  funding_accrued numeric, stop_price numeric, take_profit_price numeric)

equity_snapshots(ts timestamptz PK, session_id uuid PK, venue text,
  account_id text, equity numeric, cash_balance numeric,
  unrealized_pnl numeric, realized_pnl numeric, margin_used numeric,
  account_leverage numeric, withdrawable numeric)

fills(fill_id text PK, ts timestamptz, session_id uuid, venue text,
  symbol text, base_asset text, quote_asset text, strategy_order_id text,
  broker_order_id text, side text, fill_price numeric, fill_qty numeric,
  fee numeric, fee_asset text, realized_pnl numeric, is_maker boolean,
  fill_role text)

order_events(ts timestamptz, session_id uuid, venue text,
  symbol text, base_asset text, quote_asset text, strategy_order_id text,
  broker_order_id text, side text, order_type text, price numeric, qty numeric,
  event_type text, event_status text, source text, note text,
  tx_hashes jsonb, raw_payload jsonb, exchange_ts timestamptz)

funding_payments(ts timestamptz, session_id uuid, venue text, symbol text,
  funding_rate numeric, payment numeric, position_size numeric, mark_price numeric)

strategy_signals(ts timestamptz, session_id uuid, symbol text,
  signal_name text, signal_value numeric, rank int, target_weight numeric,
  decision text, regime text)
```

Assume uniqueness constraints:
- fills: UNIQUE(session_id, fill_id)
- funding_payments: UNIQUE(session_id, symbol, ts)
- strategy_signals: UNIQUE(session_id, symbol, signal_name, ts)

## Strategies

- Cross-Sectional Momentum (xsec_momentum)
- Single-Indicator strategies (trend_regime_long, meanrev_short, etc.)

## Global Controls (persist in URL query params)

- Time range selector: 24H / 7D / 30D / 90D / ALL / custom
- Venue filter: All / Hyperliquid / Lighter
- Strategy filter: multiselect over distinct strategy_name
- Live/Paused toggle for auto-refresh

## Live Data Freshness Rules

- Fresh (green): data age <= 15s
- Stale (amber): data age > 15s and <= 60s
- Disconnected (red): data age > 60s
- If disconnected, risk-critical widgets show warning banner and freeze value flashing

## Pages

### Page 1 — Overview (/)

Top row, 6 stat cards: Total Equity, 24h PnL ($ and %), Total Unrealized PnL, Total Realized PnL (period), Max Drawdown (period), Open Positions count / Gross Exposure.

Main chart (2/3 width): account equity curve, TradingView area chart with mint line and gradient fill; toggle overlays for per-strategy equity curves, drawdown sub-pane, BTC benchmark.

Right column (1/3 width): Strategy leaderboard table, Venue split donut/bars.

Bottom row: PnL attribution stacked bar per day, Recent activity feed (last 20 fills).

### Page 2 — Live Positions (/positions)

Full-width dense table: Symbol (venue badge) · Strategy · Side · Size · Notional · Leverage · Entry Price · Mark Price · Liq. Price · Unrealized PnL · Funding Accrued · Margin · Stop · Take Profit.

Above: summary strip — Total Notional Long, Total Notional Short, Net Exposure, Gross Leverage, Total uPnL.

Below: expandable row → mini price chart + recent fills + open orders.

### Page 3 — Strategy Detail (/strategy/[strategy_name])

Phase 2 — NOT implemented yet.

### Page 4 — Trades & Orders (/trades)

Two tabs: Fills (paginated table with filters, footer totals, CSV export) + Order Events (lifecycle view grouped by strategy_order_id).

### Page 5 — Sessions & Risk (/sessions)

Phase 2 — NOT implemented yet.

## Metric Definitions

- Return % = (equity_end − equity_start − net_deposits) / equity_start
- Sharpe = mean(daily)/std(daily) × √365
- Sortino uses downside std only
- Max drawdown from peak-to-trough
- Win rate and profit factor on round-trip trades
- Total PnL reconciliation check

## Engineering Requirements

- All heavy aggregations in SQL
- Parameterized SQL only
- Pagination: 50 rows/page, max 500
- API timeout: 3s target, 8s hard
- Downsample equity curves to ≤2000 points
- Skeleton loaders on first paint
- Responsive: tables scroll with sticky first column