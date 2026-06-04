import React from 'react';
import { useAnalytics } from '../hooks/useAnalytics';
import { formatUSD, formatPct, formatHoldTime } from '../utils/formatters';
import { pnlColor } from '../utils/colors';
import { PageLoader } from '../components/shared/LoadingSpinner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts';

const COLORS = ['#ff4444','#ff6644','#f97316','#fbbf24','#00ff88','#60a5fa','#a78bfa','#ec4899'];

const SectionHeader = ({ title }) => (
  <div className="section-header">
    <span className="section-title">{title}</span>
  </div>
);

function ScoreTable({ data }) {
  if (!data?.length) return <p style={{ color:'var(--fg-muted)', fontFamily:'var(--font-mono)', fontSize:12 }}>No data</p>;
  return (
    <table className="data-table">
      <thead><tr><th>Score</th><th>Trades</th><th>Win %</th><th>Avg PnL %</th><th>Best %</th><th>Total $</th></tr></thead>
      <tbody>
        {data.map(row => {
          const winRate = row.trades > 0 ? ((row.wins / row.trades) * 100).toFixed(1) : '0';
          return (
            <tr key={row.score_bucket}>
              <td><span className="badge badge-scored">{row.score_bucket}</span></td>
              <td style={{ fontFamily:'var(--font-mono)' }}>{row.trades}</td>
              <td style={{ fontFamily:'var(--font-mono)', color: parseFloat(winRate) >= 20 ? 'var(--profit)' : 'var(--loss)' }}>{winRate}%</td>
              <td style={{ fontFamily:'var(--font-mono)', color: pnlColor(row.avg_pnl_pct) }}>{parseFloat(row.avg_pnl_pct || 0).toFixed(2)}%</td>
              <td style={{ fontFamily:'var(--font-mono)', color:'var(--profit)' }}>{parseFloat(row.best_pnl_pct || 0).toFixed(1)}%</td>
              <td style={{ fontFamily:'var(--font-mono)', color: pnlColor(row.total_pnl_usd) }}>{formatUSD(row.total_pnl_usd)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function FilterChart({ data }) {
  if (!data?.length) return <p style={{ color:'var(--fg-muted)', fontFamily:'var(--font-mono)', fontSize:12 }}>No rejections yet</p>;
  const chartData = data.map(d => ({ name: d.filter_name?.replace(/_/g,' '), count: parseInt(d.rejected_count) }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} layout="vertical" margin={{ left:20, right:20, top:5, bottom:5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tick={{ fill:'var(--fg-muted)', fontSize:10, fontFamily:'var(--font-mono)' }} tickLine={false} axisLine={false} />
        <YAxis dataKey="name" type="category" tick={{ fill:'var(--fg-muted)', fontSize:10, fontFamily:'var(--font-mono)' }} tickLine={false} axisLine={false} width={100} />
        <Tooltip contentStyle={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', fontFamily:'var(--font-mono)', fontSize:11 }} />
        <Bar dataKey="count" fill="var(--loss)" radius={0} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ExitLadderFunnel({ data }) {
  if (!data?.ladder_funnel) return null;
  const f = data.ladder_funnel;
  const total = parseInt(f.total || 0);
  const stages = [
    { label: 'Entered', value: total },
    { label: '+200%', value: parseInt(f.reached_200 || 0) },
    { label: '+500%', value: parseInt(f.reached_500 || 0) },
    { label: '+1000%', value: parseInt(f.reached_1000 || 0) },
    { label: '+3000%', value: parseInt(f.reached_3000 || 0) },
  ];
  return (
    <div style={{ display:'flex', gap:4, alignItems:'flex-end', height:120 }}>
      {stages.map((s, i) => {
        const pct = total > 0 ? (s.value / total) * 100 : 0;
        return (
          <div key={i} style={{ flex:1, textAlign:'center' }}>
            <div style={{ fontSize:12, fontFamily:'var(--font-mono)', color:'var(--fg-muted)', marginBottom:4 }}>{s.value}</div>
            <div style={{ height: Math.max(pct * 0.8, 4), background: i === 0 ? 'var(--accent)' : 'var(--profit)', opacity: 0.6 + (i * 0.08), transition:'height 500ms' }} />
            <div style={{ fontSize:10, fontFamily:'var(--font-mono)', color:'var(--fg-muted)', marginTop:4 }}>{s.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function TimeHeatmap({ data }) {
  if (!data?.by_hour?.length) return <p style={{ color:'var(--fg-muted)', fontFamily:'var(--font-mono)', fontSize:12 }}>No time data yet</p>;
  const maxPnl = Math.max(...data.by_hour.map(d => Math.abs(parseFloat(d.avg_pnl_pct || 0))));
  return (
    <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
      {data.by_hour.map(h => {
        const pnl = parseFloat(h.avg_pnl_pct || 0);
        const intensity = maxPnl > 0 ? Math.abs(pnl) / maxPnl : 0;
        const color = pnl > 0 ? `rgba(0,255,136,${0.1 + intensity * 0.9})` : `rgba(255,68,68,${0.1 + intensity * 0.9})`;
        return (
          <div key={h.hour} style={{ width:28, height:28, background:color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontFamily:'var(--font-mono)', color:'rgba(255,255,255,0.7)' }} title={`${h.hour}:00 - ${parseFloat(h.avg_pnl_pct || 0).toFixed(1)}% avg`}>
            {h.hour}
          </div>
        );
      })}
    </div>
  );
}

function SourceCompare({ data }) {
  if (!data?.length) return <p style={{ color:'var(--fg-muted)', fontFamily:'var(--font-mono)', fontSize:12 }}>No source data yet</p>;
  const pumpfun = data.filter(d => d.pumpfun_graduated);
  const nonPump = data.filter(d => !d.pumpfun_graduated);
  const lpLocked = data.filter(d => d.lp_locked);
  const hasSocial = data.filter(d => d.has_social);
  const calcWinRate = (arr) => {
    const total = arr.reduce((s, d) => s + parseInt(d.trades || 0), 0);
    const wins = arr.reduce((s, d) => s + parseInt(d.wins || 0), 0);
    return total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0';
  };
  const calcAvgPnl = (arr) => {
    if (!arr.length) return 0;
    return arr.reduce((s, d) => s + parseFloat(d.avg_pnl_pct || 0), 0) / arr.length;
  };
  const groups = [
    { label:'Pump.fun Grad', a:pumpfun, b:nonPump, aLabel:'Graduated', bLabel:'Non-Pump' },
    { label:'Social', a:hasSocial, b:data.filter(d => !d.has_social), aLabel:'Has Social', bLabel:'No Social' },
    { label:'LP Locked', a:lpLocked, b:data.filter(d => !d.lp_locked), aLabel:'Locked', bLabel:'Unlocked' },
  ];
  return (
    <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
      {groups.map(g => (
        <div key={g.label} className="card" style={{ flex:'1 1 200px' }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--fg-muted)', letterSpacing:'0.1em', marginBottom:12 }}>{g.label}</div>
          <div style={{ display:'flex', gap:12 }}>
            {[{ label:g.aLabel, data:g.a }, { label:g.bLabel, data:g.b }].map(item => (
              <div key={item.label} style={{ flex:1 }}>
                <div style={{ fontSize:10, color:'var(--fg-muted)', fontFamily:'var(--font-mono)', marginBottom:4 }}>{item.label}</div>
                <div style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:700, color: parseFloat(calcWinRate(item.data)) >= 20 ? 'var(--profit)' : 'var(--loss)' }}>{calcWinRate(item.data)}%</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:pnlColor(calcAvgPnl(item.data)) }}>{calcAvgPnl(item.data).toFixed(1)}% avg</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Analytics() {
  const { overview, scoreBreakdown, filterBreakdown, exitAnalysis, timeAnalysis, sourceAnalysis, moonshots, lossAnalysis, loading } = useAnalytics();

  if (loading) return <PageLoader />;

  const winRate = overview ? (parseInt(overview.closed_trades) > 0 ? ((parseInt(overview.winning_trades) / parseInt(overview.closed_trades)) * 100).toFixed(1) : '0.0') : '0.0';

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
      <div style={{ display:'flex', alignItems:'baseline', gap:12 }}>
        <h1 style={{ fontFamily:'var(--font-display)', fontSize:28, fontWeight:800, letterSpacing:'-0.04em' }}>Analytics</h1>
      </div>

      {/* Section A: Overall Performance */}
      <div className="card">
        <SectionHeader title="A — Overall Performance" />
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px, 1fr))', gap:16 }}>
          {[
            { label:'Total P&L', value: formatUSD(overview?.total_pnl_usd || 0), color: pnlColor(overview?.total_pnl_usd || 0) },
            { label:'Expectancy/Trade', value: formatUSD(overview?.expectancy || 0), color: pnlColor(overview?.expectancy || 0) },
            { label:'Win Rate', value: `${winRate}%`, color: parseFloat(winRate) >= 20 ? 'var(--profit)' : 'var(--loss)' },
            { label:'Best Trade', value: formatPct(overview?.best_trade_pnl_pct || 0, 1), color:'var(--profit)' },
            { label:'Worst Trade', value: formatPct(overview?.worst_trade_pnl_pct || 0, 1), color:'var(--loss)' },
            { label:'Total Trades', value: overview?.total_trades || 0 },
            { label:'Avg Hold', value: formatHoldTime(overview?.avg_hold_time_seconds || 0) },
          ].map(item => (
            <div key={item.label}>
              <div className="metric-label">{item.label}</div>
              <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:20, color:item.color || 'var(--fg)', letterSpacing:'-0.03em' }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Section B: Score Analysis */}
      <div className="card">
        <SectionHeader title="B — Score Analysis" />
        <ScoreTable data={scoreBreakdown} />
      </div>

      {/* Section C: Filter Analysis */}
      <div className="card">
        <SectionHeader title="C — Filter Rejection Analysis" />
        <FilterChart data={filterBreakdown} />
      </div>

      {/* Section D: Exit Ladder */}
      <div className="card">
        <SectionHeader title="D — Exit Ladder Funnel" />
        <ExitLadderFunnel data={exitAnalysis} />
        {exitAnalysis?.by_exit_reason?.length > 0 && (
          <div style={{ marginTop:20 }}>
            <table className="data-table">
              <thead><tr><th>Exit Reason</th><th>Count</th><th>Avg PnL %</th><th>Total $</th></tr></thead>
              <tbody>
                {exitAnalysis.by_exit_reason.map(r => (
                  <tr key={r.exit_reason}>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:12 }}>{r.exit_reason?.replace(/_/g,' ')}</td>
                    <td style={{ fontFamily:'var(--font-mono)' }}>{r.count}</td>
                    <td style={{ fontFamily:'var(--font-mono)', color:pnlColor(r.avg_pnl_pct) }}>{parseFloat(r.avg_pnl_pct || 0).toFixed(2)}%</td>
                    <td style={{ fontFamily:'var(--font-mono)', color:pnlColor(r.total_pnl_usd) }}>{formatUSD(r.total_pnl_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section E: Time Analysis */}
      <div className="card">
        <SectionHeader title="E — Time Analysis" />
        <div style={{ marginBottom:12 }}>
          <div className="metric-label" style={{ marginBottom:8 }}>Avg Return by Hour (UTC)</div>
          <TimeHeatmap data={timeAnalysis} />
        </div>
      </div>

      {/* Section F: Source Analysis */}
      <div className="card">
        <SectionHeader title="F — Source Analysis" />
        <SourceCompare data={sourceAnalysis} />
      </div>

      {/* Section G: Moonshots */}
      <div className="card">
        <SectionHeader title="G — Moonshot Tracker (>1000%)" />
        {moonshots?.length === 0 ? (
          <p style={{ color:'var(--fg-muted)', fontFamily:'var(--font-mono)', fontSize:12 }}>No moonshots yet — keep scanning!</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Token</th><th>PnL %</th><th>Score</th><th>Pump.fun</th><th>Social</th><th>LP Locked</th><th>Hold Time</th></tr></thead>
            <tbody>
              {moonshots?.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight:600 }}>{t.token_name}</td>
                  <td style={{ fontFamily:'var(--font-display)', fontWeight:800, color:'var(--profit)', fontSize:16 }}>+{parseFloat(t.pnl_pct).toFixed(0)}%</td>
                  <td><span className="badge badge-scored">{t.soft_score_at_entry}</span></td>
                  <td style={{ color: t.pumpfun_graduated ? 'var(--profit)' : 'var(--fg-muted)', fontFamily:'var(--font-mono)', fontSize:11 }}>{t.pumpfun_graduated ? 'YES' : 'No'}</td>
                  <td style={{ color: (t.social_twitter || t.social_telegram) ? 'var(--profit)' : 'var(--fg-muted)', fontFamily:'var(--font-mono)', fontSize:11 }}>{(t.social_twitter || t.social_telegram) ? 'YES' : 'No'}</td>
                  <td style={{ color: t.lp_locked ? 'var(--profit)' : 'var(--fg-muted)', fontFamily:'var(--font-mono)', fontSize:11 }}>{t.lp_locked ? 'YES' : 'No'}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--fg-muted)' }}>{formatHoldTime(t.hold_time_seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Section H: Loss Analysis */}
      <div className="card">
        <SectionHeader title="H — Loss Analysis" />
        {lossAnalysis?.length === 0 ? (
          <p style={{ color:'var(--fg-muted)', fontFamily:'var(--font-mono)', fontSize:12 }}>No losses recorded yet</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Exit Reason</th><th>Count</th><th>Avg Hold</th><th>Avg PnL %</th><th>Total Lost $</th></tr></thead>
            <tbody>
              {lossAnalysis?.map(r => (
                <tr key={r.exit_reason}>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:12 }}>{r.exit_reason?.replace(/_/g,' ')}</td>
                  <td style={{ fontFamily:'var(--font-mono)' }}>{r.count}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--fg-muted)' }}>{formatHoldTime(r.avg_hold_seconds)}</td>
                  <td style={{ fontFamily:'var(--font-mono)', color:'var(--loss)' }}>{parseFloat(r.avg_pnl_pct || 0).toFixed(2)}%</td>
                  <td style={{ fontFamily:'var(--font-mono)', color:'var(--loss)' }}>{formatUSD(Math.abs(r.total_pnl_usd))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
