import React from 'react';

export function LoadingSpinner({ size = 20, className = '' }) {
  return (
    <div
      className={`spinner ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <LoadingSpinner size={32} />
        <p style={{ marginTop: 16, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          Loading...
        </p>
      </div>
    </div>
  );
}
