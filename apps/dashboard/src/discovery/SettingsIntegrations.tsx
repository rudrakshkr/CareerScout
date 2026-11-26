import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  KeyRound,
  LoaderCircle,
  Mail,
  Moon,
  RefreshCw,
  Sparkles,
  Sun,
  Terminal,
  X,
} from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';
import { discoveryApi, type IntegrationsState } from './discoveryApi';

export default function SettingsIntegrations({ onChanged }: { onChanged?: () => void }) {
  const { theme, setTheme } = useTheme();
  const [state, setState] = useState<IntegrationsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingFc, setTestingFc] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [firecrawlKey, setFirecrawlKey] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState('http://127.0.0.1:11434');
  const [ollamaModel, setOllamaModel] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(465);
  const [smtpSecure, setSmtpSecure] = useState(true);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await discoveryApi.getIntegrations();
      setState(data);
      setOllamaUrl(data.config.ollamaBaseUrl || 'http://127.0.0.1:11434');
      setOllamaModel(data.config.ollamaModel ?? data.ollama.models[0] ?? '');
      setSmtpHost(data.config.smtpHost ?? '');
      setSmtpPort(data.config.smtpPort ?? 465);
      setSmtpSecure(data.config.smtpSecure ?? true);
      setSmtpUser(data.config.smtpUser ?? '');
      setSmtpFromName(data.config.smtpFromName ?? '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load integration settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function savePatch(patch: Record<string, unknown>, message: string) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await discoveryApi.saveIntegrations(patch);
      setState({ config: res.config, ollama: res.ollama });
      setNotice(message);
      onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {error && (
        <div className="cs-alert cs-alert-error" role="alert">
          <span>{error}</span>
          <button type="button" className="cs-alert-close" onClick={() => setError('')}><X size={15} /></button>
        </div>
      )}
      {notice && (
        <div className="cs-alert cs-alert-success" role="status">
          <div className="cs-alert-content"><Check size={15} /><span>{notice}</span></div>
          <button type="button" className="cs-alert-close" onClick={() => setNotice('')}><X size={15} /></button>
        </div>
      )}

      <section className="cs-settings-grid">
        {/* Theme */}
        <div className="cs-card">
          <div className="cs-card-header">
            <div>
              <h2>Appearance</h2>
              <p>Toggle Dark or Light mode anytime (or press Ctrl+K).</p>
            </div>
          </div>
          <div className="cs-card-body" style={{ display: 'flex', gap: 10 }}>
            <button type="button" className={`cs-btn${theme === 'dark' ? ' cs-btn-primary' : ''}`} onClick={() => setTheme('dark')} style={{ flex: 1 }}>
              <Moon size={15} />Dark mode
            </button>
            <button type="button" className={`cs-btn${theme === 'light' ? ' cs-btn-primary' : ''}`} onClick={() => setTheme('light')} style={{ flex: 1 }}>
              <Sun size={15} />Light mode
            </button>
          </div>
        </div>

        {/* Pop!_OS Overnight Command */}
        <div className="cs-card">
          <div className="cs-card-header">
            <div>
              <h2>Pop!_OS overnight launcher</h2>
              <p>Prevents Linux idle suspend while your overnight run searches and drafts.</p>
            </div>
            <span className="cs-badge cs-badge-info"><Terminal size={12} />systemd-inhibit</span>
          </div>
          <div className="cs-card-body" style={{ display: 'grid', gap: 8 }}>
            <div className="cs-fact-evidence cs-mono" style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>
              ./scripts/run-overnight.sh
            </div>
            <span className="cs-hint">Run this from your repo root instead of npm run dev before launching a 6-hour run in Research runner.</span>
          </div>
        </div>

        {/* Firecrawl + GitHub Discovery Keys */}
        <div className="cs-card">
          <div className="cs-card-header">
            <div>
              <h2>Web & Real People Discovery Keys</h2>
              <p>Stored locally per user with 0600 permissions inside .local-job-agent/config/.</p>
            </div>
            <span className={state?.config.firecrawlConfigured ? 'cs-badge cs-badge-accent' : 'cs-badge cs-badge-warning'}>
              {state?.config.firecrawlConfigured ? 'Firecrawl Active' : 'Firecrawl Not Set'}
            </span>
          </div>
          <div className="cs-card-body" style={{ display: 'grid', gap: 14 }}>
            <label className="cs-field">
              <span className="cs-label">Firecrawl API Key (powers real LinkedIn profile & ATS search)</span>
              <input
                className="cs-input cs-mono"
                type="password"
                value={firecrawlKey}
                onChange={(e) => setFirecrawlKey(e.target.value)}
                placeholder={state?.config.firecrawlConfigured ? 'Saved securely (enter new key to replace)' : 'fc-...'}
              />
            </label>

            <label className="cs-field">
              <span className="cs-label">GitHub Personal Access Token (optional · free, boosts org engineer lookup to 5,000 req/hr)</span>
              <input
                className="cs-input cs-mono"
                type="password"
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder={state?.config.githubTokenConfigured ? 'Saved securely (enter new token to replace)' : 'github_pat_...'}
              />
            </label>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="cs-btn cs-btn-primary"
                disabled={saving || (!firecrawlKey.trim() && !githubToken.trim())}
                onClick={async () => {
                  const patch: Record<string, unknown> = {};
                  if (firecrawlKey.trim()) patch.firecrawlApiKey = firecrawlKey.trim();
                  if (githubToken.trim()) patch.githubToken = githubToken.trim();
                  await savePatch(patch, 'Discovery API credentials saved locally.');
                  setFirecrawlKey('');
                  setGithubToken('');
                }}
              >
                <KeyRound size={14} />Save keys
              </button>
              <button
                type="button"
                className="cs-btn"
                disabled={testingFc || !state?.config.firecrawlConfigured}
                onClick={async () => {
                  setTestingFc(true);
                  setError('');
                  setNotice('');
                  try {
                    const res = await discoveryApi.testFirecrawl();
                    setNotice(`Firecrawl v2 connected! Verified with ${res.sampleHits} sample search hits.`);
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : 'Firecrawl test failed.');
                  } finally {
                    setTestingFc(false);
                  }
                }}
              >
                {testingFc ? <LoaderCircle size={14} className="cs-spin" /> : <Sparkles size={14} />}
                Test Firecrawl v2
              </button>
            </div>
          </div>
        </div>

        {/* Local Ollama AI */}
        <div className="cs-card">
          <div className="cs-card-header">
            <div>
              <h2>Local Ollama AI</h2>
              <p>Polishes referral drafts and cover letters locally with zero cloud data sharing.</p>
            </div>
            <span className={state?.ollama.reachable ? 'cs-badge cs-badge-accent' : 'cs-badge'}>
              {loading ? 'Checking…' : state?.ollama.reachable ? `Online (${state.ollama.models.length} models)` : 'Offline'}
            </span>
          </div>
          <div className="cs-card-body" style={{ display: 'grid', gap: 14 }}>
            <label className="cs-field">
              <span className="cs-label">Ollama Base URL</span>
              <input className="cs-input cs-mono" value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} placeholder="http://127.0.0.1:11434" />
            </label>

            <label className="cs-field">
              <span className="cs-label">Active Local Model</span>
              {state?.ollama.models.length ? (
                <select className="cs-select" value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)}>
                  <option value="">Disabled (deterministic templates only)</option>
                  {state.ollama.models.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              ) : (
                <input className="cs-input cs-mono" value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)} placeholder="e.g. llama3.2 or qwen2.5:7b" />
              )}
              {!state?.ollama.reachable && (
                <span className="cs-hint">Start Ollama locally (`ollama serve` and `ollama pull llama3.2`), then click Detect models.</span>
              )}
            </label>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="cs-btn cs-btn-primary"
                disabled={saving}
                onClick={() => void savePatch({ ollamaBaseUrl: ollamaUrl, ollamaModel: ollamaModel || null }, 'Ollama settings saved.')}
              >
                <Check size={14} />Save Ollama config
              </button>
              <button type="button" className="cs-btn" disabled={loading} onClick={() => void load()}>
                <RefreshCw size={14} />Detect local models
              </button>
            </div>
          </div>
        </div>

        {/* Gmail / SMTP Outbound Email */}
        <div className="cs-card" style={{ gridColumn: '1 / -1' }}>
          <div className="cs-card-header">
            <div>
              <h2>Gmail / SMTP Email Sending (Human-Approved Only)</h2>
              <p>Unlocks one-click sending from Outreach Drafts with your primary resume PDF attached—only after you explicitly approve a draft.</p>
            </div>
            <span className={state?.config.smtpConfigured ? 'cs-badge cs-badge-accent' : 'cs-badge'}>
              {state?.config.smtpConfigured ? 'SMTP Ready' : 'Not Configured'}
            </span>
          </div>
          <div className="cs-card-body" style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="cs-btn cs-btn-sm"
                onClick={() => {
                  setSmtpHost('smtp.gmail.com');
                  setSmtpPort(465);
                  setSmtpSecure(true);
                }}
              >
                Fill Gmail SMTP preset (smtp.gmail.com:465)
              </button>
            </div>

            <div className="cs-form-grid">
              <label className="cs-field"><span className="cs-label">SMTP Host</span><input className="cs-input cs-mono" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" /></label>
              <label className="cs-field"><span className="cs-label">SMTP Port</span><input className="cs-input cs-mono" type="number" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value) || 465)} /></label>
              <label className="cs-field"><span className="cs-label">Your Email Address (SMTP Username)</span><input className="cs-input" type="email" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="you@gmail.com" /></label>
              <label className="cs-field"><span className="cs-label">App Password (NOT your regular Gmail password)</span><input className="cs-input cs-mono" type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder={state?.config.smtpConfigured ? 'Saved securely (enter new to replace)' : '16-char Google App Password'} /></label>
              <label className="cs-field"><span className="cs-label">Sender Display Name</span><input className="cs-input" value={smtpFromName} onChange={(e) => setSmtpFromName(e.target.value)} placeholder="Rudraksh Kumar" /></label>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
                <label className="cs-checkbox">
                  <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} />
                  <span>Use TLS/SSL (recommended for port 465)</span>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="cs-btn cs-btn-primary"
                disabled={saving}
                onClick={async () => {
                  const patch: Record<string, unknown> = {
                    smtpHost: smtpHost.trim() || null,
                    smtpPort,
                    smtpSecure,
                    smtpUser: smtpUser.trim() || null,
                    smtpFromName: smtpFromName.trim() || null,
                  };
                  if (smtpPass.trim()) patch.smtpPass = smtpPass.trim();
                  await savePatch(patch, 'SMTP configuration saved locally.');
                  setSmtpPass('');
                }}
              >
                <Mail size={14} />Save SMTP settings
              </button>
              <button
                type="button"
                className="cs-btn"
                disabled={testingSmtp || !state?.config.smtpConfigured}
                onClick={async () => {
                  setTestingSmtp(true);
                  setError('');
                  setNotice('');
                  try {
                    await discoveryApi.testSmtp();
                    setNotice('SMTP connection verified! Approved drafts can now send directly with your primary resume attached.');
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : 'SMTP verification failed.');
                  } finally {
                    setTestingSmtp(false);
                  }
                }}
              >
                {testingSmtp ? <LoaderCircle size={14} className="cs-spin" /> : <Check size={14} />}
                Test SMTP connection
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
