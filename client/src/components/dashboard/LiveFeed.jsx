import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../../hooks/useSocket';
import { formatAge, formatUSD, formatTime, truncateAddress } from '../../utils/formatters';
import { ScoreBadge } from '../shared/Badge';

const MAX_ROWS = 100;

export function LiveFeed() {
  const [events, setEvents] = useState([]);
  const [paused, setPaused] = useState(false);
  const feedRef = useRef(null);
  const { on } = useSocket();

  const addEvent = (evt) => {
    if (paused) return;
    setEvents(prev => {
      const next = [evt, ...prev].slice(0, MAX_ROWS);
      return next;
    });
  };

  useEffect(() => {
    const off1 = on('new_token_detected', (data) => {
      addEvent({ ...data, status: 'scanning', ts: Date.now() });
    });
    const off2 = on('token_rejected', (data) => {
      setEvents(prev => prev.map(e =>
        e.address === data.address ? { ...e, status: 'rejected', reason: data.reason } : e
      ));
    });
    const off3 = on('token_scored', (data) => {
      setEvents(prev => prev.map(e =>
        e.address === data.address ? { ...e, status: 'scored', score: data.score } : e
      ));
    });
    const off4 = on('trade_opened', (data) => {
      setEvents(prev => prev.map(e =>
        e.address === data.token?.address ? { ...e, status: 'bought' } : e
      ));
    });
    return () => { off1(); off2(); off3(); off4(); };
  }, [on, paused]);

  // Auto-scroll
  useEffect(() => {
    if (!paused && feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [events, paused]);

  return (
    <div>
      <div className="section-header">
        <span className="section-title">Live Token Feed</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>
          {events.length} tokens
        </span>
        <button
          className="btn btn-ghost"
          style={{ 
            padding: '4px 10px', 
            fontSize: 10,
            color: paused ? 'var(--loss)' : 'var(--profit)',
            borderColor: paused ? 'var(--loss)' : 'transparent'
          }}
          onClick={() => setPaused(p => !p)}
        >
          {paused ? '⏸ PAUSED' : '🟢 LIVE'}
        </button>
      </div>

      <div
        className="live-feed"
        ref={feedRef}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        style={{ maxHeight: 320, overflowY: 'auto' }}
      >
        {events.length === 0 && (
          <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            Waiting for tokens...
          </div>
        )}
        {events.map((evt, i) => (
          <div key={`${evt.address}-${i}`} className={`live-feed-row ${evt.status}`}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', minWidth: 56 }}>
              {evt.ts ? new Date(evt.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {evt.name || 'Unknown'}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>
                {truncateAddress(evt.address)}
              </div>
            </div>
            {evt.age !== undefined && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>
                {formatAge(evt.age)}
              </span>
            )}
            {evt.liquidity && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>
                {formatUSD(evt.liquidity)}
              </span>
            )}
            {evt.score !== undefined && <ScoreBadge score={evt.score} />}
            <span className={`badge badge-${evt.status}`} style={{ fontSize: 9, padding: '2px 6px' }}>
              {evt.status?.toUpperCase()}
            </span>
            {evt.reason && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--loss)', whiteSpace: 'nowrap' }}>
                {evt.reason}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
