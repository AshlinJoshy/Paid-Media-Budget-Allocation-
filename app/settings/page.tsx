'use client';
import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Save, RefreshCw, Check, Key, Database } from 'lucide-react';
import { SupermetricsAccount, DS_NAMES } from '@/types';
import PlatformBadge from '@/components/PlatformBadge';

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [accounts, setAccounts] = useState<SupermetricsAccount[]>([]);
  const [fetchingAccounts, setFetchingAccounts] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const flash = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 3500);
  };

  const loadAccounts = useCallback(async () => {
    const res = await fetch('/api/supermetrics/accounts');
    const data = await res.json();
    setAccounts(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((data) => {
      setHasKey(data.has_api_key === 'true');
    });
    loadAccounts();
  }, [loadAccounts]);

  async function saveApiKey() {
    if (!apiKey.trim()) return;
    setSavingKey(true);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supermetrics_api_key: apiKey.trim() }),
      });
      setHasKey(true);
      setApiKey('');
      flash('API key saved');
    } catch {
      flash('Failed to save API key', 'error');
    } finally {
      setSavingKey(false);
    }
  }

  async function fetchAccounts() {
    setFetchingAccounts(true);
    try {
      const res = await fetch('/api/supermetrics/accounts', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        flash(data.error || 'Failed to fetch accounts', 'error');
      } else {
        setAccounts(data.accounts ?? []);
        const count = (data.accounts ?? []).length;
        flash(`Found ${count} account${count !== 1 ? 's' : ''}${data.errors?.length ? ` (some errors: ${data.errors[0]})` : ''}`);
      }
    } catch {
      flash('Network error', 'error');
    } finally {
      setFetchingAccounts(false);
    }
  }

  async function toggleAccount(id: string, current: boolean) {
    setAccounts((prev) => prev.map((a) => a.id === id ? { ...a, is_selected: !current } : a));
    await fetch('/api/supermetrics/accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_selected: !current }),
    });
  }

  const groupedAccounts = accounts.reduce<Record<string, SupermetricsAccount[]>>((acc, a) => {
    if (!acc[a.ds_id]) acc[a.ds_id] = [];
    acc[a.ds_id].push(a);
    return acc;
  }, {});

  const dsOrder = ['FA', 'AW', 'LI', 'TT', 'SC'];
  const sortedDs = [...new Set([...dsOrder, ...Object.keys(groupedAccounts)])].filter((ds) => groupedAccounts[ds]);

  const platformMap: Record<string, string> = { FA: 'meta', AW: 'google', LI: 'linkedin', TT: 'tiktok', SC: 'snapchat' };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-slate-900 text-white px-4 py-3 flex items-center gap-3">
        <a href="/" className="p-1.5 rounded hover:bg-white/10">
          <ArrowLeft className="h-4 w-4" />
        </a>
        <span className="font-semibold text-sm">Settings</span>
      </header>

      <div className="max-w-2xl mx-auto py-8 px-4 space-y-8">
        {/* Flash message */}
        {msg && (
          <div className={`px-4 py-2.5 rounded text-sm ${msg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {msg.text}
          </div>
        )}

        {/* Supermetrics API Key */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-gray-500" />
            <h2 className="font-semibold text-gray-800">Supermetrics API Key</h2>
          </div>

          {hasKey && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-3 py-2 rounded">
              <Check className="h-4 w-4" />
              API key is configured. Enter a new key below to replace it.
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasKey ? 'Enter new key to replace…' : 'Paste your Supermetrics API key…'}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400"
              onKeyDown={(e) => { if (e.key === 'Enter') saveApiKey(); }}
            />
            <button
              onClick={saveApiKey}
              disabled={savingKey || !apiKey.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {savingKey ? 'Saving…' : 'Save'}
            </button>
          </div>
          <p className="text-xs text-gray-400">
            Find your API key in the Supermetrics app under Account → API. The key is stored locally on your machine and never sent anywhere except Supermetrics.
          </p>
        </section>

        {/* Ad Accounts */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-gray-500" />
              <h2 className="font-semibold text-gray-800">Ad Accounts</h2>
            </div>
            <button
              onClick={fetchAccounts}
              disabled={fetchingAccounts || !hasKey}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${fetchingAccounts ? 'animate-spin' : ''}`} />
              {fetchingAccounts ? 'Fetching…' : 'Fetch Accounts'}
            </button>
          </div>

          {!hasKey && (
            <p className="text-sm text-gray-400 italic">Save your API key first to fetch accounts.</p>
          )}

          {accounts.length === 0 && hasKey && (
            <p className="text-sm text-gray-400 italic">
              No accounts yet. Click "Fetch Accounts" to load all your Meta, Google, LinkedIn, TikTok, and Snapchat ad accounts.
            </p>
          )}

          {sortedDs.map((dsId) => (
            <div key={dsId}>
              <div className="flex items-center gap-2 mb-2">
                <PlatformBadge platform={platformMap[dsId] ?? 'unknown'} label={DS_NAMES[dsId] ?? dsId} size="sm" />
                <span className="text-xs text-gray-400">{groupedAccounts[dsId].length} account{groupedAccounts[dsId].length !== 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-1">
                {groupedAccounts[dsId].map((acc) => (
                  <label key={acc.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acc.is_selected}
                      onChange={() => toggleAccount(acc.id, acc.is_selected)}
                      className="h-4 w-4 rounded text-blue-600"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{acc.account_name}</p>
                      <p className="text-xs text-gray-400">{acc.account_id}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))}

          <p className="text-xs text-gray-400">
            Only selected accounts will be included when syncing campaign data. You can change this at any time.
          </p>
        </section>
      </div>
    </div>
  );
}
