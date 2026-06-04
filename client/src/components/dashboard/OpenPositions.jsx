import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../context/DataContext';
import { formatUSD, formatPct, formatPrice, formatHoldTime, parseDate } from '../../utils/formatters';
import { pnlColor, scoreBadgeClass } from '../../utils/colors';
import { useStrategy } from '../../context/StrategyContext';

function LadderProgress({ ladder }) {
  const { settings } = useStrategy();
  if (!ladder) return null;
  const levels = [
    { key: 'level_1', oldKey: '200pct', val: settings.exit_ladder_level_1 || '200' },
    { key: 'level_2', oldKey: '500pct', val: settings.exit_ladder_level_2 || '500' },
    { key: 'level_3', oldKey: '1000pct', val: settings.exit_ladder_level_3 || '1000' },
    { key: 'level_4', oldKey: '3000pct', val: settings.exit_ladder_level_4 || '3000' },
  ];
  return (
    <div style={{ display: 'flex', gap: 3, marginTop: 8 }}>
      {levels.map(lvl => {
        const hit = ladder[lvl.key] || ladder[lvl.oldKey];
        return (
          <div key={lvl.key} style={{
            flex: 1, height: 3,
            background: hit ? 'var(--profit)' : 'var(--border)',
            transition: 'background 300ms',
          }} title={hit ? `+${lvl.val}% hit!` : `+${lvl.val}%`} />
        );
      })}
    </div>
  );
}

function HoldTimer({ entryTime }) {
  const [elapsed, setElapsed] = React.useState(0);
  useEffect(() => {
    const entry = parseDate(entryTime).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - entry) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [entryTime]);
  return <span>{formatHoldTime(elapsed)}</span>;
}

function HighLowBadges({ high, low }) {
  if (high == null && low == null) return null;
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
      {high != null && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: '#00ff8812', border: '1px solid #00ff8828',
          padding: '2px 7px', fontSize: 10,
          fontFamily: 'var(--font-mono)',
        }}>
          <span style={{ color: 'var(--fg-muted)', fontSize: 9, letterSpacing: '0.06em' }}>H</span>
          <span style={{ color: 'var(--profit)', fontWeight: 700 }}>
            {high >= 0 ? '+' : ''}{high.toFixed(1)}%
          </span>
        </div>
      )}
      {low != null && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: '#ff444412', border: '1px solid #ff444428',
          padding: '2px 7px', fontSize: 10,
          fontFamily: 'var(--font-mono)',
        }}>
          <span style={{ color: 'var(--fg-muted)', fontSize: 9, letterSpacing: '0.06em' }}>L</span>
          <span style={{ color: 'var(--loss)', fontWeight: 700 }}>
            {low >= 0 ? '+' : ''}{low.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}

export function OpenPositions() {
  const { positions, loadPositions, priceUpdates } = useData();
  const navigate = useNavigate();

  useEffect(() => { loadPositions(); }, [loadPositions]);

  const list = positions || [];

  if (list.length === 0) {
    return (
      <div>
        <div className="section-header">
          <span className="section-title">Open Positions</span>
        </div>
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          No open positions
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="section-header">
        <span className="section-title">Open Positions</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', marginLeft: 'auto' }}>
          {list.length} open
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 500, overflowY: 'auto' }}>
        {list.map(pos => {
          const update = priceUpdates[pos.id];
          const pnlPct = update?.pnlPct ?? pos.pnl_pct ?? 0;
          const pnlUsd = update?.pnlUsd ?? pos.pnl_usd ?? 0;
          const ladder = update?.ladder ?? pos.exit_ladder_progress;
          const highPnl = update?.highPnl ?? pos.high_pnl_pct ?? null;
          const lowPnl  = update?.lowPnl  ?? pos.low_pnl_pct  ?? null;
          const isLoss = pnlPct < 0;

          return (
            <div
              key={pos.id}
              className={`position-card ${isLoss ? 'in-loss' : ''}`}
              onClick={() => navigate(`/token/${pos.token_address}`)}
              style={{ cursor: 'pointer' }}
            >
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{pos.token_name}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', marginTop: 2 }}>
                    <HoldTimer entryTime={pos.entry_time} /> · ${pos.position_size_usd?.toFixed(2)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22,
                    color: pnlColor(pnlPct), letterSpacing: '-0.04em',
                    animation: update ? 'count-up 300ms ease-out' : 'none',
                  }}>
                    {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: pnlColor(pnlUsd) }}>
                    {pnlUsd >= 0 ? '+' : ''}{formatUSD(pnlUsd)}
                  </div>
                </div>
              </div>

              {/* Entry / Score row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                <span>Entry: {formatPrice(pos.entry_price)}</span>
                <span>Score: <span className={`badge ${scoreBadgeClass(pos.soft_score_at_entry)}`} style={{ fontSize: 9, padding: '1px 5px' }}>{pos.soft_score_at_entry}</span></span>
              </div>

              {/* High / Low badges */}
              <HighLowBadges high={highPnl} low={lowPnl} />

              {/* Ladder progress bar */}
              <LadderProgress ladder={ladder} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
