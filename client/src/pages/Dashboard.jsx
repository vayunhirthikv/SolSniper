import React, { useEffect } from 'react';
import { MetricCard } from '../components/dashboard/MetricCard';
import { LiveFeed } from '../components/dashboard/LiveFeed';
import { OpenPositions } from '../components/dashboard/OpenPositions';
import { PnLChart } from '../components/dashboard/PnLChart';
import { DailyBarChart } from '../components/dashboard/DailyBarChart';
import { useData } from '../context/DataContext';
import { formatUSD, formatPct } from '../utils/formatters';

export function Dashboard() {
  const { stats, loadStats, totalRunningPnl, positions, priceUpdates } = useData();

  useEffect(() => { loadStats(); }, [loadStats]);

  const s = stats || {};
  const totalPnl    = parseFloat(s.total_pnl_usd || 0);
  const winRate     = parseFloat(s.win_rate || 0);
  const bestPnl     = parseFloat(s.best_trade_pnl_pct || 0);
  const openCount   = parseInt(s.open_trades || 0);

  const runningPnl = Object.keys(priceUpdates).length > 0
    ? totalRunningPnl
    : (positions || []).reduce((sum, p) => sum + (p.pnl_usd || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>
          Dashboard
        </h1>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', letterSpacing: '0.1em' }}>SIMULATION</span>
      </div>

      {/* ── Main 2-column layout ── */}
      {/*  Left (feed + charts)  |  Right sidebar (stats + positions)  */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>

        {/* ── LEFT COLUMN ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

          {/* Stats row: 4 equal cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <MetricCard label="Total P&L"       displayValue={`${totalPnl >= 0 ? '+' : ''}${formatUSD(totalPnl)}`}           type={totalPnl >= 0 ? 'profit' : 'loss'} />
            <MetricCard label="Running PnL"     displayValue={`${runningPnl >= 0 ? '+' : ''}${formatUSD(runningPnl)}`}       type={runningPnl >= 0 ? 'profit' : 'loss'} sublabel="unrealized" />
            <MetricCard label="Win Rate"        displayValue={`${winRate.toFixed(1)}%`}                                        type={winRate >= 20 ? 'profit' : 'loss'} />
            <MetricCard label="Best Trade"      displayValue={`${bestPnl >= 0 ? '+' : ''}${formatPct(bestPnl, 1)}`}           type={bestPnl >= 0 ? 'profit' : 'loss'} />
          </div>

          {/* Open Positions — main area */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px 20px' }}>
              <OpenPositions />
            </div>
          </div>

          {/* Charts side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card"><PnLChart /></div>
            <div className="card"><DailyBarChart /></div>
          </div>
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* 3 rows of compact stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <MetricCard label="Open"    displayValue={String(openCount)}                              type="accent"  compact />
            <MetricCard label="Closed"  displayValue={String(parseInt(s.closed_trades || 0))}         type="white"   compact />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <MetricCard label="Trades"  displayValue={String(parseInt(s.total_trades || 0))}          type="white"   compact />
            <MetricCard label="Scanned" displayValue={String(parseInt(s.tokens_scanned_today || 0))}  type="white"   compact />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <MetricCard label="Passed Filters" displayValue={String(parseInt(s.tokens_passed_today || 0))} type="neutral" compact />
          </div>

          {/* Live Feed — sidebar */}
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '16px 16px 0' }}>
              <LiveFeed />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
