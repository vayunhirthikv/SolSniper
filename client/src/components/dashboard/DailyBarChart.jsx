import React, { useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { formatUSD } from '../../utils/formatters';
import { useData } from '../../context/DataContext';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '8px 12px' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: payload[0].value >= 0 ? 'var(--profit)' : 'var(--loss)' }}>
        {formatUSD(payload[0].value)}
      </div>
    </div>
  );
};

export function DailyBarChart() {
  const { snapshots, loadSnapshots } = useData();

  useEffect(() => { loadSnapshots(); }, [loadSnapshots]);

  const raw = [...(snapshots || [])].reverse().slice(-14); // last 14 days
  const data = raw.map(s => ({
    date: new Date(s.snapshot_date).toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' }),
    pnl: parseFloat(s.total_pnl_usd || 0),
    trades: s.total_trades || 0,
  }));

  return (
    <div>
      <div className="section-header">
        <span className="section-title">Daily Win/Loss</span>
      </div>
      <div className="chart-container" style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: 'var(--fg-muted)', fontSize: 9, fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: 'var(--fg-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="var(--border-hover)" />
            <Bar dataKey="pnl" radius={0}>
              {data.map((entry, index) => (
                <Cell key={index} fill={entry.pnl >= 0 ? 'var(--profit)' : 'var(--loss)'} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
