import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  Bookmark,
  Check,
  Clock,
  Compass,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Globe,
  LoaderCircle,
  Mail,
  Moon,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { discoveryApi, type DiscoveredJob, type JobFilters, type TailoredPack } from './discoveryApi';

function relativeTime(iso: string | null): string {
  if (!iso) return 'Recently discovered';
  const diffHours = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000));
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  const days = Math.floor(diffHours / 24);
  if (days < 30) return `${days}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(iso));
}

function scoreBadgeClass(score: number): string {
  if (score >= 75) return 'cs-badge cs-badge-accent cs-tabular';
  if (score >= 55) return 'cs-badge cs-badge-info cs-tabular';
  return 'cs-badge cs-tabular';
}

function liveWordCount(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

export default function DiscoverPage({ onDataChanged }: { onDataChanged?: () => void }) {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<DiscoveredJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningQuick, setRunningQuick] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<DiscoveredJob | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [generatingJobId, setGeneratingJobId] = useState<string | null>(null);
  const [tailoredPack, setTailoredPack] = useState<TailoredPack | null>(null);
  const [editableCoverLetter, setEditableCoverLetter] = useState('');
  const [tailoring, setTailoring] = useState(false);
  const [savingCoverLetter, setSavingCoverLetter] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [filters, setFilters] = useState<JobFilters>({
    search: '',
    workArrangement: 'all',
    compensation: 'all',
    scope: 'all',
    employmentType: 'all',
    recency: 'all',
    sort: 'recent',
  });

  const [importForm, setImportForm] = useState({
    title: '',
    companyName: '',
    sourceUrl: '',
    locationText: '',
    salaryText: '',
    description: '',
  });
  const [importing, setImporting] = useState(false);

  const loadJobs = useCallback(async () => {
    try {
      const [jobsRes, summaryRes] = await Promise.all([
        discoveryApi.listJobs(filters),
        discoveryApi.summary(),
      ]);
      setJobs(jobsRes.jobs);
      setSelectedJob((curr) => (curr ? jobsRes.jobs.find((j) => j.id === curr.id) ?? curr : null));
      setActiveRunId(summaryRes.activeRunId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load discovered jobs.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    if (!activeRunId) return;
    const timer = window.setInterval(() => {
      void loadJobs();
      onDataChanged?.();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeRunId, loadJobs, onDataChanged]);

  async function handleQuickScan() {
    setRunningQuick(true);
    setError('');
    setNotice('');
    try {
      const res = await discoveryApi.startRun({
        mode: 'quick',
        maxDurationMinutes: 8,
        maxJobsToSave: 45,
        includeInternational: true,
        includeNational: true,
        generateDrafts: true,
      });
      setActiveRunId(res.runId);
      setNotice(
        res.alreadyRunning
          ? 'A discovery run is already in progress. New matches and drafts will appear automatically.'
          : 'Quick multi-source scan started! Matching strictly against your target roles and drafting outreach proposals…',
      );
      onDataChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start discovery scan.');
    } finally {
      setRunningQuick(false);
    }
  }

  async function handleImportSubmit(event: FormEvent) {
    event.preventDefault();
    setImporting(true);
    setError('');
    try {
      const res = await discoveryApi.importJob({ ...importForm, generateDrafts: true });
      setImportOpen(false);
      setImportForm({ title: '', companyName: '', sourceUrl: '', locationText: '', salaryText: '', description: '' });
      setNotice(`Imported job and created ${res.contactsAdded} contact leads + ${res.draftsAdded} reviewable outreach drafts.`);
      await loadJobs();
      onDataChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to import job.');
    } finally {
      setImporting(false);
    }
  }

  async function handleStatusChange(job: DiscoveredJob, applicationStatus: DiscoveredJob['applicationStatus']) {
    try {
      await discoveryApi.updateJob(job.id, { applicationStatus });
      setJobs((curr) => curr.map((item) => (item.id === job.id ? { ...item, applicationStatus } : item)));
      if (selectedJob?.id === job.id) setSelectedJob({ ...selectedJob, applicationStatus });
      onDataChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update job status.');
    }
  }

  async function handleDeleteJob(jobId: string) {
    try {
      await discoveryApi.deleteJob(jobId);
      setJobs((curr) => curr.filter((j) => j.id !== jobId));
      if (selectedJob?.id === jobId) {
        setSelectedJob(null);
        setTailoredPack(null);
      }
      onDataChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove job.');
    }
  }

  async function handleGenerateDrafts(job: DiscoveredJob) {
    setGeneratingJobId(job.id);
    setError('');
    try {
      const res = await discoveryApi.generateDraftsForJob(job.id);
      setNotice(
        res.newContactsAdded > 0
          ? `Found ${res.newContactsAdded} real contact${res.newContactsAdded === 1 ? '' : 's'} at ${job.companyName} and created ${res.created} draft${res.created === 1 ? '' : 's'}.`
          : `Created ${res.created} draft proposal${res.created === 1 ? '' : 's'} for ${job.companyName}.`,
      );
      await loadJobs();
      onDataChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to generate drafts.');
    } finally {
      setGeneratingJobId(null);
    }
  }

  async function handleTailor(job: DiscoveredJob) {
    setTailoring(true);
    setError('');
    try {
      const res = await discoveryApi.tailorJob(job.id, { researchCompany: true });
      setTailoredPack(res.pack);
      setEditableCoverLetter(res.pack.coverLetter);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not build tailored cover letter pack.');
    } finally {
      setTailoring(false);
    }
  }

  async function handleSaveCoverLetterDraft(job: DiscoveredJob) {
    if (!editableCoverLetter.trim()) return;
    setSavingCoverLetter(true);
    setError('');
    try {
      const groundingFacts = tailoredPack
        ? [
            ...tailoredPack.highlightedProjects.map((p) => `Project: ${p.name}`),
            tailoredPack.matchedSkills.length ? `Skills: ${tailoredPack.matchedSkills.join(', ')}` : '',
            tailoredPack.companyResearch.sources[0] ? `Researched: ${tailoredPack.companyResearch.sources[0].url}` : '',
          ].filter(Boolean)
        : [];
      await discoveryApi.saveCoverLetter(job.id, {
        coverLetter: editableCoverLetter,
        groundingFacts,
      });
      setNotice(`Saved tailored cover letter for ${job.companyName} to Outreach Drafts for final review.`);
      await loadJobs();
      onDataChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save cover letter draft.');
    } finally {
      setSavingCoverLetter(false);
    }
  }

  const coverWordCount = liveWordCount(editableCoverLetter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Action Header Bar */}
      <div className="cs-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div className="cs-action-wrap">
          <button type="button" className="cs-btn cs-btn-primary" onClick={() => void handleQuickScan()} disabled={runningQuick || Boolean(activeRunId)}>
            {runningQuick || activeRunId ? <LoaderCircle size={15} className="cs-spin" /> : <Play size={15} />}
            {activeRunId ? 'Scanning sources…' : 'Run quick discovery'}
          </button>
          <button type="button" className="cs-btn" onClick={() => navigate('/research')}>
            <Moon size={15} />Configure overnight run
          </button>
          <button type="button" className="cs-btn" onClick={() => setImportOpen((v) => !v)}>
            <Plus size={15} />Import LinkedIn / Wellfound / URL
          </button>
        </div>
        <span className="cs-hint cs-tabular">{jobs.length} target-role match{jobs.length === 1 ? '' : 'es'} shown</span>
      </div>

      {activeRunId && (
        <div className="cs-alert cs-alert-info">
          <div className="cs-alert-content">
            <LoaderCircle size={15} className="cs-spin" />
            <span>Discovery runner is actively scanning sources, filtering by your target roles, and preparing outreach drafts.</span>
          </div>
          <button type="button" className="cs-btn cs-btn-sm" onClick={() => navigate('/research')}>View live logs</button>
        </div>
      )}

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

      {/* Manual URL Import Panel */}
      {importOpen && (
        <form className="cs-card" onSubmit={(e) => void handleImportSubmit(e)}>
          <div className="cs-card-header">
            <div>
              <h2>Import job from LinkedIn, Wellfound, or careers page</h2>
              <p>Paste any job link and description to score it against your profile and generate referral & hiring-manager drafts.</p>
            </div>
            <button type="button" className="cs-btn cs-btn-icon cs-btn-ghost" onClick={() => setImportOpen(false)}><X size={16} /></button>
          </div>
          <div className="cs-card-body">
            <div className="cs-form-grid">
              <label className="cs-field"><span className="cs-label">Job title *</span><input className="cs-input" required value={importForm.title} onChange={(e) => setImportForm({ ...importForm, title: e.target.value })} placeholder="e.g. Full-Stack Developer Intern" /></label>
              <label className="cs-field"><span className="cs-label">Company name *</span><input className="cs-input" required value={importForm.companyName} onChange={(e) => setImportForm({ ...importForm, companyName: e.target.value })} placeholder="e.g. Razorpay" /></label>
              <label className="cs-field cs-field-wide"><span className="cs-label">Job listing URL *</span><input className="cs-input" type="url" required value={importForm.sourceUrl} onChange={(e) => setImportForm({ ...importForm, sourceUrl: e.target.value })} placeholder="https://www.linkedin.com/jobs/view/..." /></label>
              <label className="cs-field"><span className="cs-label">Location / Work mode</span><input className="cs-input" value={importForm.locationText} onChange={(e) => setImportForm({ ...importForm, locationText: e.target.value })} placeholder="e.g. Remote · India" /></label>
              <label className="cs-field"><span className="cs-label">Stipend / Salary (optional)</span><input className="cs-input" value={importForm.salaryText} onChange={(e) => setImportForm({ ...importForm, salaryText: e.target.value })} placeholder="e.g. ₹25,000/month or Unpaid" /></label>
              <label className="cs-field cs-field-wide"><span className="cs-label">Job description (paste for skill matching & email extraction)</span><textarea className="cs-textarea" rows={4} value={importForm.description} onChange={(e) => setImportForm({ ...importForm, description: e.target.value })} placeholder="Paste the job requirements and any contact instructions..." /></label>
            </div>
            <div className="cs-action-wrap" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="cs-btn" onClick={() => setImportOpen(false)}>Cancel</button>
              <button type="submit" className="cs-btn cs-btn-primary" disabled={importing}>
                {importing ? <LoaderCircle size={15} className="cs-spin" /> : <Sparkles size={15} />}
                Score & create outreach drafts
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Multi-Facet Filter Bar */}
      <div className="cs-card cs-filter-bar">
        <div className="cs-filter-search">
          <Search size={15} style={{ color: 'var(--text-muted)' }} />
          <input
            value={filters.search ?? ''}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="Filter by role, company, skill, or location…"
          />
        </div>
        <select className="cs-select" value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value as 'recent' | 'score' })} aria-label="Sort order">
          <option value="recent">Sort: Most recent</option>
          <option value="score">Sort: Highest match</option>
        </select>
        <select className="cs-select" value={filters.recency} onChange={(e) => setFilters({ ...filters, recency: e.target.value })} aria-label="Recency filter">
          <option value="all">Any time</option>
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
        <select className="cs-select" value={filters.workArrangement} onChange={(e) => setFilters({ ...filters, workArrangement: e.target.value })} aria-label="Work arrangement filter">
          <option value="all">All modes</option>
          <option value="remote">Remote</option>
          <option value="hybrid">Hybrid</option>
          <option value="onsite">On-site</option>
        </select>
        <select className="cs-select" value={filters.compensation} onChange={(e) => setFilters({ ...filters, compensation: e.target.value })} aria-label="Compensation filter">
          <option value="all">Paid & Unpaid</option>
          <option value="paid">Paid only</option>
          <option value="unpaid">Unpaid only</option>
          <option value="unspecified">Pay unspecified</option>
        </select>
        <select className="cs-select" value={filters.scope} onChange={(e) => setFilters({ ...filters, scope: e.target.value })} aria-label="Geography scope filter">
          <option value="all">National & Intl</option>
          <option value="national">National</option>
          <option value="international">International</option>
          <option value="remote_global">Global Remote</option>
        </select>
        <select className="cs-select" value={filters.employmentType} onChange={(e) => setFilters({ ...filters, employmentType: e.target.value })} aria-label="Employment type filter">
          <option value="all">All types</option>
          <option value="internship">Internship</option>
          <option value="full_time">Full-time</option>
          <option value="contract">Contract</option>
          <option value="part_time">Part-time</option>
        </select>
      </div>

      {/* Results List */}
      {loading ? (
        <div className="cs-card cs-empty-panel">
          <LoaderCircle size={20} className="cs-spin" style={{ color: 'var(--accent-text)' }} />
          <p>Loading discovered opportunities…</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="cs-card cs-empty-panel">
          <div className="cs-empty-icon"><Compass size={20} /></div>
          <h3>No matching opportunities yet</h3>
          <p>
            Click <strong>Run quick discovery</strong> above to scan public job APIs and ATS boards strictly against your
            selected target roles, or launch an overnight run from Research Runner.
          </p>
        </div>
      ) : (
        <div className="cs-job-list">
          {jobs.map((job) => (
            <article
              className="cs-card cs-job-row"
              key={job.id}
              onClick={() => {
                setSelectedJob(job);
                setTailoredPack(null);
                setEditableCoverLetter('');
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className={scoreBadgeClass(job.matchScore)}>{job.matchScore}% match</span>
                  <strong style={{ fontSize: 15 }}>{job.title}</strong>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 13.5 }}>· {job.companyName}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  <span className="cs-badge"><Clock size={11} />{relativeTime(job.postedAt ?? job.discoveredAt)}</span>
                  <span className="cs-badge">{job.workArrangement === 'unknown' ? 'Mode unspecified' : job.workArrangement}</span>
                  <span className={job.compensationStatus === 'paid' ? 'cs-badge cs-badge-accent' : job.compensationStatus === 'unpaid' ? 'cs-badge cs-badge-warning' : 'cs-badge'}>
                    {job.salaryText || (job.compensationStatus === 'paid' ? 'Paid' : job.compensationStatus === 'unpaid' ? 'Unpaid' : 'Pay unspecified')}
                  </span>
                  <span className="cs-badge"><Globe size={11} />{job.countryScope.replace('_', ' ')}</span>
                  {job.employmentType !== 'unknown' && <span className="cs-badge">{job.employmentType.replace('_', ' ')}</span>}
                  {job.locationText && <span className="cs-hint">{job.locationText}</span>}
                </div>

                {job.matchedSkills.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {job.matchedSkills.slice(0, 6).map((skill) => (
                      <span className="cs-badge cs-badge-accent" key={skill}>{skill}</span>
                    ))}
                  </div>
                )}
              </div>

              <div className="cs-job-row-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="cs-btn cs-btn-sm cs-btn-accent-soft"
                  onClick={() => {
                    const pending = job.pendingDraftCount ?? job.draftCount;
                    const reviewed = job.reviewedDraftCount ?? 0;
                    const target = pending === 0 && reviewed > 0 ? '/reviewed' : '/outreach';
                    navigate(`${target}?jobId=${encodeURIComponent(job.id)}`);
                  }}
                >
                  <Mail size={13} />
                  {(job.pendingDraftCount ?? job.draftCount) > 0
                    ? `${job.pendingDraftCount ?? job.draftCount} draft${(job.pendingDraftCount ?? job.draftCount) === 1 ? '' : 's'}`
                    : (job.reviewedDraftCount ?? 0) > 0
                      ? `${job.reviewedDraftCount} reviewed`
                      : '0 drafts'}
                </button>
                <button
                  type="button"
                  className={`cs-btn cs-btn-sm${job.applicationStatus !== 'none' ? ' cs-btn-primary' : ''}`}
                  onClick={() => void handleStatusChange(job, job.applicationStatus === 'none' ? 'saved' : 'none')}
                >
                  <Bookmark size={13} />{job.applicationStatus === 'none' ? 'Save' : job.applicationStatus}
                </button>
                <a className="cs-btn cs-btn-sm" href={job.applyUrl || job.sourceUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={13} />Open
                </a>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Slide-Over Job Inspector Drawer */}
      {selectedJob && (
        <div className="cs-drawer-backdrop" role="presentation" onMouseDown={() => setSelectedJob(null)}>
          <section className="cs-drawer" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <header className="cs-drawer-header">
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className={scoreBadgeClass(selectedJob.matchScore)}>{selectedJob.matchScore}% Match</span>
                  <span className="cs-badge">{selectedJob.sourceName}</span>
                  {selectedJob.matchedRoleTitle && <span className="cs-badge cs-badge-info">Target: {selectedJob.matchedRoleTitle}</span>}
                </div>
                <h2 style={{ marginTop: 8 }}>{selectedJob.title}</h2>
                <p>{selectedJob.companyName}{selectedJob.locationText ? ` · ${selectedJob.locationText}` : ''}</p>
              </div>
              <button type="button" className="cs-btn cs-btn-icon cs-btn-ghost" onClick={() => setSelectedJob(null)} aria-label="Close inspector">
                <X size={18} />
              </button>
            </header>

            <div className="cs-drawer-body">
              <div className="cs-form-panel">
                <div className="cs-form-panel-head"><strong>Why this matched your profile</strong></div>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, color: 'var(--text-secondary)', fontSize: 13 }}>
                  {selectedJob.matchReasons.map((reason, idx) => <li key={idx}>{reason}</li>)}
                </ul>
              </div>

              {/* Pipeline & Full-Width Wrapping Action Controls (never overflows viewport) */}
              <div className="cs-form-panel" style={{ display: 'grid', gap: 14 }}>
                <label className="cs-field">
                  <span className="cs-label">Pipeline stage</span>
                  <select
                    className="cs-select"
                    value={selectedJob.applicationStatus}
                    onChange={(e) => void handleStatusChange(selectedJob, e.target.value as DiscoveredJob['applicationStatus'])}
                  >
                    <option value="none">Not tracked</option>
                    <option value="saved">Saved</option>
                    <option value="preparing">Preparing</option>
                    <option value="applied">Applied</option>
                    <option value="interviewing">Interviewing</option>
                    <option value="offer">Offer</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </label>

                <div className="cs-field">
                  <span className="cs-label">Outreach, people & tailored cover letter</span>
                  <div className="cs-action-wrap">
                    <button
                      type="button"
                      className="cs-btn cs-btn-sm cs-btn-accent-soft"
                      onClick={() => navigate(`/outreach?jobId=${encodeURIComponent(selectedJob.id)}`)}
                    >
                      <Mail size={14} />Review {selectedJob.pendingDraftCount ?? selectedJob.draftCount} draft{(selectedJob.pendingDraftCount ?? selectedJob.draftCount) === 1 ? '' : 's'}
                    </button>
                    {(selectedJob.reviewedDraftCount ?? 0) > 0 && (
                      <button
                        type="button"
                        className="cs-btn cs-btn-sm"
                        onClick={() => navigate(`/reviewed?jobId=${encodeURIComponent(selectedJob.id)}`)}
                      >
                        Reviewed ({selectedJob.reviewedDraftCount})
                      </button>
                    )}
                    <button
                      type="button"
                      className="cs-btn cs-btn-sm"
                      disabled={generatingJobId === selectedJob.id}
                      onClick={() => void handleGenerateDrafts(selectedJob)}
                    >
                      {generatingJobId === selectedJob.id ? <LoaderCircle size={14} className="cs-spin" /> : <Sparkles size={14} />}
                      Find people & draft
                    </button>
                    <button
                      type="button"
                      className="cs-btn cs-btn-sm cs-btn-primary"
                      disabled={tailoring}
                      onClick={() => void handleTailor(selectedJob)}
                    >
                      {tailoring ? <LoaderCircle size={14} className="cs-spin" /> : <FileText size={14} />}
                      {tailoring ? 'Researching company & writing…' : 'Tailor resume & cover letter'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Tailored Application & Cover Letter Studio */}
              {tailoredPack && (
                <div className="cs-form-panel" style={{ borderColor: 'var(--accent-border)', display: 'grid', gap: 14 }}>
                  <div className="cs-form-panel-head" style={{ marginBottom: 0, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong>Tailored Cover Letter & Resume Pack</strong>
                      <span className={tailoredPack.generatedWithAi ? 'cs-badge cs-badge-accent' : 'cs-badge cs-badge-info'}>
                        {tailoredPack.generatedWithAi ? 'Local Ollama AI' : 'Grounded Engine'}
                      </span>
                      <span className={coverWordCount >= 170 && coverWordCount <= 260 ? 'cs-badge cs-badge-accent cs-tabular' : 'cs-badge cs-badge-warning cs-tabular'}>
                        {coverWordCount} words
                      </span>
                    </div>
                    <button type="button" className="cs-btn cs-btn-sm" disabled={tailoring} onClick={() => void handleTailor(selectedJob)}>
                      <RefreshCw size={13} />Regenerate
                    </button>
                  </div>

                  {/* Company Research Evidence */}
                  {tailoredPack.companyResearch.summary && (
                    <div className="cs-fact-evidence" style={{ display: 'grid', gap: 6 }}>
                      <div>
                        <strong>Company research ({tailoredPack.companyResearch.externalResearchUsed ? 'official web + JD' : 'job description'}):</strong>{' '}
                        {tailoredPack.companyResearch.summary}
                      </div>
                      {tailoredPack.companyResearch.sources.length > 0 && (
                        <div className="cs-action-wrap">
                          {tailoredPack.companyResearch.sources.map((src, i) => (
                            <a key={i} className="cs-badge" href={src.url} target="_blank" rel="noreferrer">
                              <ExternalLink size={10} />{src.title.slice(0, 40)}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Selected 1-2 Projects */}
                  {tailoredPack.highlightedProjects.length > 0 && (
                    <div style={{ display: 'grid', gap: 6 }}>
                      <span className="cs-label">Selected projects ({tailoredPack.highlightedProjects.length} best fit)</span>
                      <div style={{ display: 'grid', gap: 6 }}>
                        {tailoredPack.highlightedProjects.map((proj) => (
                          <div key={proj.name} className="cs-fact-evidence">
                            <strong style={{ color: 'var(--text-primary)' }}>{proj.name}</strong> — chosen for {proj.reason}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tailored Resume Summary */}
                  <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                    <div><span className="cs-label">Tailored Resume Headline:</span> <strong>{tailoredPack.tailoredHeadline}</strong></div>
                    <div style={{ color: 'var(--text-secondary)' }}>{tailoredPack.tailoredSummary}</div>
                  </div>

                  {/* Editable Cover Letter */}
                  <label className="cs-field">
                    <span className="cs-label">Ready-to-use Cover Letter (editable · target 180–250 words)</span>
                    <textarea
                      className="cs-cover-letter-box"
                      value={editableCoverLetter}
                      onChange={(e) => setEditableCoverLetter(e.target.value)}
                    />
                  </label>

                  <div className="cs-action-wrap">
                    <button
                      type="button"
                      className="cs-btn cs-btn-sm cs-btn-primary"
                      onClick={() => {
                        void navigator.clipboard.writeText(editableCoverLetter);
                        setNotice('Cover letter copied to clipboard!');
                      }}
                    >
                      <Copy size={13} />Copy cover letter
                    </button>
                    <button
                      type="button"
                      className="cs-btn cs-btn-sm cs-btn-accent-soft"
                      disabled={savingCoverLetter}
                      onClick={() => void handleSaveCoverLetterDraft(selectedJob)}
                    >
                      {savingCoverLetter ? <LoaderCircle size={13} className="cs-spin" /> : <Check size={13} />}
                      Save to Outreach Drafts
                    </button>
                    <button
                      type="button"
                      className="cs-btn cs-btn-sm"
                      onClick={() => {
                        const updatedMd = tailoredPack.markdownExport.replace(tailoredPack.coverLetter, editableCoverLetter);
                        const blob = new Blob([updatedMd], { type: 'text/markdown;charset=utf-8' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${selectedJob.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-cover-letter-pack.md`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <Download size={13} />Download .md
                    </button>
                  </div>
                </div>
              )}

              {selectedJob.description && (
                <div className="cs-form-panel">
                  <div className="cs-form-panel-head"><strong>Job description snapshot</strong></div>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                    {selectedJob.description}
                  </div>
                </div>
              )}
            </div>

            <footer className="cs-drawer-footer">
              <button type="button" className="cs-btn cs-btn-danger" onClick={() => void handleDeleteJob(selectedJob.id)}>
                <Trash2 size={14} />Remove lead
              </button>
              <a className="cs-btn cs-btn-primary" href={selectedJob.applyUrl || selectedJob.sourceUrl} target="_blank" rel="noreferrer">
                Open original posting<ExternalLink size={14} />
              </a>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
