import React, { useState } from 'react';
import { useStrategy } from '../context/StrategyContext';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import axios from 'axios';

function SettingRow({ label, settingKey, type = 'number', value, onChange, description }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        {description && <div style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{description}</div>}
      </div>
      {type === 'checkbox' ? (
        <input
          type="checkbox"
          style={{ width: 24, height: 24 }}
          checked={String(value) === 'true'}
          onChange={e => onChange(settingKey, e.target.checked ? 'true' : 'false')}
        />
      ) : (
        <input
          type={type}
          step="0.01"
          className="input"
          style={{ width: 120, textAlign: 'right' }}
          value={value}
          onChange={e => onChange(settingKey, e.target.value)}
        />
      )}
    </div>
  );
}

function TierSettingRow({ labelPrefix, scoreKey, sizeKey, scoreValue, sizeValue, onChange, description }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{labelPrefix}</div>
        {description && <div style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{description}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Score &ge;</span>
        <input
          type="number"
          className="input"
          style={{ width: 60, textAlign: 'center' }}
          value={scoreValue}
          onChange={e => onChange(scoreKey, e.target.value)}
        />
        <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Size $</span>
        <input
          type="number"
          step="0.01"
          className="input"
          style={{ width: 80, textAlign: 'right' }}
          value={sizeValue}
          onChange={e => onChange(sizeKey, e.target.value)}
        />
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-header">
        <span className="section-title">{title}</span>
      </div>
      {children}
    </div>
  );
}

export function Settings() {
  const { settings, loading, updateSettings, resetToDefaults } = useStrategy();
  const [localSettings, setLocalSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [testingTg, setTestingTg] = useState(false);
  const [tgResult, setTgResult] = useState(null);

  const handleResetAll = async () => {
    if (!window.confirm('WARNING: This will permanently delete all trades, price history, stats, scanned tokens, and filters. This action CANNOT be undone. Are you sure you want to proceed?')) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await axios.post('/api/trades/reset');
      alert('Simulation reset successfully!');
      window.location.reload();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const current = localSettings || settings;

  const handleChange = (key, value) => {
    setLocalSettings(prev => ({ ...(prev || settings), [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!localSettings) return;
    setSaving(true);
    setError(null);
    try {
      await updateSettings(localSettings);
      setLocalSettings(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreDefaults = async () => {
    if (!window.confirm('Are you sure you want to restore all settings to their default values?')) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await resetToDefaults();
      setLocalSettings(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestTelegram = async () => {
    const token = current.telegram_bot_token;
    const chatId = current.telegram_chat_id;
    if (!token || !chatId) {
      setTgResult({ type: 'error', msg: 'Please enter both Token and Chat ID first.' });
      return;
    }
    
    setTestingTg(true);
    setTgResult(null);
    try {
      await axios.post('/api/settings/test-telegram', { token, chatId });
      setTgResult({ type: 'success', msg: 'Test message sent! Check your Telegram.' });
    } catch (err) {
      setTgResult({ type: 'error', msg: err.response?.data?.error || err.message });
    } finally {
      setTestingTg(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  const SECTIONS = [
    {
      title: 'Hard Filter Thresholds',
      rows: [
        { label: 'Min Liquidity ($)', key: 'min_liquidity_usd', desc: 'Minimum pool liquidity to consider' },
        { label: 'Min Volume ($)', key: 'min_volume_usd', desc: '24h minimum volume' },
        { label: 'Max Pair Age (minutes)', key: 'max_pair_age_minutes', desc: 'Skip pairs older than this' },
        { label: 'Min Transactions', key: 'min_txn_count', desc: 'Minimum 24h transaction count' },
        { label: 'Min Unique Wallets', key: 'min_unique_wallets', desc: 'Anti-wash-trading check' },
        { label: 'Max Top Holder %', key: 'max_top_holder_pct', desc: 'Reject whale-concentrated tokens' },
      ],
    },
    {
      title: 'Scoring & Entry',
      rows: [
        { label: 'Min Score to Enter', key: 'min_soft_score', desc: 'Minimum soft score (4-10) for virtual buy' },
      ],
    },
    {
      title: 'Position Sizing',
      rows: [
        { label: 'Tier 1', type: 'tier', scoreKey: 'pos_tier1_score', sizeKey: 'pos_tier1_size', desc: 'Lowest position tier' },
        { label: 'Tier 2', type: 'tier', scoreKey: 'pos_tier2_score', sizeKey: 'pos_tier2_size', desc: 'Medium-low position tier' },
        { label: 'Tier 3', type: 'tier', scoreKey: 'pos_tier3_score', sizeKey: 'pos_tier3_size', desc: 'Medium-high position tier' },
        { label: 'Tier 4', type: 'tier', scoreKey: 'pos_tier4_score', sizeKey: 'pos_tier4_size', desc: 'Highest position tier' },
        { label: 'Pump.fun + Social Bonus ($)', key: 'pumpfun_social_bonus', desc: 'Extra size when pump.fun grad AND has social' },
      ],
    },
    {
      title: 'Notifications',
      rows: [
        { label: 'Telegram Bot Token', key: 'telegram_bot_token', type: 'text', desc: 'Bot token from @BotFather' },
        { label: 'Telegram Chat ID', key: 'telegram_chat_id', type: 'text', desc: 'Your chat ID (or group ID) to receive alerts' },
      ],
    },
    {
      title: 'Exit Rules',
      rows: [
        { label: 'Take Profit %', key: 'take_profit_pct', desc: 'Close trade automatically at this profit percentage' },
        { label: 'Stop Loss %', key: 'stop_loss_pct', desc: 'Close trade at this loss percentage' },
        { label: 'Time Exit (hours)', key: 'time_exit_hours', desc: 'Close if under +20% after this many hours' },
        { label: 'Dead Pool Liquidity ($)', key: 'dead_pool_liquidity_usd', desc: 'Exit if total pool liquidity drops below this amount' },
        { label: 'Liquidity Drop (%)', key: 'liquidity_drop_pct', desc: 'Exit if liquidity drops by this percentage from entry' },
      ],
    },
    {
      title: 'Exit Ladder Rules',
      rows: [
        { label: 'Enable Exit Ladder', key: 'exit_ladder_enabled', type: 'checkbox', desc: 'Use multi-stage partial sells (overrides Take Profit % if enabled)' },
        { label: 'Level 1 Trigger PnL %', key: 'exit_ladder_level_1', desc: 'PnL % to trigger first partial sell' },
        { label: 'Level 1 Sell Position %', key: 'exit_ladder_sell_1', desc: 'Percentage of original position to sell' },
        { label: 'Level 2 Trigger PnL %', key: 'exit_ladder_level_2', desc: 'PnL % to trigger second partial sell' },
        { label: 'Level 2 Sell Position %', key: 'exit_ladder_sell_2', desc: 'Percentage of original position to sell' },
        { label: 'Level 3 Trigger PnL %', key: 'exit_ladder_level_3', desc: 'PnL % to trigger third partial sell' },
        { label: 'Level 3 Sell Position %', key: 'exit_ladder_sell_3', desc: 'Percentage of original position to sell' },
        { label: 'Level 4 Trigger PnL %', key: 'exit_ladder_level_4', desc: 'PnL % to trigger fourth partial sell' },
        { label: 'Level 4 Sell Remaining %', key: 'exit_ladder_sell_4', desc: 'Percentage of remaining position to sell' },
      ],
    },
    {
      title: 'Risk Management',
      rows: [
        { label: 'Daily Loss Limit ($)', key: 'daily_loss_limit_usd', desc: 'Halt all buys if total daily losses reach this' },
        { label: 'Global Take Profit ($)', key: 'global_tp_usd', desc: 'Close ALL open trades if total unrealized net profit hits this (leave blank to disable)' },
        { label: 'Global Stop Loss ($)', key: 'global_sl_usd', desc: 'Close ALL open trades if total unrealized net loss hits this (leave blank to disable)' },
      ],
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em' }}>Settings</h1>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', letterSpacing: '0.1em' }}>STRATEGY CONFIG</span>
      </div>

      <div style={{
        padding: '12px 16px',
        background: 'var(--neutral-dim)',
        border: '1px solid #f59e0b40',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        color: 'var(--neutral)',
      }}>
        ⚠ Changes take effect immediately on the next scan cycle. All trades are simulated — no real money involved.
      </div>

      <div className="settings-grid">
        {/* Left Column: Form Settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {SECTIONS.map(section => (
            <Section key={section.title} title={section.title}>
              {section.rows.map(row => (
                row.type === 'tier' ? (
                  <TierSettingRow
                    key={row.scoreKey}
                    labelPrefix={row.label}
                    scoreKey={row.scoreKey}
                    sizeKey={row.sizeKey}
                    scoreValue={current[row.scoreKey] || ''}
                    sizeValue={current[row.sizeKey] || ''}
                    onChange={handleChange}
                    description={row.desc}
                  />
                ) : (
                  <SettingRow
                    key={row.key}
                    label={row.label}
                    settingKey={row.key}
                    type={row.type || 'number'}
                    value={current[row.key] || ''}
                    description={row.desc}
                    onChange={handleChange}
                  />
                )
              ))}
              
              {section.title === 'Notifications' && (
                <div style={{ marginTop: 16, padding: 12, background: 'var(--bg-base)', borderRadius: 6, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
                      <strong>How to setup:</strong><br />
                      1. Message <code>@BotFather</code> on Telegram and send <code>/newbot</code> to get your token.<br />
                      2. Message <code>@userinfobot</code> on Telegram to get your Chat ID.<br />
                      3. Message your new bot and click <strong>Start</strong> before sending test!
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <button 
                        className="btn btn-neutral" 
                        style={{ padding: '6px 12px', fontSize: 11 }}
                        onClick={handleTestTelegram}
                        disabled={testingTg}
                      >
                        {testingTg ? 'SENDING...' : 'TEST CONNECTION'}
                      </button>
                      {tgResult && (
                        <div style={{ marginTop: 6, fontSize: 11, color: tgResult.type === 'success' ? 'var(--profit)' : 'var(--loss)' }}>
                          {tgResult.msg}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </Section>
          ))}

          {/* Save Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || !localSettings}
              style={{ opacity: !localSettings ? 0.5 : 1 }}
            >
              {saving ? <LoadingSpinner size={14} /> : saved ? '✓ SAVED' : 'SAVE SETTINGS'}
            </button>
            {localSettings && (
              <button className="btn btn-ghost" onClick={() => setLocalSettings(null)}>
                UNDO CHANGES
              </button>
            )}
            <button
              className="btn btn-ghost"
              onClick={handleRestoreDefaults}
              disabled={saving}
              style={{ color: 'var(--fg-muted)' }}
            >
              RESTORE DEFAULTS
            </button>
            {error && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--loss)' }}>{error}</span>
            )}
            {saved && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--profit)' }}>Settings saved and engine updated ✓</span>
            )}
          </div>
        </div>

        {/* Right Column: Information & Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, position: 'sticky', top: 20 }}>
          {/* Current Ladder Levels (dynamic) */}
          <div className="card">
            <div className="section-header"><span className="section-title">Exit Ladder Summary</span></div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)', lineHeight: 2 }}>
              <div>+{current.exit_ladder_level_1 || 200}% → Sell <strong style={{ color: 'var(--fg)' }}>{current.exit_ladder_sell_1 || 20}%</strong> of original position</div>
              <div>+{current.exit_ladder_level_2 || 500}% → Sell <strong style={{ color: 'var(--fg)' }}>{current.exit_ladder_sell_2 || 20}%</strong> of original position</div>
              <div>+{current.exit_ladder_level_3 || 1000}% → Sell <strong style={{ color: 'var(--fg)' }}>{current.exit_ladder_sell_3 || 20}%</strong> of original position</div>
              <div>+{current.exit_ladder_level_4 || 3000}% → Sell <strong style={{ color: 'var(--fg)' }}>{current.exit_ladder_sell_4 || 50}%</strong> of remaining position</div>
              <div style={{ marginTop: 8, color: 'var(--fg-muted)' }}>Remaining position rides until emergency exit</div>
            </div>
          </div>

          {/* Simulation Info */}
          <div className="card">
            <div className="section-header"><span className="section-title">Simulator Info</span></div>
            <div style={{ fontSize: 12, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <strong style={{ display: 'block', marginBottom: 2 }}>Scanner Loop</strong>
                <span style={{ color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  DexScreener new pairs are polled and queued every 30 seconds.
                </span>
              </div>
              <div>
                <strong style={{ display: 'block', marginBottom: 2 }}>Active Trackers</strong>
                <span style={{ color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  Open trades are evaluated every 60 seconds against exit triggers.
                </span>
              </div>
              <div>
                <strong style={{ display: 'block', marginBottom: 2 }}>Risk Limits</strong>
                <span style={{ color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  Daily loss limit halts future buys if simulation losses exceed settings.
                </span>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="card" style={{ border: '1px solid #ff444440', background: 'rgba(255, 68, 68, 0.02)' }}>
            <div className="section-header"><span className="section-title" style={{ color: 'var(--loss)' }}>Danger Zone</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.4 }}>
                Permanently purges all virtual trades, analytics snapshots, scanned tokens, and filter results.
              </div>
              <button
                className="btn"
                onClick={handleResetAll}
                disabled={saving}
                style={{
                  borderColor: 'var(--loss)',
                  color: 'var(--loss)',
                  background: 'transparent',
                  fontSize: 11,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  width: '100%',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--loss)';
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--loss)';
                }}
              >
                RESET SIMULATION
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
