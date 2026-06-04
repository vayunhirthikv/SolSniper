import React from 'react';
import { statusBadgeClass, scoreBadgeClass } from '../../utils/colors';

export function Badge({ type, children, className = '' }) {
  const cls = type ? statusBadgeClass(type) : '';
  return (
    <span className={`badge ${cls} ${className}`}>
      {children}
    </span>
  );
}

export function ScoreBadge({ score }) {
  return (
    <span className={`badge ${scoreBadgeClass(score)}`} style={{ minWidth: 28, justifyContent: 'center' }}>
      {score}
    </span>
  );
}

export function ExitReasonBadge({ reason }) {
  if (!reason) return <span className="badge badge-neutral">—</span>;
  const labels = {
    stop_loss: 'STOP LOSS',
    time_exit: 'TIME EXIT',
    liquidity_drop: 'LIQ DROP',
    dev_sell: 'DEV SELL',
    ladder_20pct: '20% LD',
    ladder_40pct: '40% LD',
    ladder_60pct: '60% LD',
    ladder_80pct: '80% LD',
    still_open: 'OPEN',
    '200pct': '+200% LD',
    '500pct': '+500% LD',
    '1000pct': '+1000% LD',
    '3000pct': '+3000% LD',
  };

  const badgeCls = ['stop_loss', 'liquidity_drop', 'dev_sell'].includes(reason)
    ? 'badge-loss'
    : reason === 'time_exit'
    ? 'badge-neutral'
    : reason.includes('ladder') || reason.includes('pct')
    ? 'badge-profit'
    : 'badge-neutral';

  return (
    <span className={`badge ${badgeCls}`}>
      {labels[reason] || reason.toUpperCase().replace(/_/g, ' ')}
    </span>
  );
}
