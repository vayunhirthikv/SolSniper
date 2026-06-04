import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { StrategyProvider } from './context/StrategyContext';
import { DataProvider } from './context/DataContext';
import { Dashboard } from './pages/Dashboard';
import { Scanner } from './pages/Scanner';
import { Trades } from './pages/Trades';
import { Analytics } from './pages/Analytics';
import { TokenDetail } from './pages/TokenDetail';
import { Backtest } from './pages/Backtest';
import { Settings } from './pages/Settings';
import './index.css';

export default function App() {
  return (
    <StrategyProvider>
      <DataProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="scanner" element={<Scanner />} />
              <Route path="trades" element={<Trades />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="token/:address" element={<TokenDetail />} />
              <Route path="backtest" element={<Backtest />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </DataProvider>
    </StrategyProvider>
  );
}
