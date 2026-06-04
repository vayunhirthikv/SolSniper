import React, { useEffect, useRef, useState } from 'react';

function useCountUp(target, duration = 500) {
  const [value, setValue] = useState(target);
  const prevRef = useRef(target);

  useEffect(() => {
    const prev = prevRef.current;
    if (prev === target) return;
    prevRef.current = target;

    const start = Date.now();
    const diff = target - prev;

    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(prev + diff * eased);
      if (progress < 1) requestAnimationFrame(tick);
      else setValue(target);
    };

    requestAnimationFrame(tick);
  }, [target, duration]);

  return value;
}

export function MetricCard({ label, value, displayValue, type = 'white', subtitle, sublabel, compact }) {
  const colorMap = { profit: 'profit', loss: 'loss', neutral: 'neutral', white: 'white', accent: 'white' };
  const cls = colorMap[type] || 'white';

  return (
    <div className={`metric-card ${type}${compact ? ' compact' : ''}`}>
      <div className="metric-label">{label}</div>
      <div className={`metric-value ${cls}`} style={compact ? { fontSize: 22 } : {}}>
        {displayValue || value}
      </div>
      {sublabel && (
        <div style={{ marginTop: 4, fontSize: 10, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {sublabel}
        </div>
      )}
      {subtitle && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

