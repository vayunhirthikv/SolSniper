import React, { useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
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

export function PnLChart() {
  const { snapshots, loadSnapshots } = useData();

  useEffect(() => { loadSnapshots(); }, [loadSnapshots]);

  const raw = [...(snapshots || [])].reverse();
  let cumulative = 0;
  const chartData = raw.length > 0
    ? raw.map(s => {
        cumulative += parseFloat(s.total_pnl_usd || 0);
        return {
          date: new Date(s.snapshot_date).toLocaleDateString([], { month: 'short', day: 'numeric' }),
          pnl: parseFloat(cumulative.toFixed(4)),
        };
      })
    : [{ date: 'Start', pnl: 0 }, { date: 'Now', pnl: 0 }];

  const isPositive = chartData[chartData.length - 1]?.pnl >= 0;

  return (
    <div>
      <div className="section-header">
        <span className="section-title">Cumulative P&L</span>
      </div>
      <div className="chart-container" style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fill: 'var(--fg-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: 'var(--fg-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="var(--border-hover)" strokeDasharray="4 4" />
            <Line
              type="monotone"
              dataKey="pnl"
              stroke={isPositive ? 'var(--profit)' : 'var(--loss)'}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: isPositive ? 'var(--profit)' : 'var(--loss)' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
