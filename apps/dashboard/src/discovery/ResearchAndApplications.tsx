import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  BriefcaseBusiness,
  Check,
  ExternalLink,
  LoaderCircle,
  Mail,
  Moon,
  Play,
  Square,
  Terminal,
  X,
} from 'lucide-react';
import { discoveryApi, type DiscoveredJob, type ResearchRunRecord } from './discoveryApi';

export function ApplicationsView({ onDataChanged }: { onDataChanged?: () => void }) {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<DiscoveredJob[]>([]);
  const [stageFilter, setStageFilter] = useState('active');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await discoveryApi.listJobs({ applicationStatus: stageFilter, sort: 'recent' });
      setJobs(res.jobs);
    } finally {
      setLoading(false);
    }
  }, [stageFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateStage(jobId: string, applicationStatus: DiscoveredJob['applicationStatus']) {
    await discoveryApi.updateJob(jobId, { applicationStatus });
    await load();
    onDataChanged?.();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="cs-card" style={{ padding: '14px 18px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[
          { id: 'active', label: 'All Tracked' },
          { id: 'saved', label: 'Saved' },
          { id: 'preparing', label: 'Preparing' },
          { id: 'applied', label: 'Applied' },
          { id: 'interviewing', label: 'Interviewing' },
          { id: 'offer', label: 'Offer' },
          { id: 'rejected', label: 'Rejected' },
        ].map((stage) => (
          <button
            key={stage.id}
            type="button"
            className={`cs-btn cs-btn-sm${stageFilter === stage.id ? ' cs-btn-primary' : ''}`}
            onClick={() => setStageFilter(stage.id)}
          >
            {stage.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="cs-card cs-empty-panel"><LoaderCircle size={20} className="cs-spin" style={{ color: 'var(--accent-text)' }} /></div>
      ) : jobs.length === 0 ? (
        <div className="cs-card cs-empty-panel">
          <div className="cs-empty-icon"><BriefcaseBusiness size={20} /></div>
          <h3>No tracked applications in this stage</h3>
          <p>Save or apply to roles in Discover Jobs to track them through your application pipeline.</p>
          <button type="button" className="cs-btn cs-btn-primary" onClick={() => navigate('/discover')}>Open Discover Jobs</button>
        </div>
      ) : (
        <div className="cs-job-list">
          {jobs.map((job) => (
            <article className="cs-card cs-job-row" key={job.id} style={{ cursor: 'default' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="cs-badge cs-badge-accent cs-tabular">{job.matchScore}%</span>
                  <strong style={{ fontSize: 14.5 }}>{job.title}</strong>
                  <span style={{ color: 'var(--text-secondary)' }}>· {job.companyName}</span>
                </div>
                <div className="cs-hint" style={{ marginTop: 4 }}>{job.locationText || job.workArrangement} · {job.salaryText || job.compensationStatus}</div>
              </div>
              <div className="cs-job-row-actions">
                <select
                  className="cs-select"
                  style={{ width: 145, minHeight: 31, fontSize: 12 }}
                  value={job.applicationStatus}
                  onChange={(e) => void updateStage(job.id, e.target.value as DiscoveredJob['applicationStatus'])}
                >
                  <option value="saved">Saved</option>
                  <option value="preparing">Preparing</option>
                  <option value="applied">Applied</option>
                  <option value="interviewing">Interviewing</option>
                  <option value="offer">Offer</option>
                  <option value="rejected">Rejected</option>
                  <option value="none">Remove from pipeline</option>
                </select>
                <button type="button" className="cs-btn cs-btn-sm" onClick={() => navigate(`/outreach?jobId=${encodeURIComponent(job.id)}`)}>
                  <Mail size={13} />Drafts ({job.pendingDraftCount ?? job.draftCount})
                </button>
                <a className="cs-btn cs-btn-sm" href={job.applyUrl || job.sourceUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={13} />Posting
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function ResearchRunnerView({ onDataChanged }: { onDataChanged?: () => void }) {
  const [runs, setRuns] = useState<ResearchRunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [hours, setHours] = useState(6);
  const [maxJobs, setMaxJobs] = useState(150);
  const [includeNational, setIncludeNational] = useState(true);
  const [includeInternational, setIncludeInternational] = useState(true);
  const [generateDrafts, setGenerateDrafts] = useState(true);
  const [useLocalOllama, setUseLocalOllama] = useState(false);
  const [firecrawlCredits, setFirecrawlCredits] = useState(0);
  const [customTokens, setCustomTokens] = useState('');
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadRuns = useCallback(async () => {
    try {
      const [runsRes, summaryRes] = await Promise.all([
        discoveryApi.listRuns(),
        discoveryApi.summary(),
      ]);
      setRuns(runsRes.runs);
      if (!defaultsLoaded) {
        if (summaryRes.providers.ollamaConfigured) setUseLocalOllama(true);
        if (summaryRes.providers.firecrawlConfigured) setFirecrawlCredits(25);
        setDefaultsLoaded(true);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load research runs.');
    } finally {
      setLoading(false);
    }
  }, [defaultsLoaded]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const activeRun = runs.find((r) => r.status === 'running' || r.isLiveInProcess);

  useEffect(() => {
    if (!activeRun) return;
    const timer = window.setInterval(() => {
      void loadRuns();
      onDataChanged?.();
    }, 3500);
    return () => window.clearInterval(timer);
  }, [activeRun, loadRuns, onDataChanged]);

  async function launch(mode: 'quick' | 'overnight') {
    setStarting(true);
    setError('');
    setNotice('');
    try {
      const customBoards = customTokens
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((entry) => {
          const [providerRaw, tokenRaw] = entry.includes(':') ? entry.split(':') : ['greenhouse', entry];
          const pLower = providerRaw.trim().toLowerCase();
          const provider: 'greenhouse' | 'lever' | 'ashby' =
            pLower === 'lever' ? 'lever' : pLower === 'ashby' ? 'ashby' : 'greenhouse';
          const token = (tokenRaw ?? '').trim();
          return { provider, token, companyName: token };
        })
        .filter((b) => b.token.length > 0);

      const res = await discoveryApi.startRun({
        mode,
        maxDurationMinutes: mode === 'overnight' ? hours * 60 : 8,
        maxJobsToSave: mode === 'overnight' ? maxJobs : 45,
        includeNational,
        includeInternational,
        generateDrafts,
        firecrawlCreditBudget: firecrawlCredits,
        useLocalOllama,
        customBoards,
      });
      setNotice(
        res.alreadyRunning
          ? 'A research run is already running.'
          : mode === 'overnight'
            ? `Overnight runner started for up to ${hours} hours! Close heavy browser tabs and VS Code to free RAM for Qwen 3.5 4B.`
            : 'Quick discovery scan started!',
      );
      await loadRuns();
      onDataChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to start research run.');
    } finally {
      setStarting(false);
    }
  }

  async function stopActive(runId: string) {
    try {
      await discoveryApi.stopRun(runId);
      setNotice('Stop requested. Saving current checkpoint…');
      await loadRuns();
      onDataChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not stop run.');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="cs-card">
        <div className="cs-card-header">
          <div>
            <h2>Overnight & on-demand discovery runner</h2>
            <p>
              Overnight Deep Researcher sweeps 50+ India & Global-Remote ATS boards + RemoteFirstJobs, Remotive, HN Hiring, Firecrawl v2 (reserving 60% of credits for real-people waterfall & backfill), &
              Firecrawl v2, double-checks international WFH/relocation eligibility, and verifies that every discovered contact
              currently works at the exact company before drafting outreach.
            </p>
          </div>
          {activeRun && (
            <button type="button" className="cs-btn cs-btn-danger" onClick={() => void stopActive(activeRun.id)}>
              <Square size={14} />Stop active run
            </button>
          )}
        </div>

        <div className="cs-card-body" style={{ display: 'grid', gap: 16 }}>
          {error && <div className="cs-alert cs-alert-error"><span>{error}</span><button type="button" className="cs-alert-close" onClick={() => setError('')}><X size={15} /></button></div>}
          {notice && <div className="cs-alert cs-alert-success"><div className="cs-alert-content"><Check size={15} /><span>{notice}</span></div><button type="button" className="cs-alert-close" onClick={() => setNotice('')}><X size={15} /></button></div>}

          <div className="cs-form-grid">
            <label className="cs-field">
              <span className="cs-label">Overnight duration window (hours)</span>
              <input className="cs-input" type="number" min={1} max={8} value={hours} onChange={(e) => setHours(Number(e.target.value) || 6)} />
            </label>
            <label className="cs-field">
              <span className="cs-label">Max new jobs to save per run</span>
              <input className="cs-input" type="number" min={10} max={500} value={maxJobs} onChange={(e) => setMaxJobs(Number(e.target.value) || 150)} />
            </label>
            <label className="cs-field">
              <span className="cs-label">Firecrawl credit cap (configured in Settings)</span>
              <input className="cs-input" type="number" min={0} max={50} value={firecrawlCredits} onChange={(e) => setFirecrawlCredits(Number(e.target.value) || 0)} />
            </label>
            <label className="cs-field">
              <span className="cs-label">Extra company ATS boards (optional)</span>
              <input className="cs-input" value={customTokens} onChange={(e) => setCustomTokens(e.target.value)} placeholder="e.g. greenhouse:airbnb, lever:netflix, ashby:ramp" />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <label className="cs-checkbox"><input type="checkbox" checked={includeNational} onChange={(e) => setIncludeNational(e.target.checked)} /><span>Include national jobs</span></label>
            <label className="cs-checkbox"><input type="checkbox" checked={includeInternational} onChange={(e) => setIncludeInternational(e.target.checked)} /><span>Include international jobs (only WFH from India or on-site with relocation support)</span></label>
            <label className="cs-checkbox"><input type="checkbox" checked={generateDrafts} onChange={(e) => setGenerateDrafts(e.target.checked)} /><span>Find verified current employees & draft referral/outreach proposals</span></label>
            <label className="cs-checkbox"><input type="checkbox" checked={useLocalOllama} onChange={(e) => setUseLocalOllama(e.target.checked)} /><span>Use local Ollama AI (verify current employees, international eligibility & polish drafts)</span></label>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="cs-btn cs-btn-primary" disabled={starting || Boolean(activeRun)} onClick={() => void launch('overnight')}>
              {activeRun ? <LoaderCircle size={15} className="cs-spin" /> : <Moon size={15} />}
              Start overnight run ({hours}h)
            </button>
            <button type="button" className="cs-btn" disabled={starting || Boolean(activeRun)} onClick={() => void launch('quick')}>
              <Play size={15} />Run quick scan now
            </button>
          </div>
        </div>
      </div>

      {/* Run History & Live Logs */}
      {loading ? (
        <div className="cs-card cs-empty-panel"><LoaderCircle size={20} className="cs-spin" style={{ color: 'var(--accent-text)' }} /></div>
      ) : runs.length === 0 ? (
        <div className="cs-card cs-empty-panel">
          <div className="cs-empty-icon"><Terminal size={20} /></div>
          <h3>No research runs recorded yet</h3>
          <p>Launch a quick scan or overnight run above to watch live discovery logs and checkpoints here.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {runs.map((run) => (
            <article className="cs-card" key={run.id}>
              <div className="cs-card-header" style={{ flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className={run.status === 'running' ? 'cs-badge cs-badge-info' : run.status === 'completed' ? 'cs-badge cs-badge-accent' : run.status === 'failed' ? 'cs-badge cs-badge-danger' : 'cs-badge'}>
                    {run.status === 'running' && <LoaderCircle size={11} className="cs-spin" />}
                    {run.status}
                  </span>
                  <strong>{run.mode === 'overnight' ? 'Overnight Research Run' : 'Quick Discovery Scan'}</strong>
                  <span className="cs-hint cs-mono">{new Date(run.createdAt).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span className="cs-badge cs-tabular">Scanned: {run.jobsScanned}</span>
                  <span className="cs-badge cs-badge-accent cs-tabular">Matched: {run.jobsMatched}</span>
                  <span className="cs-badge cs-tabular">Contacts: {run.contactsFound}</span>
                  <span className="cs-badge cs-badge-info cs-tabular">Drafts: {run.draftsCreated}</span>
                </div>
              </div>
              <div className="cs-card-body">
                <div className="cs-log-box cs-mono">
                  {run.logs.slice(-14).map((entry, idx) => (
                    <div key={idx} className={`cs-log-line ${entry.level}`}>
                      <span>{new Date(entry.at).toLocaleTimeString()}</span>
                      <span>{entry.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
