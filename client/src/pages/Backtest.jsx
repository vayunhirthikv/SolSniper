import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { formatUSD, formatPct, formatHoldTime } from '../utils/formatters';
import { pnlColor } from '../utils/colors';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import axios from 'axios';

const DEFAULT_CONFIG = {
  min_soft_score: 4,
  pos_tier1_score: 4,
  pos_tier1_size: 0.75,
  pos_tier2_score: 5,
  pos_tier2_size: 1.25,
  pos_tier3_score: 6,
  pos_tier3_size: 2.00,
  pos_tier4_score: 7,
  pos_tier4_size: 2.50,
  stop_loss_pct: 65,
  take_profit_pct: '',
  time_exit_hours: 3,
  exit_ladder_enabled: true,
  exit_ladder_level_1: 200,
  exit_ladder_sell_1: 20,
  exit_ladder_level_2: 500,
  exit_ladder_sell_2: 20,
  exit_ladder_level_3: 1000,
  exit_ladder_sell_3: 20,
  exit_ladder_level_4: 3000,
  exit_ladder_sell_4: 50,
};

export function Backtest() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: parseFloat(value) || value }));
  };

  const runBacktest = async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      // Fetch historical trades matching date range
      const params = { status: 'closed', limit: 1000 };
      if (dateFrom) params.date_from = dateFrom; // e.g. "2026-06-04" -> matches "2026-06-04T..."
      if (dateTo) params.date_to = `${dateTo}T23:59:59.999Z`; // Include the entire end day

      const res = await axios.get('/api/trades', { params });
      const trades = res.data.trades || [];

      // Simulate backtest with different settings
      const filteredTrades = trades.filter(t => {
        return (t.soft_score_at_entry || 0) >= (config.min_soft_score || 4);
      });

      // Apply position sizing
      const resizedTrades = filteredTrades.map(t => {
        const score = t.soft_score_at_entry || 4;
        let size = config.pos_tier1_size;
        
        // Find highest tier matched
        const tiers = [
          { s: config.pos_tier4_score, size: config.pos_tier4_size },
          { s: config.pos_tier3_score, size: config.pos_tier3_size },
          { s: config.pos_tier2_score, size: config.pos_tier2_size },
          { s: config.pos_tier1_score, size: config.pos_tier1_size },
        ].sort((a, b) => b.s - a.s);
        
        for (const tier of tiers) {
          if (score >= tier.s) {
            size = tier.size;
            break;
          }
        }

        const highPnl = t.high_pnl_pct || 0;
        const lowPnl = t.low_pnl_pct || 0;
        const finalPnlPct = t.pnl_pct || 0;
        
        let simPnlPct = finalPnlPct;
        let simPnlUsd = 0;
        
        // Sim Logic
        let remainingPct = 100;
        let realizedPnl = 0;

        // 1. Check Take Profit first (Assuming upside spikes happen before terminal dumps)
        if (config.take_profit_pct !== '' && !isNaN(parseFloat(config.take_profit_pct)) && highPnl >= parseFloat(config.take_profit_pct)) {
          simPnlPct = parseFloat(config.take_profit_pct);
          realizedPnl += size * (simPnlPct / 100);
          remainingPct = 0;
        } 
        // 2. Or check Exit Ladder
        else if (config.exit_ladder_enabled) {
          const ladderLevels = [
            { lvl: parseFloat(config.exit_ladder_level_1) || 200, sell: parseFloat(config.exit_ladder_sell_1) || 20 },
            { lvl: parseFloat(config.exit_ladder_level_2) || 500, sell: parseFloat(config.exit_ladder_sell_2) || 20 },
            { lvl: parseFloat(config.exit_ladder_level_3) || 1000, sell: parseFloat(config.exit_ladder_sell_3) || 20 },
            { lvl: parseFloat(config.exit_ladder_level_4) || 3000, sell: parseFloat(config.exit_ladder_sell_4) || 50 },
          ];
          
          for (const l of ladderLevels) {
            if (highPnl >= l.lvl && remainingPct > 0) {
              const sellValue = size * (remainingPct / 100) * (l.sell / 100);
              realizedPnl += sellValue * (l.lvl / 100);
              remainingPct -= (remainingPct * (l.sell / 100));
            }
          }
        }

        // 3. Evaluate whatever is left
        if (remainingPct > 0) {
          const stopLossVal = parseFloat(config.stop_loss_pct) || 65;
          if (lowPnl <= -stopLossVal) {
            // The remainder stopped out
            simPnlPct = -stopLossVal;
            const remainingValue = size * (remainingPct / 100);
            realizedPnl += remainingValue * (simPnlPct / 100);
            remainingPct = 0;
          } else {
            // The remainder survived the whole time and closed at the final PnL
            simPnlPct = finalPnlPct;
            const remainingValue = size * (remainingPct / 100);
            realizedPnl += remainingValue * (simPnlPct / 100);
            remainingPct = 0;
          }
        }
        
        simPnlUsd = realizedPnl;

        return {
          ...t,
          backtested_size: size,
          backtested_pnl_usd: simPnlUsd,
          backtested_pnl_pct: simPnlUsd / size * 100, // True net PnL %
        };
      });

      const totalPnl = resizedTrades.reduce((s, t) => s + (t.backtested_pnl_usd || 0), 0);
      const winners = resizedTrades.filter(t => t.backtested_pnl_usd > 0);
      const losers = resizedTrades.filter(t => t.backtested_pnl_usd < 0);
      const winRate = resizedTrades.length > 0 ? (winners.length / resizedTrades.length) * 100 : 0;
      const best = Math.max(...resizedTrades.map(t => t.backtested_pnl_pct || 0));
      const worst = Math.min(...resizedTrades.map(t => t.backtested_pnl_pct || 0));

      // Build cumulative PnL curve
      let cumulative = 0;
      const curve = resizedTrades.map((t, i) => {
        cumulative += t.backtested_pnl_usd || 0;
        return { trade: i + 1, pnl: parseFloat(cumulative.toFixed(4)) };
      });

      setResults({ trades: resizedTrades, totalPnl, winners: winners.length, losers: losers.length, winRate, best, worst, curve });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 20 }}>
      {/* Left Panel — Controls */}
      <div style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em' }}>Backtest</h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', marginTop: 4 }}>
            Simulate strategy on historical data
          </p>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="section-header"><span className="section-title">Date Range</span></div>
          <div>
            <div className="metric-label" style={{ marginBottom: 4 }}>From</div>
            <input type="date" className="input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <div className="metric-label" style={{ marginBottom: 4 }}>To</div>
            <input type="date" className="input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="section-header"><span className="section-title">Strategy Settings</span></div>
          
          <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Entry & Limits</div>
            {[
              { label: 'Min Score', key: 'min_soft_score' },
              { label: 'Stop Loss %', key: 'stop_loss_pct' },
              { label: 'Take Profit %', key: 'take_profit_pct' },
              { label: 'Time Exit (hrs)', key: 'time_exit_hours' },
            ].map(({ label, key }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ flex: 1, fontSize: 12, color: 'var(--fg-muted)' }}>{label}</span>
                <input type="number" step="0.01" className="input" style={{ width: 90, textAlign: 'right' }} value={config[key]} onChange={e => handleChange(key, e.target.value)} />
              </div>
            ))}
          </div>

          <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Position Sizing</div>
            {[
              { label: 'Tier 1', scoreKey: 'pos_tier1_score', sizeKey: 'pos_tier1_size' },
              { label: 'Tier 2', scoreKey: 'pos_tier2_score', sizeKey: 'pos_tier2_size' },
              { label: 'Tier 3', scoreKey: 'pos_tier3_score', sizeKey: 'pos_tier3_size' },
              { label: 'Tier 4', scoreKey: 'pos_tier4_score', sizeKey: 'pos_tier4_size' },
            ].map(({ label, scoreKey, sizeKey }) => (
              <div key={scoreKey} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--fg-muted)', width: 40 }}>{label}</span>
                <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 8px', flex: 1 }}>
                    <span style={{ fontSize: 11, color: 'var(--fg-muted)', marginRight: 4 }}>Score</span>
                    <input type="number" style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--fg)', fontSize: 12, outline: 'none' }} value={config[scoreKey]} onChange={e => handleChange(scoreKey, e.target.value)} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 8px', flex: 1 }}>
                    <span style={{ fontSize: 11, color: 'var(--fg-muted)', marginRight: 4 }}>$</span>
                    <input type="number" step="0.01" style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--fg)', fontSize: 12, outline: 'none' }} value={config[sizeKey]} onChange={e => handleChange(sizeKey, e.target.value)} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding: '8px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Exit Ladder</div>
              <input type="checkbox" checked={config.exit_ladder_enabled} onChange={e => setConfig(prev => ({ ...prev, exit_ladder_enabled: e.target.checked }))} />
            </div>
            {config.exit_ladder_enabled && [
              { label: 'Lvl 1', lvlKey: 'exit_ladder_level_1', sellKey: 'exit_ladder_sell_1' },
              { label: 'Lvl 2', lvlKey: 'exit_ladder_level_2', sellKey: 'exit_ladder_sell_2' },
              { label: 'Lvl 3', lvlKey: 'exit_ladder_level_3', sellKey: 'exit_ladder_sell_3' },
              { label: 'Lvl 4', lvlKey: 'exit_ladder_level_4', sellKey: 'exit_ladder_sell_4' },
            ].map(({ label, lvlKey, sellKey }) => (
              <div key={lvlKey} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--fg-muted)', width: 30 }}>{label}</span>
                <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 8px', flex: 1 }}>
                    <span style={{ fontSize: 11, color: 'var(--fg-muted)', marginRight: 4 }}>+</span>
                    <input type="number" style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--fg)', fontSize: 12, outline: 'none' }} value={config[lvlKey]} onChange={e => handleChange(lvlKey, e.target.value)} />
                    <span style={{ fontSize: 11, color: 'var(--fg-muted)', marginLeft: 4 }}>%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 8px', flex: 1 }}>
                    <span style={{ fontSize: 11, color: 'var(--fg-muted)', marginRight: 4 }}>Sell</span>
                    <input type="number" style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--fg)', fontSize: 12, outline: 'none' }} value={config[sellKey]} onChange={e => handleChange(sellKey, e.target.value)} />
                    <span style={{ fontSize: 11, color: 'var(--fg-muted)', marginLeft: 4 }}>%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={runBacktest}
          disabled={loading}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {loading ? <LoadingSpinner size={14} /> : 'RUN BACKTEST'}
        </button>

        {error && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--loss)', padding: '8px 12px', border: '1px solid var(--loss)' }}>
            {error}
          </div>
        )}
      </div>

      {/* Right Panel — Results */}
      <div style={{ flex: 1 }}>
        {!results && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 400, gap: 16 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 60, fontWeight: 900, color: 'var(--border-hover)', letterSpacing: '-0.06em' }}>BACKTEST</div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg-muted)' }}>
              Configure settings and run a backtest on historical trade data
            </p>
          </div>
        )}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
            <LoadingSpinner size={32} />
          </div>
        )}

        {results && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
              {[
                { label: 'Total P&L', value: formatUSD(results.totalPnl), color: pnlColor(results.totalPnl) },
                { label: 'Total Trades', value: results.trades.length },
                { label: 'Win Rate', value: `${results.winRate.toFixed(1)}%`, color: results.winRate >= 20 ? 'var(--profit)' : 'var(--loss)' },
                { label: 'Winners', value: results.winners, color: 'var(--profit)' },
                { label: 'Losers', value: results.losers, color: 'var(--loss)' },
                { label: 'Best Trade', value: `+${results.best.toFixed(1)}%`, color: 'var(--profit)' },
                { label: 'Worst Trade', value: `${results.worst.toFixed(1)}%`, color: 'var(--loss)' },
              ].map(item => (
                <div key={item.label} className="metric-card">
                  <div className="metric-label">{item.label}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: item.color || 'var(--fg)', letterSpacing: '-0.03em' }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            {/* PnL Curve */}
            <div className="card">
              <div className="section-header"><span className="section-title">Backtest P&L Curve</span></div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={results.curve} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="trade" tick={{ fill: 'var(--fg-muted)', fontSize: 10 }} tickLine={false} axisLine={false} label={{ value: 'Trade #', position: 'insideBottom', fill: 'var(--fg-muted)', fontSize: 10 }} />
                  <YAxis tick={{ fill: 'var(--fg-muted)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                  <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 11 }} />
                  <ReferenceLine y={0} stroke="var(--border-hover)" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="pnl" stroke={results.totalPnl >= 0 ? 'var(--profit)' : 'var(--loss)'} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
