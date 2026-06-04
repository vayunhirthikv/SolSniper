import React, { useState, useEffect } from 'react';
import { StatusDot } from '../shared/StatusDot';
import { useSocket } from '../../hooks/useSocket';
import { formatUSD } from '../../utils/formatters';
import { pnlColor } from '../../utils/colors';
import { useStrategy } from '../../context/StrategyContext';
import { useData } from '../../context/DataContext';

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg-muted)', letterSpacing: '0.05em' }}>
      {time.toLocaleTimeString()}
    </span>
  );
}

export function Topbar() {
  const { connected, on } = useSocket();
  const { settings } = useStrategy();
  const { stats } = useData();
  const [scannerRunning, setScannerRunning] = useState(true);

  const dailyLimit = parseFloat(settings.daily_loss_limit_usd || 40);
  const todayPnl = parseFloat(stats?.total_pnl_usd || 0);
  const todayLoss = parseFloat(stats?.today_losses || 0);

  useEffect(() => {
    return on('scanner_status', (data) => {
      setScannerRunning(data.running);
    });
  }, [on]);

  useEffect(() => {
    return on('daily_limit_reached', () => {
      setScannerRunning(false);
    });
  }, [on]);

  const lossLimitPct = Math.min((todayLoss / dailyLimit) * 100, 100);
  const pnlPositive = todayPnl >= 0;

  return (
    <div className="topbar">
      {/* Scanner status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <StatusDot status={connected ? (scannerRunning ? 'running' : 'paused') : 'error'} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', color: 'var(--fg-muted)' }}>
          {!connected ? 'DISCONNECTED' : scannerRunning ? 'SCANNER RUNNING' : 'SCANNER PAUSED'}
        </span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Daily Loss Limit */}
      <div className="loss-limit-bar" style={{ minWidth: 160 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', letterSpacing: '0.08em' }}>
          LOSS LIMIT
        </span>
        <div style={{ flex: 1, height: 4, background: 'var(--border)', minWidth: 80 }}>
          <div
            className="progress-fill"
            style={{
              width: `${lossLimitPct}%`,
              background: lossLimitPct > 80 ? 'var(--loss)' : lossLimitPct > 50 ? 'var(--neutral)' : 'var(--accent)',
            }}
          />
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>
          {formatUSD(todayLoss)}/{formatUSD(dailyLimit)}
        </span>
      </div>

      {/* Today's PnL badge */}
      <div style={{
        padding: '4px 12px',
        background: pnlPositive ? 'var(--profit-dim)' : 'var(--loss-dim)',
        border: `1px solid ${pnlPositive ? '#00ff8840' : '#ff444440'}`,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--fg-muted)' }}>
          TODAY
        </span>
        <span style={{
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
          color: pnlColor(todayPnl),
          letterSpacing: '-0.02em',
        }}>
          {todayPnl >= 0 ? '+' : ''}{formatUSD(todayPnl)}
        </span>
      </div>

      {/* Clock */}
      <LiveClock />

      {/* WS indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StatusDot status={connected ? 'running' : 'error'} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>
          {connected ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>
    </div>
  );
}
