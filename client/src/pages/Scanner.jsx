import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useSocket } from '../hooks/useSocket';
import { formatUSD, truncateAddress, parseDate } from '../utils/formatters';
import { ScoreBadge } from '../components/shared/Badge';
import { CopyButton } from '../components/shared/Tooltip';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import axios from 'axios';

const FILTER_NAMES = ['mint_authority','freeze_authority','honeypot','liquidity','volume','pair_age','transactions','top_holder'];
const FILTER_LABELS = { mint_authority:'Mint', freeze_authority:'Frz', honeypot:'Honey', liquidity:'Liq', volume:'Vol', pair_age:'Age', transactions:'Txn', top_holder:'Hold' };
const REJECTION_COLORS = ['#ff4444','#ff6644','#ff8844','#ffaa44','#ffcc44','#a78bfa','#60a5fa','#00ff88'];

function FilterIconRow({ filterResults }) {
  if (!filterResults || filterResults.length === 0) return (
    <div style={{ display:'flex', gap:3 }}>
      {FILTER_NAMES.map(f => (
        <div key={f} title={f} style={{ width:18, height:18, background:'var(--border)', fontSize:8, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--fg-muted)' }}>
          {FILTER_LABELS[f]?.[0]}
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ display:'flex', gap:3 }}>
      {FILTER_NAMES.map(f => {
        const result = filterResults.find(r => r.filter_name === f);
        const passed = result?.passed;
        return (
          <div key={f} title={`${f}: ${result?.raw_value || 'N/A'}`}
            style={{ width:18, height:18, fontSize:9, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700,
              color: passed === true ? 'var(--profit)' : passed === false ? 'var(--loss)' : 'var(--fg-muted)',
              background: passed === true ? '#00ff8810' : passed === false ? '#ff444410' : 'var(--border)',
            }}>
            {passed === true ? '✓' : passed === false ? '✗' : '?'}
          </div>
        );
      })}
    </div>
  );
}

export function Scanner() {
  const { liveTokens } = useData();
  const { on } = useSocket();
  const [dbTokens, setDbTokens] = useState([]);
  const [dbAddresses, setDbAddresses] = useState(new Set());
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterBreakdown, setFilterBreakdown] = useState([]);
  const [filters, setFilters] = useState({ passed: '', score_min: '', limit: 50 });
  const navigate = useNavigate();

  const loadTokens = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: 1, ...filters };
      if (!params.passed) delete params.passed;
      if (!params.score_min) delete params.score_min;
      const res = await axios.get('/api/tokens', { params });
      const tokens = res.data.tokens || [];
      setDbTokens(tokens);
      setDbAddresses(new Set(tokens.map(t => t.address)));
      setTotal(res.data.total || 0);
    } catch {}
    setLoading(false);
  }, [JSON.stringify(filters)]);

  const loadFilterBreakdown = async () => {
    try {
      const res = await axios.get('/api/analytics/filter-breakdown');
      setFilterBreakdown(res.data || []);
    } catch {}
  };

  useEffect(() => { loadTokens(); loadFilterBreakdown(); }, [loadTokens]);

  // Refresh DB data when tokens get final results
  useEffect(() => {
    const rejectedOrScored = liveTokens.filter(t => t._status === 'rejected' || t._status === 'scored');
    const hasNew = rejectedOrScored.some(t => !dbAddresses.has(t.address));
    if (hasNew) {
      const timer = setTimeout(() => { loadTokens(); loadFilterBreakdown(); }, 1500);
      return () => clearTimeout(timer);
    }
  }, [liveTokens, loadTokens, dbAddresses]);

  // Listen to live socket events to update DB tokens continuously
  useEffect(() => {
    const off1 = on('token_scored', (data) => {
      setDbTokens(prev => prev.map(t => 
        t.address === data.address 
          ? { ...t, soft_score: data.score, hard_filter_passed: true, _status: 'scored' } 
          : t
      ));
    });
    const off2 = on('token_rejected', (data) => {
      setDbTokens(prev => prev.map(t => 
        t.address === data.address 
          ? { ...t, hard_filter_reject_reason: data.reason, hard_filter_passed: false, _status: 'rejected' } 
          : t
      ));
    });
    return () => { off1(); off2(); };
  }, [on]);

  // Merge: live-only tokens (not yet in DB) prepended to DB records
  // DB records take precedence for same address (more complete data)
  const liveOnly = liveTokens.filter(t => !dbAddresses.has(t.address));
  const allTokens = [...liveOnly, ...dbTokens];

  const pieData = filterBreakdown
    .filter(f => parseInt(f.rejected_count) > 0)
    .map((f, i) => ({
      name: FILTER_LABELS[f.filter_name] || f.filter_name,
      value: parseInt(f.rejected_count),
      color: REJECTION_COLORS[i % REJECTION_COLORS.length],
    }));

  const totalRejections = pieData.reduce((s, d) => s + d.value, 0);
  const passRate = total > 0
    ? ((dbTokens.filter(t => t.hard_filter_passed).length / Math.max(total, 1)) * 100).toFixed(1)
    : '0.0';

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div style={{ display:'flex', alignItems:'baseline', gap:12 }}>
        <h1 style={{ fontFamily:'var(--font-display)', fontSize:28, fontWeight:800, letterSpacing:'-0.04em' }}>Scanner</h1>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--fg-muted)', letterSpacing:'0.1em' }}>
          {total} DB · {liveOnly.length} LIVE
        </span>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
        <select className="input" style={{ width:140 }} value={filters.passed} onChange={e => setFilters(p => ({ ...p, passed: e.target.value }))}>
          <option value="">All Tokens</option>
          <option value="true">Passed Filters</option>
          <option value="false">Rejected</option>
        </select>
        <select className="input" style={{ width:140 }} value={filters.score_min} onChange={e => setFilters(p => ({ ...p, score_min: e.target.value }))}>
          <option value="">Any Score</option>
          <option value="4">Score 4+</option>
          <option value="5">Score 5+</option>
          <option value="6">Score 6+</option>
          <option value="7">Score 7+</option>
        </select>
        <button className="btn btn-outline" style={{ fontSize:11 }} onClick={loadTokens}>REFRESH</button>
        <div style={{ flex:1 }} />
        <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--fg-muted)' }}>
          Pass rate: <span style={{ color:'var(--profit)' }}>{passRate}%</span>
        </span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:16 }}>
        {/* Main Table */}
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Token</th>
                  <th>Age</th>
                  <th>Liquidity</th>
                  <th>Volume</th>
                  <th>Txns</th>
                  <th>Wallets</th>
                  <th>Filters</th>
                  <th>Score</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && allTokens.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign:'center', padding:40, color:'var(--fg-muted)', fontFamily:'var(--font-mono)', fontSize:12 }}>Loading...</td></tr>
                )}
                {!loading && allTokens.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign:'center', padding:40, color:'var(--fg-muted)', fontFamily:'var(--font-mono)', fontSize:12 }}>No tokens yet — scanner will populate this as it runs</td></tr>
                )}
                {allTokens.map(t => {
                  const isScanning = t._status === 'scanning';
                  // Pick the right status badge
                  let statusClass = 'badge-neutral';
                  let statusLabel = '—';
                  if (isScanning) {
                    statusClass = 'badge-scanning'; statusLabel = 'SCANNING';
                  } else if (!t.hard_filter_passed && t.hard_filter_reject_reason) {
                    statusClass = 'badge-rejected';
                    statusLabel = t.hard_filter_reject_reason.replace(/_/g,' ').toUpperCase();
                  } else if (t.soft_score >= 4) {
                    statusClass = 'badge-bought'; statusLabel = 'BOUGHT';
                  } else if (t.soft_score > 0) {
                    statusClass = 'badge-scored'; statusLabel = 'SCORED';
                  }

                  return (
                    <tr key={t.id || t.address}
                      onClick={() => !isScanning && navigate(`/token/${t.address}`)}
                      style={{ opacity: isScanning ? 0.65 : 1, cursor: isScanning ? 'default' : 'pointer' }}>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--fg-muted)', whiteSpace:'nowrap' }}>
                        {parseDate(t.created_at || t.detected_at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}
                      </td>
                      <td>
                        <div style={{ fontWeight:600, fontSize:13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.name}>{t.name}</div>
                        <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--fg-muted)', display:'flex', alignItems:'center', gap:4 }}>
                          {truncateAddress(t.address)}
                          <CopyButton text={t.address} />
                        </div>
                      </td>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:12 }}>{t.pair_age_minutes != null ? `${Math.round(t.pair_age_minutes)}m` : '—'}</td>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:12 }}>{t.liquidity_usd != null ? formatUSD(t.liquidity_usd) : '—'}</td>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:12 }}>{t.volume_usd != null ? formatUSD(t.volume_usd) : '—'}</td>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:12 }}>{t.txn_count || '—'}</td>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:12 }}>{t.unique_wallets || '—'}</td>
                      <td><FilterIconRow filterResults={t.filter_results || []} /></td>
                      <td>{t.soft_score > 0 ? <ScoreBadge score={t.soft_score} /> : <span style={{ color:'var(--fg-muted)', fontSize:11 }}>—</span>}</td>
                      <td>
                        <span className={`badge ${statusClass}`} style={{ fontSize:9,
                          ...(isScanning ? { animation:'pulse 1.5s ease-in-out infinite' } : {})
                        }}>
                          {statusLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div className="card">
            <div className="section-header"><span className="section-title">Rejection Breakdown</span></div>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value">
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', fontFamily:'var(--font-mono)', fontSize:11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign:'center', padding:'20px 0', color:'var(--fg-muted)', fontFamily:'var(--font-mono)', fontSize:11 }}>No data yet</div>
            )}
            <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:8 }}>
              {pieData.map((d, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, fontSize:11 }}>
                  <div style={{ width:8, height:8, background:d.color, flexShrink:0 }} />
                  <span style={{ flex:1, fontFamily:'var(--font-mono)', color:'var(--fg-muted)' }}>{d.name}</span>
                  <span style={{ fontFamily:'var(--font-mono)', fontWeight:700 }}>{d.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="metric-label">Total Rejections</div>
            <div className="metric-value loss">{totalRejections}</div>
            <div style={{ marginTop:8 }}>
              <div className="metric-label">Pass Rate</div>
              <div className="metric-value profit" style={{ fontSize:20 }}>{passRate}%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
