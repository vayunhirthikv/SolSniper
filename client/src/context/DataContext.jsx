import React, {
  createContext, useContext, useState, useEffect, useCallback, useRef,
} from 'react';
import axios from 'axios';
import { useSocket } from '../hooks/useSocket';

const DataContext = createContext(null);

/** How long cached data is considered "fresh" (ms). */
const CACHE_TTL = 30_000; // 30 s

/** Max live tokens to keep in-memory (newest first) */
const MAX_LIVE_TOKENS = 200;

export function DataProvider({ children }) {
  const { on } = useSocket();

  // ── Overview stats ──────────────────────────────────────────────────────────
  const [stats, setStats] = useState(null);
  const statsTs = useRef(0);

  const loadStats = useCallback(async (force = false) => {
    if (!force && statsTs.current > 0 && Date.now() - statsTs.current < CACHE_TTL) return;
    try {
      const res = await axios.get('/api/analytics/overview');
      setStats(res.data);
      statsTs.current = Date.now();
      return res.data;
    } catch { /* keep stale */ }
  }, []);

  // ── Open positions ──────────────────────────────────────────────────────────
  const [positions, setPositions] = useState(null);
  const posTs = useRef(0);

  const loadPositions = useCallback(async (force = false) => {
    if (!force && positions && Date.now() - posTs.current < CACHE_TTL) return positions;
    try {
      const res = await axios.get('/api/trades', { params: { status: 'open', limit: 20 } });
      const list = res.data.trades || [];
      setPositions(list);
      posTs.current = Date.now();
      return list;
    } catch { /* keep stale */ }
  }, [positions]);

  // ── Live price updates (keyed by tradeId) ───────────────────────────────────
  const [priceUpdates, setPriceUpdates] = useState({});

  // Total running PnL across all open positions (sum of latest price_update values)
  const [totalRunningPnl, setTotalRunningPnl] = useState(0);

  // ── Live scanner tokens (tracked globally so Scanner page is always in sync) ─
  // Newest tokens first, keyed by address for fast lookup
  const [liveTokens, setLiveTokens] = useState([]);
  const liveTokenMapRef = useRef({}); // address → token object

  // ── Daily snapshots (for charts) ────────────────────────────────────────────
  const [snapshots, setSnapshots] = useState(null);
  const snapTs = useRef(0);

  const loadSnapshots = useCallback(async (force = false) => {
    if (!force && snapshots && Date.now() - snapTs.current < CACHE_TTL) return snapshots;
    try {
      const res = await axios.get('/api/analytics/daily-snapshots', { params: { days: 30 } });
      setSnapshots(res.data || []);
      snapTs.current = Date.now();
      return res.data || [];
    } catch { /* keep stale */ }
  }, [snapshots]);

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    loadStats(true);
    loadPositions(true);
    loadSnapshots(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Socket listeners ────────────────────────────────────────────────────────
  useEffect(() => {
    const off1 = on('daily_stats_update', (data) => {
      setStats(prev => prev ? { ...prev, ...data } : data);
      statsTs.current = Date.now();
    });

    const off2 = on('trade_closed', (data) => {
      setPositions(prev => prev ? prev.filter(p => p.id !== data.trade?.id) : prev);
      // Remove from priceUpdates too
      if (data.trade?.id) {
        setPriceUpdates(prev => {
          const next = { ...prev };
          delete next[data.trade.id];
          return next;
        });
      }
      setTimeout(() => {
        loadStats(true);
        loadSnapshots(true);
      }, 200);
    });

    const off3 = on('trade_opened', (data) => {
      if (data.trade) {
        setPositions(prev => prev ? [data.trade, ...prev].slice(0, 20) : [data.trade]);
        setStats(prev => prev
          ? { ...prev, open_trades: (parseInt(prev.open_trades || 0) + 1) }
          : prev
        );
      }
    });

    const off4 = on('price_update', (data) => {
      setPriceUpdates(prev => {
        const next = { ...prev, [data.tradeId]: data };
        // Recompute total running PnL from all live updates
        const total = Object.values(next).reduce((sum, u) => sum + (u.pnlUsd || 0), 0);
        setTotalRunningPnl(total);
        return next;
      });
    });

    // ── Scanner token tracking (always-on, regardless of which page is open) ──
    const offS1 = on('new_token_detected', (data) => {
      if (!data.address) return;
      if (liveTokenMapRef.current[data.address]) return; // already tracked
      const entry = {
        address: data.address,
        name: data.name || 'Unknown',
        symbol: data.symbol || '???',
        created_at: new Date().toISOString(),
        pair_age_minutes: data.age,
        liquidity_usd: data.liquidity,
        volume_usd: null, txn_count: null, unique_wallets: null,
        hard_filter_passed: null,
        hard_filter_reject_reason: null,
        soft_score: null,
        filter_results: [],
        _live: true, _status: 'scanning',
      };
      liveTokenMapRef.current[data.address] = entry;
      setLiveTokens(prev => [entry, ...prev].slice(0, MAX_LIVE_TOKENS));
    });

    const offS2 = on('token_rejected', (data) => {
      if (!data.address) return;
      if (liveTokenMapRef.current[data.address]) {
        const updated = {
          ...liveTokenMapRef.current[data.address],
          _status: 'rejected',
          hard_filter_reject_reason: data.reason,
          hard_filter_passed: false,
        };
        liveTokenMapRef.current[data.address] = updated;
        setLiveTokens(prev => prev.map(t =>
          t.address === data.address ? updated : t
        ));
      }
    });

    const offS3 = on('token_scored', (data) => {
      if (!data.address) return;
      if (liveTokenMapRef.current[data.address]) {
        const updated = {
          ...liveTokenMapRef.current[data.address],
          soft_score: data.score,
          _status: 'scored',
          hard_filter_passed: true,
        };
        liveTokenMapRef.current[data.address] = updated;
        setLiveTokens(prev => prev.map(t =>
          t.address === data.address ? updated : t
        ));
      }
    });

    // Simulation reset — flush everything
    const off5 = on('simulation_reset', () => {
      setStats(null); setPositions([]); setSnapshots([]);
      setPriceUpdates({}); setTotalRunningPnl(0);
      setLiveTokens([]); liveTokenMapRef.current = {};
      statsTs.current = 0; posTs.current = 0; snapTs.current = 0;
      loadStats(true); loadSnapshots(true);
    });

    return () => { off1(); off2(); off3(); off4(); off5(); offS1(); offS2(); offS3(); };
  }, [on, loadStats, loadSnapshots]);

  const value = {
    // stats
    stats,
    loadStats,
    // positions
    positions,
    loadPositions,
    priceUpdates,
    totalRunningPnl,
    // live scanner tokens (always-on tracking)
    liveTokens,
    liveTokenMapRef,
    // snapshots
    snapshots,
    loadSnapshots,
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
