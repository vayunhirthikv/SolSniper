import React from 'react';

export function StatusDot({ status }) {
  const cls = {
    running: 'running',
    paused: 'paused',
    error: 'error',
    connected: 'running',
    disconnected: 'error',
  }[status] || 'paused';

  return (
    <div className={`status-indicator ${cls}`} title={cls.toUpperCase()}>
      <span className="status-bar" />
      <span className="status-bar" />
      <span className="status-bar" />
    </div>
  );
}
