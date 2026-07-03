/**
 * Shared formatting utilities for the trading dashboard.
 * All numbers use monospace font, right-aligned in tables.
 */

/**
 * Format price with thousands separators and fixed decimals.
 * Right-aligned monospace style for tables.
 */
export function formatPrice(n: number | null | undefined, dp = 4): string {
  if (n === null || n === undefined || isNaN(n)) return '-';
  const absVal = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  
  // Abbreviate large numbers
  if (absVal >= 1_000_000) {
    return sign + (absVal / 1_000_000).toFixed(2) + 'M';
  }
  if (absVal >= 1_000) {
    return sign + (absVal / 1_000).toFixed(2) + 'K';
  }
  
  return sign + absVal.toFixed(dp);
}

/**
 * Format PnL with explicit +/- sign and 2dp.
 */
export function formatPnl(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return '-';
  if (n === 0) return '$0.00';
  const sign = n >= 0 ? '+' : '';
  const absVal = Math.abs(n);
  
  if (absVal >= 1_000_000) {
    return `$${sign}${(n / 1_000_000).toFixed(2)}M`;
  }
  if (absVal >= 1_000) {
    return `$${sign}${(n / 1_000).toFixed(2)}K`;
  }
  
  return `$${sign}${n.toFixed(2)}`;
}

/**
 * Format percentage with explicit +/- sign.
 */
export function formatPct(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined || isNaN(n)) return '-';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(dp)}%`;
}

/**
 * Format quantity with abbreviations.
 */
export function formatQty(n: number | null | undefined, dp = 4): string {
  if (n === null || n === undefined || isNaN(n)) return '-';
  const absVal = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  
  if (absVal >= 1_000_000) {
    return sign + (absVal / 1_000_000).toFixed(2) + 'M';
  }
  if (absVal >= 1_000) {
    return sign + (absVal / 1_000).toFixed(2) + 'K';
  }
  
  return sign + absVal.toFixed(dp);
}

/**
 * Format USD value with $ prefix.
 */
export function formatUsd(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined || isNaN(n)) return '-';
  const absVal = Math.abs(n);
  
  if (absVal >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(2)}M`;
  }
  if (absVal >= 1_000) {
    return `$${(n / 1_000).toFixed(2)}K`;
  }
  
  return `$${n.toFixed(dp)}`;
}

/**
 * Format leverage as badge-style string.
 */
export function formatLeverage(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return `${n.toFixed(1)}x`;
}

/**
 * Return Tailwind class string for PnL coloring.
 */
export function pnlCellClass(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n) || n === 0) {
    return '';
  }
  return n >= 0 ? 'pnl-positive' : 'pnl-negative';
}

/**
 * Format relative time (e.g., "5m ago", "2h ago").
 */
export function formatTimeAgo(ts: string | Date | null | undefined): string {
  if (!ts) return '-';
  const date = typeof ts === 'string' ? new Date(ts) : ts;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  if (seconds > 0) return `${seconds}s ago`;
  return 'just now';
}

/**
 * Format duration in human-readable form.
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '-';
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Format timestamp for display (local timezone).
 */
export function formatTimestamp(ts: string | Date | null | undefined): string {
  if (!ts) return '-';
  const date = typeof ts === 'string' ? new Date(ts) : ts;
  return date.toLocaleString();
}

/**
 * Format short timestamp (HH:MM:SS).
 */
export function formatTimeShort(ts: string | Date | null | undefined): string {
  if (!ts) return '-';
  const date = typeof ts === 'string' ? new Date(ts) : ts;
  return date.toLocaleTimeString();
}

/**
 * Format date for daily buckets.
 */
export function formatDate(ts: string | Date | null | undefined): string {
  if (!ts) return '-';
  const date = typeof ts === 'string' ? new Date(ts) : ts;
  return date.toLocaleDateString();
}

/**
 * Get freshness status based on data age.
 * @returns 'green' | 'amber' | 'red'
 */
export function getFreshness(lastUpdatedAt: string | Date | null): 'green' | 'amber' | 'red' {
  if (!lastUpdatedAt) return 'red';
  const date = typeof lastUpdatedAt === 'string' ? new Date(lastUpdatedAt) : lastUpdatedAt;
  const ageSeconds = (Date.now() - date.getTime()) / 1000;
  
  if (ageSeconds <= 15) return 'green';
  if (ageSeconds <= 60) return 'amber';
  return 'red';
}

/**
 * Get freshness CSS class.
 */
export function freshnessClass(lastUpdatedAt: string | Date | null): string {
  const status = getFreshness(lastUpdatedAt);
  return `freshness-${status}`;
}