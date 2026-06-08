// Format dollar amounts
export function formatUSD(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) return '$0.00';
  const abs = Math.abs(Number(value));
  if (abs === 0) return '$0.00';
  if (abs >= 1_000_000) return `$${(Number(value) / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(Number(value) / 1_000).toFixed(1)}K`;
  if (abs < 0.01) return `$${Number(value).toFixed(4)}`;
  return `$${Number(value).toFixed(decimals)}`;
}

// Format percentage
export function formatPct(value, decimals = 2, showSign = true) {
  if (value === null || value === undefined || isNaN(value)) return '0.00%';
  const num = Number(value);
  const sign = showSign && num > 0 ? '+' : '';
  return `${sign}${num.toFixed(decimals)}%`;
}

// Format large numbers
export function formatNumber(value) {
  if (value === null || value === undefined || isNaN(value)) return '0';
  const n = Number(value);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

// Format price (handles very small values)
export function formatPrice(value, sig = 6) {
  if (!value || isNaN(value)) return '$0';
  const n = Number(value);
  if (n >= 1) return `$${n.toFixed(4)}`;
  if (n >= 0.0001) return `$${n.toFixed(6)}`;
  return `$${n.toExponential(2)}`;
}

// Format hold time
export function formatHoldTime(seconds) {
  if (!seconds) return '—';
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

// Parse date from SQLite or JSON formats safely as UTC if no timezone is specified
export function parseDate(ts) {
  if (!ts) return new Date();
  if (ts instanceof Date) return ts;
  if (typeof ts === 'number') return new Date(ts);
  
  if (typeof ts === 'string') {
    // If it doesn't specify a timezone offset (like Z, +0000, +05:30), assume it is UTC and add Z
    if (!ts.endsWith('Z') && !ts.includes('+') && !/[-+]\d{2}:?\d{2}$/.test(ts) && !ts.includes('GMT')) {
      // Convert "YYYY-MM-DD HH:MM:SS" to ISO "YYYY-MM-DDTHH:MM:SSZ"
      const isoStr = ts.trim().replace(' ', 'T') + 'Z';
      const parsed = new Date(isoStr);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }
  return new Date(ts);
}

// Format timestamp to local time
export function formatTime(ts) {
  if (!ts) return '—';
  return parseDate(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Format date
export function formatDate(ts) {
  if (!ts) return '—';
  return parseDate(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Format relative time
export function formatRelativeTime(ts) {
  if (!ts) return '—';
  const diff = Date.now() - parseDate(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// Format age in minutes
export function formatAge(minutes) {
  if (!minutes && minutes !== 0) return '—';
  if (minutes < 1) return `<1m`;
  return `${Math.round(minutes)}m`;
}

// Truncate address
export function truncateAddress(address, start = 6, end = 4) {
  if (!address) return '—';
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}
