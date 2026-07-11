-- Sample seed data for local development
-- Run this after creating the schema tables

-- Optional cash-flow table used to exclude deposits/withdrawals from strategy PnL.
CREATE TABLE IF NOT EXISTS cash_flows (
  flow_id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL,
  session_id UUID NULL,
  venue TEXT NULL,
  account_id TEXT NULL,
  flow_type TEXT NULL, -- deposit | withdrawal | transfer_in | transfer_out
  amount NUMERIC NOT NULL,
  note TEXT NULL
);

-- Trading sessions
INSERT INTO trading_sessions (session_id, strategy_name, strategy_slot, venue, account_id, token_pair, started_at, ended_at, status, config_snapshot, initial_capital, strategy_version) VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'xsec_momentum', 'slot1', 'Hyperliquid', 'acc_001', 'BTC-USDT', '2026-06-01 00:00:00+00', NULL, 'running', '{"lookback_days": 14, "rebalance_interval": "1d"}', 100000.00, 'v1.0'),
  ('b2c3d4e5-f6a7-8901-bcde-f12345678901', 'trend_regime_long', 'slot1', 'Hyperliquid', 'acc_002', 'ETH-USDT', '2026-06-15 00:00:00+00', NULL, 'running', '{"regime_filter": true}', 50000.00, 'v2.1'),
  ('c3d4e5f6-a7b8-9012-cdef-123456789012', 'meanrev_short', 'slot1', 'Lighter', 'acc_003', 'SOL-USDT', '2026-06-20 00:00:00+00', '2026-06-25 12:00:00+00', 'stopped', '{"meanrev_window": 20}', 30000.00, 'v1.5');

-- Trading state (live positions)
INSERT INTO trading_state (state_key, updated_at, session_id, strategy_name, strategy_slot, venue, account_id, symbol, base_asset, quote_asset, position_qty, avg_entry_price, mark_price, unrealized_pnl, realized_pnl, leverage, equity, cash_balance, config_name, liquidation_price, margin, funding_accrued, stop_price, take_profit_price) VALUES
  ('state_001', '2026-07-02 16:00:00+00', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'xsec_momentum', 'slot1', 'Hyperliquid', 'acc_001', 'BTC', 'BTC', 'USDT', 0.5, 61000.00, 61500.00, 250.00, 1200.00, 3.0, 100250.00, 85000.00, 'default', 55000.00, 20000.00, 15.00, NULL, NULL),
  ('state_002', '2026-07-02 16:00:00+00', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'xsec_momentum', 'slot1', 'Hyperliquid', 'acc_001', 'ETH', 'ETH', 'USDT', -2.0, 1650.00, 1700.00, -100.00, 300.00, 2.5, 100150.00, 85000.00, 'default', 2200.00, 15000.00, -8.00, NULL, NULL),
  ('state_003', '2026-07-02 16:00:00+00', 'b2c3d4e5-f6a7-8901-bcde-f12345678901', 'trend_regime_long', 'slot1', 'Hyperliquid', 'acc_002', 'ETH', 'ETH', 'USDT', 5.0, 1680.00, 1700.00, 100.00, 0.00, 4.0, 50100.00, 42000.00, 'trend_config', 1400.00, 12500.00, 5.00, 1600.00, 1850.00);

-- Equity snapshots (7 days)
INSERT INTO equity_snapshots (ts, session_id, venue, account_id, equity, cash_balance, unrealized_pnl, realized_pnl, margin_used, account_leverage, withdrawable) VALUES
  ('2026-06-25 00:00:00+00', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Hyperliquid', 'acc_001', 98000.00, 80000.00, -500.00, 1500.00, 18000.00, 2.5, 80000.00),
  ('2026-06-26 00:00:00+00', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Hyperliquid', 'acc_001', 98500.00, 82000.00, -200.00, 1700.00, 16500.00, 2.3, 82000.00),
  ('2026-06-27 00:00:00+00', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Hyperliquid', 'acc_001', 99000.00, 84000.00, 0.00, 2000.00, 15000.00, 2.2, 84000.00),
  ('2026-06-28 00:00:00+00', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Hyperliquid', 'acc_001', 100000.00, 85000.00, 200.00, 800.00, 15000.00, 2.3, 85000.00),
  ('2026-06-29 00:00:00+00', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Hyperliquid', 'acc_001', 100200.00, 85000.00, 300.00, 900.00, 15200.00, 2.4, 85000.00),
  ('2026-06-30 00:00:00+00', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Hyperliquid', 'acc_001', 100150.00, 85000.00, 150.00, 1000.00, 15000.00, 2.3, 85000.00),
  ('2026-07-01 00:00:00+00', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Hyperliquid', 'acc_001', 100250.00, 85000.00, 250.00, 1000.00, 20000.00, 3.0, 85000.00),
  ('2026-07-02 00:00:00+00', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Hyperliquid', 'acc_001', 100150.00, 85000.00, 150.00, 1100.00, 15000.00, 2.5, 85000.00);

-- Fills (last 20)
INSERT INTO fills (fill_id, ts, session_id, venue, symbol, base_asset, quote_asset, strategy_order_id, broker_order_id, side, fill_price, fill_qty, fee, fee_asset, realized_pnl, is_maker, fill_role) VALUES
  ('fill_001', '2026-07-02 15:30:00+00', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Hyperliquid', 'BTC', 'BTC', 'USDT', 'ord_101', 'broker_101', 'buy', 61000.00, 0.1, 6.10, 'USDT', NULL, false, 'open'),
  ('fill_002', '2026-07-02 14:00:00+00', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Hyperliquid', 'ETH', 'ETH', 'USDT', 'ord_102', 'broker_102', 'sell', 1650.00, 0.5, 0.83, 'USDT', 75.00, true, 'close'),
  ('fill_003', '2026-07-02 12:00:00+00', 'b2c3d4e5-f6a7-8901-bcde-f12345678901', 'Hyperliquid', 'ETH', 'ETH', 'USDT', 'ord_201', 'broker_201', 'buy', 1680.00, 1.0, 1.68, 'USDT', NULL, false, 'open'),
  ('fill_004', '2026-07-01 16:00:00+00', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Hyperliquid', 'BTC', 'BTC', 'USDT', 'ord_103', 'broker_103', 'sell', 60800.00, 0.05, 3.04, 'USDT', 40.00, true, 'close');

-- Order events
INSERT INTO order_events (ts, session_id, venue, symbol, base_asset, quote_asset, strategy_order_id, broker_order_id, side, order_type, price, qty, event_type, event_status, source, note, tx_hashes, raw_payload, exchange_ts) VALUES
  ('2026-07-02 15:29:00+00', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Hyperliquid', 'BTC', 'BTC', 'USDT', 'ord_101', NULL, 'buy', 'limit', 61000.00, 0.1, 'created', 'open', 'strategy', 'Entry order', NULL, NULL, '2026-07-02 15:29:00+00'),
  ('2026-07-02 15:29:30+00', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Hyperliquid', 'BTC', 'BTC', 'USDT', 'ord_101', 'broker_101', 'buy', 'limit', 61000.00, 0.1, 'submitted', 'submitted', 'broker', NULL, NULL, NULL, '2026-07-02 15:29:30+00'),
  ('2026-07-02 15:30:00+00', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Hyperliquid', 'BTC', 'BTC', 'USDT', 'ord_101', 'broker_101', 'buy', 'limit', 61000.00, 0.1, 'filled', 'filled', 'exchange', NULL, NULL, NULL, '2026-07-02 15:30:00+00'),
  ('2026-07-02 14:00:00+00', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Hyperliquid', 'ETH', 'ETH', 'USDT', 'ord_102', 'broker_102', 'sell', 'limit', 1650.00, 0.5, 'filled', 'filled', 'exchange', 'Partial close', NULL, NULL, '2026-07-02 14:00:00+00');

-- Funding payments
INSERT INTO funding_payments (ts, session_id, venue, symbol, funding_rate, payment, position_size, mark_price) VALUES
  ('2026-07-02 08:00:00+00', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Hyperliquid', 'BTC', 0.0001, 5.00, 0.5, 61500.00),
  ('2026-07-01 08:00:00+00', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Hyperliquid', 'BTC', 0.0002, 10.00, 0.5, 61000.00),
  ('2026-07-02 08:00:00+00', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Hyperliquid', 'ETH', -0.0005, -8.00, -2.0, 1700.00);

-- Strategy signals
INSERT INTO strategy_signals (ts, session_id, symbol, signal_name, signal_value, rank, target_weight, decision, regime) VALUES
  ('2026-07-02 00:00:00+00', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'BTC', 'momentum_14d', 0.15, 1, 0.10, 'LONG', 'BULL'),
  ('2026-07-02 00:00:00+00', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'ETH', 'momentum_14d', -0.08, 50, -0.05, 'SHORT', 'BULL'),
  ('2026-07-02 00:00:00+00', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'SOL', 'momentum_14d', 0.02, 25, 0.00, 'FLAT', 'BULL'),
  ('2026-07-02 00:00:00+00', 'b2c3d4e5-f6a7-8901-bcde-f12345678901', 'ETH', 'trend_signal', 1.0, NULL, NULL, 'LONG', 'BULL');