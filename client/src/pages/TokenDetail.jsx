import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { formatUSD, formatPct, formatPrice, formatHoldTime, truncateAddress, parseDate } from '../utils/formatters';
import { pnlColor } from '../utils/colors';
import { ScoreBadge, ExitReasonBadge } from '../components/shared/Badge';
import { CopyButton } from '../components/shared/Tooltip';
import { PageLoader } from '../components/shared/LoadingSpinner';
import { useSocket } from '../hooks/useSocket';
import { useStrategy } from '../context/StrategyContext';
import axios from 'axios';

function FilterRow({ filter }) {
  return (
    <tr>
      <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{filter.filter_name?.replace(/_/g,' ')}</td>
      <td><span style={{ color: filter.passed ? 'var(--profit)' : 'var(--loss)', fontFamily:'var(--font-mono)', fontWeight:700 }}>{filter.passed ? '\u2713 PASS' : '\u2717 FAIL'}</span></td>
      <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{filter.raw_value || '\u2014'}</td>
      <td style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--fg-muted)' }}>{filter.threshold || '\u2014'}</td>
    </tr>
  );
}

function ScoreBreakdownTable({ breakdown }) {
  if (!breakdown) return null;
  const items = [
    { key:'lp_locked', label:'LP Locked', max:1 },
    { key:'top_wallet_low', label:'Top Wallet < 45%', max:1 },
    { key:'dev_wallet_safe', label:'Dev Wallet Safe', max:1 },
    { key:'holder_growth', label:'Holder Growth', max:1 },
    { key:'volume_acceleration', label:'Volume Acceleration', max:1 },
    { key:'social', label:'Social Presence', max:2 },
    { key:'pumpfun_graduated', label:'Pump.fun Graduated', max:2 },
  ];
  return (
    <table className="data-table">
      <thead><tr><th>Signal</th><th>Points</th><th>Max</th></tr></thead>
      <tbody>
        {items.map(item => (
          <tr key={item.key}>
            <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{item.label}</td>
            <td style={{ fontFamily:'var(--font-mono)', fontWeight:700, color: breakdown[item.key] > 0 ? 'var(--profit)' : 'var(--fg-muted)' }}>{breakdown[item.key] || 0}</td>
            <td style={{ fontFamily:'var(--font-mono)', color:'var(--fg-muted)', fontSize:11 }}>{item.max}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TokenDetail() {
  const { address } = useParams();
  const navigate = useNavigate();
  const { settings } = useStrategy();
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [priceData, setPriceData] = useState([]);
  const [liveUpdate, setLiveUpdate] = useState(null);
  const { on } = useSocket();

  useEffect(() => {
    axios.get(`/api/tokens/${address}`)
      .then(r => {
        setToken(r.data);
        setPriceData((r.data.price_history || []).map(p => ({
          time: parseDate(p.recorded_at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }),
          price: p.price,
        })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [address]);

  useEffect(() => {
    return on('price_update', (data) => {
      if (data.tokenAddress === address) {
        setLiveUpdate(data);
        setPriceData(prev => [...prev, { time: new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }), price: data.currentPrice }].slice(-100));
      }
    });
  }, [on, address]);

  if (loading) return <PageLoader />;
  if (!token) return <div style={{ padding:40, color:'var(--fg-muted)', fontFamily:'var(--font-mono)' }}>Token not found</div>;

  const trade = token.trade;
  const pnlPct = liveUpdate?.pnlPct ?? trade?.pnl_pct ?? 0;
  const pnlUsd = liveUpdate?.pnlUsd ?? trade?.pnl_usd ?? 0;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:4 }}>
            <button className="btn btn-ghost" style={{ fontSize:11, padding:'4px 8px' }} onClick={() => navigate(-1)}>← Back</button>
          </div>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:32, fontWeight:800, letterSpacing:'-0.04em' }}>{token.name}</h1>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:6 }}>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--fg-muted)', letterSpacing:'0.1em' }}>{token.symbol}</span>
            <div className="address-display">
              {truncateAddress(token.address, 8, 6)}
              <CopyButton text={token.address} />
            </div>
            {token.soft_score > 0 && <ScoreBadge score={token.soft_score} />}
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <a href={`https://dexscreener.com/solana/${token.address}`} target="_blank" rel="noreferrer" className="btn btn-outline" style={{ fontSize:11 }}>DexScreener</a>
          <a href={`https://solscan.io/token/${token.address}`} target="_blank" rel="noreferrer" className="btn btn-outline" style={{ fontSize:11 }}>Solscan</a>
          <a href={`https://rugcheck.xyz/tokens/${token.address}`} target="_blank" rel="noreferrer" className="btn btn-outline" style={{ fontSize:11 }}>RugCheck</a>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, alignItems:'start' }}>
        {/* Left: Filters + Score */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div className="card">
            <div className="section-header"><span className="section-title">Hard Filter Results</span></div>
            <table className="data-table">
              <thead><tr><th>Filter</th><th>Result</th><th>Value</th><th>Threshold</th></tr></thead>
              <tbody>
                {(token.filter_results || []).map((f, i) => <FilterRow key={i} filter={f} />)}
                {(!token.filter_results || token.filter_results.length === 0) && (
                  <tr><td colSpan={4} style={{ textAlign:'center', padding:20, color:'var(--fg-muted)', fontFamily:'var(--font-mono)', fontSize:12 }}>No filter data</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="section-header"><span className="section-title">Soft Score Breakdown</span></div>
            <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:16 }}>
              <div style={{ fontFamily:'var(--font-display)', fontSize:48, fontWeight:900, letterSpacing:'-0.06em', color: token.soft_score >= 7 ? 'var(--profit)' : token.soft_score >= 5 ? 'var(--accent-bright)' : 'var(--neutral)' }}>
                {token.soft_score || 0}
              </div>
              <div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--fg-muted)', letterSpacing:'0.1em' }}>OUT OF 10</div>
                <div style={{ fontSize:13, color:'var(--fg-muted)' }}>{token.hard_filter_passed ? 'All filters passed' : `Rejected: ${token.hard_filter_reject_reason?.replace(/_/g,' ')}`}</div>
              </div>
            </div>
            <ScoreBreakdownTable breakdown={token.soft_score_breakdown} />
          </div>
        </div>

        {/* Right: Price Chart + Trade Card */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div className="card">
            <div className="section-header"><span className="section-title">Price History</span></div>
            <div style={{ height:200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={priceData} margin={{ top:5, right:10, bottom:5, left:10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="time" tick={{ fill:'var(--fg-muted)', fontSize:9, fontFamily:'var(--font-mono)' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill:'var(--fg-muted)', fontSize:9, fontFamily:'var(--font-mono)' }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', fontFamily:'var(--font-mono)', fontSize:11 }} />
                  <Line type="monotone" dataKey="price" stroke={pnlPct >= 0 ? 'var(--profit)' : 'var(--loss)'} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {trade && (
            <div className="card">
              <div className="section-header"><span className="section-title">Virtual Trade</span></div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {[
                  { label:'Entry Price', value: formatPrice(trade.entry_price) },
                  { label:'Position Size', value: formatUSD(trade.position_size_usd) },
                  { label:'Status', value: trade.status?.toUpperCase() },
                  { label:'Score at Entry', value: trade.soft_score_at_entry },
                ].map(item => (
                  <div key={item.label}>
                    <div className="metric-label">{item.label}</div>
                    <div style={{ fontFamily:'var(--font-mono)', fontWeight:600, fontSize:14 }}>{item.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:16 }}>
                <div style={{ fontFamily:'var(--font-display)', fontSize:36, fontWeight:800, letterSpacing:'-0.04em', color: pnlColor(pnlPct) }}>
                  {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                </div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:13, color: pnlColor(pnlUsd) }}>
                  {pnlUsd >= 0 ? '+' : ''}{formatUSD(pnlUsd)}
                </div>
              </div>
              {trade.exit_reason && (
                <div style={{ marginTop:12 }}>
                  <div className="metric-label">Exit Reason</div>
                  <ExitReasonBadge reason={trade.exit_reason} />
                </div>
              )}
              {/* Ladder progress */}
              <div style={{ marginTop:12 }}>
                <div className="metric-label" style={{ marginBottom:6 }}>Exit Ladder</div>
                <div style={{ display:'flex', gap:4 }}>
                  {[
                    { key: 'level_1', oldKey: '200pct', val: settings.exit_ladder_level_1 || '200' },
                    { key: 'level_2', oldKey: '500pct', val: settings.exit_ladder_level_2 || '500' },
                    { key: 'level_3', oldKey: '1000pct', val: settings.exit_ladder_level_3 || '1000' },
                    { key: 'level_4', oldKey: '3000pct', val: settings.exit_ladder_level_4 || '3000' },
                  ].map(lvl => {
                    const ladder = liveUpdate?.ladder ?? trade.exit_ladder_progress;
                    const hit = ladder?.[lvl.key] || ladder?.[lvl.oldKey];
                    return (
                      <div key={lvl.key} style={{ flex:1, textAlign:'center' }}>
                        <div style={{ height:4, background: hit ? 'var(--profit)' : 'var(--border)', marginBottom:4 }} />
                        <div style={{ fontSize:9, fontFamily:'var(--font-mono)', color: hit ? 'var(--profit)' : 'var(--fg-muted)' }}>+{lvl.val}%</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
