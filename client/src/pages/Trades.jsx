import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrades, useTradeStats } from '../hooks/useTrades';
import { formatUSD, formatPct, formatHoldTime, parseDate } from '../utils/formatters';
import { pnlColor, pnlClass } from '../utils/colors';
import { ScoreBadge, ExitReasonBadge } from '../components/shared/Badge';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { useSocket } from '../hooks/useSocket';
import { useData } from '../context/DataContext';

function HoldTimer({ entryTime, initialHoldSeconds, status }) {
  const [elapsed, setElapsed] = useState(initialHoldSeconds || 0);

  useEffect(() => {
    if (status !== 'open') return;
    const entry = new Date(entryTime).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - entry) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [entryTime, status, initialHoldSeconds]);

  return <span>{formatHoldTime(elapsed)}</span>;
}

function SummaryBar({ stats }) {
  if (!stats) return null;
  const closed = parseInt(stats.closed_trades || 0);
  const wins = parseInt(stats.winning_trades || 0);
  const losses = parseInt(stats.losing_trades || 0);
  const winRate = closed > 0 ? ((wins / closed) * 100).toFixed(1) : '0.0';
  return (
    <div style={{ display:'flex', gap:20, flexWrap:'wrap', padding:'12px 20px', background:'var(--bg-muted)', border:'1px solid var(--border)' }}>
      {[
        { label:'TOTAL', value: stats.total_trades || 0 },
        { label:'OPEN', value: stats.open_trades || 0, color:'var(--profit)' },
        { label:'CLOSED', value: closed },
        { label:'WINNERS', value: wins, color:'var(--profit)' },
        { label:'LOSERS', value: losses, color:'var(--loss)' },
        { label:'WIN RATE', value: `${winRate}%`, color: parseFloat(winRate) >= 20 ? 'var(--profit)' : 'var(--loss)' },
        { label:'TOTAL P&L', value: formatUSD(stats.total_pnl_usd || 0), color: pnlColor(parseFloat(stats.total_pnl_usd || 0)) },
      ].map(item => (
        <div key={item.label}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--fg-muted)', letterSpacing:'0.1em', marginBottom:2 }}>{item.label}</div>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:16, color:item.color || 'var(--fg)' }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export function Trades() {
  const navigate = useNavigate();
  const { stats } = useTradeStats();
  const { on } = useSocket();
  // Global price updates from DataContext — survives page navigation
  const { priceUpdates } = useData();

  const [filters, setFilters] = useState({ status:'', score_min:'', exit_reason:'', date_from:'', date_to:'' });
  const [pnlFilter, setPnlFilter] = useState('');
  const { trades, total, loading, refetch } = useTrades(filters);
  const [localTrades, setLocalTrades] = useState([]);

  useEffect(() => {
    setLocalTrades(trades);
  }, [trades]);

  useEffect(() => {
    const off2 = on('trade_opened', (data) => {
      if (data.trade) {
        setLocalTrades(prev => {
          if (prev.some(t => t.id === data.trade.id)) return prev;
          if (filters.status && filters.status !== 'open') return prev;
          return [data.trade, ...prev].slice(0, 100);
        });
      }
    });

    const off3 = on('trade_closed', (data) => {
      if (data.trade) {
        setLocalTrades(prev => prev.map(t => t.id === data.trade.id ? data.trade : t));
      }
    });

    return () => { off2(); off3(); };
  }, [on, filters.status]);

  // Merge live price updates (from DataContext) into local trades for display
  // This means PnL always reflects the last known price_update even after navigation
  const mergedTrades = localTrades.map(t => {
    const update = priceUpdates[t.id];
    if (!update || t.status !== 'open') return t;
    return {
      ...t,
      pnl_pct: update.pnlPct ?? t.pnl_pct,
      pnl_usd: update.pnlUsd ?? t.pnl_usd,
    };
  });

  const filteredTrades = pnlFilter === 'winners' ? mergedTrades.filter(t => t.pnl_usd > 0)
    : pnlFilter === 'losers' ? mergedTrades.filter(t => t.pnl_usd < 0) : mergedTrades;

  const exportCSV = () => {
    const headers = ['ID','Token','Entry Time','Entry Price','Position $','Score','PnL %','PnL $','Hold Time','Exit Reason','Status'];
    const rows = filteredTrades.map(t => [
      t.id, t.token_name, t.entry_time, t.entry_price, t.position_size_usd,
      t.soft_score_at_entry, t.pnl_pct?.toFixed(2), t.pnl_usd?.toFixed(4),
      formatHoldTime(t.hold_time_seconds), t.exit_reason, t.status
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type:'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `solsniper_trades_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ display:'flex', alignItems:'baseline', gap:12 }}>
        <h1 style={{ fontFamily:'var(--font-display)', fontSize:28, fontWeight:800, letterSpacing:'-0.04em' }}>Trades</h1>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--fg-muted)' }}>{total} TOTAL</span>
      </div>

      <SummaryBar stats={stats} />

      {/* Filters */}
      <div className="card" style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
        <select className="input" style={{ width:120 }} value={filters.status} onChange={e => setFilters(p => ({ ...p, status:e.target.value }))}>
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
        <select className="input" style={{ width:120 }} value={filters.score_min} onChange={e => setFilters(p => ({ ...p, score_min:e.target.value }))}>
          <option value="">Any Score</option>
          <option value="4">Score 4+</option>
          <option value="5">Score 5+</option>
          <option value="6">Score 6+</option>
          <option value="7">Score 7+</option>
        </select>
        <select className="input" style={{ width:140 }} value={filters.exit_reason} onChange={e => setFilters(p => ({ ...p, exit_reason:e.target.value }))}>
          <option value="">All Exits</option>
          <option value="stop_loss">Stop Loss</option>
          <option value="time_exit">Time Exit</option>
          <option value="liquidity_drop">Liquidity Drop</option>
          <option value="200pct">200% Ladder</option>
          <option value="500pct">500% Ladder</option>
          <option value="1000pct">1000% Ladder</option>
          <option value="3000pct">3000% Ladder</option>
        </select>
        <select className="input" style={{ width:120 }} value={pnlFilter} onChange={e => setPnlFilter(e.target.value)}>
          <option value="">All PnL</option>
          <option value="winners">Winners</option>
          <option value="losers">Losers</option>
        </select>
        <input type="date" className="input" style={{ width:140 }} value={filters.date_from} onChange={e => setFilters(p => ({ ...p, date_from:e.target.value }))} />
        <input type="date" className="input" style={{ width:140 }} value={filters.date_to} onChange={e => setFilters(p => ({ ...p, date_to:e.target.value }))} />
        <div style={{ flex:1 }} />
        <button className="btn btn-outline" style={{ fontSize:11 }} onClick={exportCSV}>EXPORT CSV</button>
      </div>

      {/* Table */}
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Entry Time</th>
                <th>Entry $</th>
                <th>Size</th>
                <th>Score</th>
                <th>PnL %</th>
                <th>PnL $</th>
                <th style={{ color: 'var(--profit)' }}>High %</th>
                <th style={{ color: 'var(--loss)' }}>Low %</th>
                <th>Hold Time</th>
                <th>Exit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={10} style={{ textAlign:'center', padding:40 }}><LoadingSpinner /></td></tr>}
              {!loading && filteredTrades.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign:'center', padding:40, color:'var(--fg-muted)', fontFamily:'var(--font-mono)', fontSize:12 }}>No trades yet</td></tr>
              )}
              {filteredTrades.map(t => {
                const hasLiveUpdate = !!priceUpdates[t.id] && t.status === 'open';
                const update = priceUpdates[t.id];
                const highPnl = update?.highPnl ?? t.high_pnl_pct;
                const lowPnl  = update?.lowPnl  ?? t.low_pnl_pct;
                return (
                  <tr key={t.id} onClick={() => navigate(`/token/${t.token_address}`)}
                    className={t.pnl_usd > 0 ? 'profit-row' : t.pnl_usd < 0 ? 'loss-row' : ''}>
                    <td style={{ fontWeight:600, maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.token_name}</td>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--fg-muted)', whiteSpace:'nowrap' }}>
                      {parseDate(t.entry_time).toLocaleString([], { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                    </td>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{t.entry_price < 0.0001 ? t.entry_price?.toExponential(2) : t.entry_price?.toFixed(6)}</td>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{formatUSD(t.position_size_usd)}</td>
                    <td><ScoreBadge score={t.soft_score_at_entry} /></td>
                    <td style={{
                      fontFamily:'var(--font-display)', fontWeight:700, color:pnlColor(t.pnl_pct),
                      animation: hasLiveUpdate ? 'count-up 300ms ease-out' : 'none',
                    }}>
                      {t.pnl_pct !== null && t.pnl_pct !== undefined ? `${t.pnl_pct >= 0 ? '+' : ''}${t.pnl_pct?.toFixed(2)}%` : '—'}
                    </td>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:12, color:pnlColor(t.pnl_usd) }}>
                      {t.pnl_usd !== null && t.pnl_usd !== undefined ? `${t.pnl_usd >= 0 ? '+' : ''}${formatUSD(t.pnl_usd)}` : '—'}
                    </td>
                    {/* High % */}
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--profit)', fontWeight:600 }}>
                      {highPnl != null ? `+${highPnl.toFixed(1)}%` : '—'}
                    </td>
                    {/* Low % */}
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--loss)', fontWeight:600 }}>
                      {lowPnl != null ? `${lowPnl >= 0 ? '+' : ''}${lowPnl.toFixed(1)}%` : '—'}
                    </td>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--fg-muted)' }}>
                      <HoldTimer entryTime={t.entry_time} initialHoldSeconds={t.hold_time_seconds} status={t.status} />
                    </td>
                    <td><ExitReasonBadge reason={t.exit_reason} /></td>
                    <td>
                      <span className={`badge badge-${t.status}`} style={{ fontSize:9 }}>{t.status?.toUpperCase()}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
