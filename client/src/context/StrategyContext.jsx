import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const StrategyContext = createContext(null);

const DEFAULTS = {
  min_liquidity_usd: '3000',
  min_volume_usd: '800',
  max_pair_age_minutes: '20',
  min_txn_count: '20',
  min_unique_wallets: '10',
  max_top_holder_pct: '60',
  min_soft_score: '4',
  pos_tier1_score: '4',
  pos_tier1_size: '0.75',
  pos_tier2_score: '5',
  pos_tier2_size: '1.25',
  pos_tier3_score: '6',
  pos_tier3_size: '2.00',
  pos_tier4_score: '7',
  pos_tier4_size: '2.50',
  daily_loss_limit_usd: '40',
  stop_loss_pct: '65',
  take_profit_pct: '',
  time_exit_hours: '3',
  pumpfun_social_bonus: '0.50',
  exit_ladder_enabled: 'true',
  telegram_bot_token: '',
  telegram_chat_id: '',
  exit_ladder_level_1: '200',
  exit_ladder_sell_1: '20',
  exit_ladder_level_2: '500',
  exit_ladder_sell_2: '20',
  exit_ladder_level_3: '1000',
  exit_ladder_sell_3: '20',
  exit_ladder_level_4: '3000',
  exit_ladder_sell_4: '50',
};

export function StrategyProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    try {
      const res = await axios.get('/api/settings');
      setSettings({ ...DEFAULTS, ...res.data });
    } catch {
      // Use defaults if backend not available
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateSettings = async (updates) => {
    try {
      const res = await axios.put('/api/settings', updates);
      setSettings(prev => ({ ...prev, ...updates }));
      return res.data;
    } catch (err) {
      throw new Error(err.response?.data?.error || err.message);
    }
  };

  const resetToDefaults = async () => {
    try {
      const res = await axios.post('/api/settings/reset');
      setSettings({ ...DEFAULTS, ...res.data.settings });
      return res.data;
    } catch (err) {
      throw new Error(err.response?.data?.error || err.message);
    }
  };

  return (
    <StrategyContext.Provider value={{ settings, loading, updateSettings, resetToDefaults, reload: loadSettings }}>
      {children}
    </StrategyContext.Provider>
  );
}

export function useStrategy() {
  const ctx = useContext(StrategyContext);
  if (!ctx) throw new Error('useStrategy must be used within StrategyProvider');
  return ctx;
}
