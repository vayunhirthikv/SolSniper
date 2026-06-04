// Returns CSS color string based on PnL value
export function pnlColor(value) {
  if (!value && value !== 0) return 'var(--fg-muted)';
  if (value > 0) return 'var(--profit)';
  if (value < 0) return 'var(--loss)';
  return 'var(--neutral)';
}

// Returns class name
export function pnlClass(value) {
  if (!value && value !== 0) return 'pnl-neutral';
  if (value > 0) return 'pnl-positive';
  if (value < 0) return 'pnl-negative';
  return 'pnl-neutral';
}

// Score badge class
export function scoreBadgeClass(score) {
  if (score >= 7) return 'badge-score-7';
  if (score === 6) return 'badge-score-6';
  if (score === 5) return 'badge-score-5';
  return 'badge-score-4';
}

// Score color
export function scoreColor(score) {
  if (score >= 7) return 'var(--profit)';
  if (score === 6) return '#8b5cf6';
  if (score === 5) return '#f97316';
  return '#fbbf24';
}

// Status badge class
export function statusBadgeClass(status) {
  const map = {
    scanning: 'badge-scanning',
    rejected: 'badge-rejected',
    scored: 'badge-scored',
    bought: 'badge-bought',
    open: 'badge-open',
    closed: 'badge-closed',
  };
  return map[status?.toLowerCase()] || 'badge-neutral';
}

// Exit reason badge
export function exitReasonBadgeClass(reason) {
  if (!reason) return 'badge-neutral';
  if (reason.includes('ladder') || reason.includes('3000') || reason.includes('1000')) return 'badge-profit';
  if (reason === 'stop_loss') return 'badge-loss';
  if (reason === 'time_exit') return 'badge-neutral';
  if (reason === 'liquidity_drop') return 'badge-loss';
  return 'badge-neutral';
}

// Recharts gradient colors
export const CHART_COLORS = {
  profit: '#00ff88',
  loss: '#ff4444',
  accent: '#7c3aed',
  neutral: '#f59e0b',
  blue: '#60a5fa',
  grid: '#1f2030',
};
