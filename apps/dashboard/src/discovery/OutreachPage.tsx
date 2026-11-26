import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  Check,
  Copy,
  ExternalLink,
  LoaderCircle,
  Mail,
  Send,
  ShieldCheck,
  Sparkles,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import { discoveryApi, type OutreachDraftRecord } from './discoveryApi';

const CHANNEL_LABELS: Record<OutreachDraftRecord['channel'], string> = {
  email: 'Direct Email',
  referral_request: 'Referral Request',
  linkedin_note: 'LinkedIn Note',
  linkedin_dm: 'LinkedIn DM',
  cover_letter: 'Application Pitch',
  other: 'Message',
};

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(value.trim());
}

function looksLikePersonProfile(value: string): boolean {
  return /linkedin\.com\/in\/|github\.com\/[^/?#]+\/?$|x\.com\/[^/?#]+\/?$/iu.test(value.trim());
}

export default function OutreachPage({ onDataChanged }: { onDataChanged?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const jobIdParam = new URLSearchParams(location.search).get('jobId') || '';

  const [drafts, setDrafts] = useState<OutreachDraftRecord[]>([]);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('pending_review');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, { subject: string; body: string; recipientLabel: string; recipientTarget: string }>>({});
  const [attachResumeById, setAttachResumeById] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [findingJobId, setFindingJobId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const [res, summary] = await Promise.all([
        discoveryApi.listDrafts({
          status: jobIdParam ? 'all' : statusFilter,
          channel: channelFilter,
          jobId: jobIdParam || undefined,
        }),
        discoveryApi.summary(),
      ]);
      setDrafts(res.drafts);
      setSmtpConfigured(Boolean(summary.providers.smtpConfigured));
      const nextEdits: Record<string, { subject: string; body: string; recipientLabel: string; recipientTarget: string }> = {};
      for (const d of res.drafts) {
        nextEdits[d.id] = {
          subject: d.subject ?? '',
          body: d.body,
          recipientLabel: d.recipientLabel,
          recipientTarget: d.recipientTarget ?? '',
        };
      }
      setEdits(nextEdits);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load outreach drafts.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, channelFilter, jobIdParam]);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  async function saveDecision(draft: OutreachDraftRecord, status?: OutreachDraftRecord['status']) {
    const currentEdit = edits[draft.id];
    setBusyId(draft.id);
    setError('');
    setNotice('');
    try {
      await discoveryApi.updateDraft(draft.id, {
        subject: currentEdit ? currentEdit.subject || null : draft.subject,
        body: currentEdit ? currentEdit.body : draft.body,
        recipientLabel: currentEdit ? currentEdit.recipientLabel : draft.recipientLabel,
        recipientTarget: currentEdit ? currentEdit.recipientTarget || null : draft.recipientTarget,
        ...(status ? { status } : {}),
      });
      setNotice(
        status === 'approved' ? `Approved draft for ${draft.companyName}. You can now send it or copy & open the recipient profile.` :
        status === 'rejected' ? `Rejected draft for ${draft.companyName}.` :
        status === 'sent_externally' ? `Marked draft for ${draft.companyName} as sent.` :
        'Saved your edits.',
      );
      await loadDrafts();
      onDataChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to update draft.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleSendEmail(draft: OutreachDraftRecord) {
    const edit = edits[draft.id];
    const targetEmail = (edit?.recipientTarget ?? draft.recipientTarget ?? '').trim();
    if (!looksLikeEmail(targetEmail)) {
      setError('Enter a valid recipient email address in "Recipient email or profile URL" before sending.');
      return;
    }
    setBusyId(draft.id);
    setError('');
    setNotice('');
    try {
      // Save any edits first before sending
      if (edit) {
        await discoveryApi.updateDraft(draft.id, {
          subject: edit.subject || null,
          body: edit.body,
          recipientLabel: edit.recipientLabel,
          recipientTarget: targetEmail,
        });
      }
      const res = await discoveryApi.sendDraftEmail(draft.id, {
        recipientEmail: targetEmail,
        attachPrimaryResume: attachResumeById[draft.id] !== false,
      });
      setNotice(
        `Email sent to ${targetEmail}${res.attachedFilename ? ` with attached resume “${res.attachedFilename}”` : ''}!`,
      );
      await loadDrafts();
      onDataChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to send email.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleFindRealPeople(draft: OutreachDraftRecord) {
    setFindingJobId(draft.jobId);
    setError('');
    setNotice('');
    try {
      const res = await discoveryApi.generateDraftsForJob(draft.jobId);
      setNotice(
        res.newContactsAdded > 0
          ? `Found ${res.newContactsAdded} real contact${res.newContactsAdded === 1 ? '' : 's'} at ${draft.companyName} and created ${res.created} personalized draft${res.created === 1 ? '' : 's'}!`
          : `Checked GitHub & ${res.firecrawlUsed ? 'Firecrawl v2' : 'public sources'} for ${draft.companyName}. Add your Firecrawl API key in Settings for deep LinkedIn people discovery.`,
      );
      await loadDrafts();
      onDataChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'People lookup failed.');
    } finally {
      setFindingJobId(null);
    }
  }

  async function copyDraftText(draft: OutreachDraftRecord, includeSubject = true): Promise<boolean> {
    const edited = edits[draft.id];
    const subject = edited?.subject ?? draft.subject ?? '';
    const body = edited?.body ?? draft.body;
    const text = includeSubject && subject ? `Subject: ${subject}\n\n${body}` : body;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(draft.id);
      window.setTimeout(() => setCopiedId((curr) => (curr === draft.id ? null : curr)), 2200);
      return true;
    } catch {
      setError('Could not access clipboard. Select and copy the text manually.');
      return false;
    }
  }

  function gmailComposeUrl(email: string, subject: string, body: string): string {
    const params = new URLSearchParams({
      view: 'cm',
      fs: '1',
      to: email,
      su: subject,
      body,
    });
    return `https://mail.google.com/mail/?${params.toString()}`;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="cs-alert cs-alert-success">
        <div className="cs-alert-content">
          <ShieldCheck size={16} />
          <span>
            <strong>Human-in-the-loop gate:</strong> Nothing is ever sent without your approval. Approve a draft first to unlock
            one-click SMTP email sending (with your primary resume PDF) or copy-and-open direct person profiles.
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="cs-card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'pending_review', label: 'Pending Review' },
            { id: 'approved', label: 'Approved' },
            { id: 'sent_externally', label: 'Sent' },
            { id: 'rejected', label: 'Rejected' },
            { id: 'all', label: 'All' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`cs-btn cs-btn-sm${(jobIdParam ? 'all' : statusFilter) === tab.id ? ' cs-btn-primary' : ''}`}
              onClick={() => setStatusFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <select className="cs-select" style={{ width: 200 }} value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}>
          <option value="all">All channels</option>
          <option value="email">Direct Email</option>
          <option value="referral_request">Referral Request</option>
          <option value="linkedin_dm">LinkedIn DM</option>
          <option value="cover_letter">Application Pitch</option>
        </select>
      </div>

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

      {loading ? (
        <div className="cs-card cs-empty-panel">
          <LoaderCircle size={20} className="cs-spin" style={{ color: 'var(--accent-text)' }} />
          <p>Loading outreach proposals…</p>
        </div>
      ) : drafts.length === 0 ? (
        <div className="cs-card cs-empty-panel">
          <div className="cs-empty-icon"><Mail size={20} /></div>
          <h3>No drafts in this view</h3>
          <p>Run job discovery or import a role in Discover Jobs to generate grounded referral and hiring-manager proposals.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {drafts.map((draft) => {
            const edit = edits[draft.id] ?? {
              subject: draft.subject ?? '',
              body: draft.body,
              recipientLabel: draft.recipientLabel,
              recipientTarget: draft.recipientTarget ?? '',
            };
            const targetValue = edit.recipientTarget.trim();
            const isEmailTarget = looksLikeEmail(targetValue);
            const isRealPersonUrl = looksLikePersonProfile(targetValue);
            const attachResume = attachResumeById[draft.id] !== false;

            return (
              <article className="cs-card" key={draft.id}>
                <div className="cs-card-header" style={{ flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span className="cs-badge cs-badge-accent">{CHANNEL_LABELS[draft.channel]}</span>
                      <span className={draft.status === 'approved' ? 'cs-badge cs-badge-accent' : draft.status === 'rejected' ? 'cs-badge cs-badge-danger' : draft.status === 'sent_externally' ? 'cs-badge cs-badge-info' : 'cs-badge cs-badge-warning'}>
                        {draft.status.replaceAll('_', ' ')}
                      </span>
                      {isEmailTarget && <span className="cs-badge cs-badge-accent">Verified Email</span>}
                      {isRealPersonUrl && <span className="cs-badge cs-badge-info"><UserCheck size={11} />Direct Person Profile</span>}
                      <strong>{draft.companyName} · {draft.roleTitle}</strong>
                    </div>
                    <p style={{ marginTop: 4 }}>{draft.recipientLabel}</p>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {isEmailTarget ? (
                      <a
                        className="cs-btn cs-btn-sm cs-btn-accent-soft"
                        href={gmailComposeUrl(targetValue, edit.subject, edit.body)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Mail size={13} />Open in Gmail
                      </a>
                    ) : isRealPersonUrl ? (
                      <button
                        type="button"
                        className="cs-btn cs-btn-sm cs-btn-accent-soft"
                        onClick={async () => {
                          await copyDraftText(draft, false);
                          window.open(targetValue, '_blank', 'noopener,noreferrer');
                        }}
                      >
                        <ExternalLink size={13} />Copy & open person's profile
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="cs-btn cs-btn-sm cs-btn-accent-soft"
                          disabled={findingJobId === draft.jobId}
                          onClick={() => void handleFindRealPeople(draft)}
                        >
                          {findingJobId === draft.jobId ? <LoaderCircle size={13} className="cs-spin" /> : <Sparkles size={13} />}
                          Find real people
                        </button>
                        {(draft.jobApplyUrl || draft.jobSourceUrl) && (
                          <button
                            type="button"
                            className="cs-btn cs-btn-sm"
                            onClick={async () => {
                              await copyDraftText(draft, false);
                              window.open(draft.jobApplyUrl || draft.jobSourceUrl!, '_blank', 'noopener,noreferrer');
                            }}
                          >
                            <ExternalLink size={13} />Copy pitch & open job posting
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="cs-card-body" style={{ display: 'grid', gap: 12 }}>
                  <div className="cs-form-grid">
                    <label className="cs-field">
                      <span className="cs-label">Recipient name / role</span>
                      <input
                        className="cs-input"
                        value={edit.recipientLabel}
                        onChange={(e) => setEdits({ ...edits, [draft.id]: { ...edit, recipientLabel: e.target.value } })}
                      />
                    </label>
                    <label className="cs-field">
                      <span className="cs-label">Recipient email or direct profile URL</span>
                      <input
                        className="cs-input cs-mono"
                        value={edit.recipientTarget}
                        onChange={(e) => setEdits({ ...edits, [draft.id]: { ...edit, recipientTarget: e.target.value } })}
                        placeholder="recruiter@company.com or https://linkedin.com/in/..."
                      />
                    </label>
                    <label className="cs-field cs-field-wide">
                      <span className="cs-label">Subject</span>
                      <input
                        className="cs-input"
                        value={edit.subject}
                        onChange={(e) => setEdits({ ...edits, [draft.id]: { ...edit, subject: e.target.value } })}
                        placeholder="Email subject line"
                      />
                    </label>
                  </div>

                  <label className="cs-field">
                    <span className="cs-label">Proposal body (edit freely before approving)</span>
                    <textarea
                      className="cs-textarea"
                      rows={6}
                      value={edit.body}
                      onChange={(e) => setEdits({ ...edits, [draft.id]: { ...edit, body: e.target.value } })}
                    />
                  </label>

                  {draft.groundingFacts.length > 0 && (
                    <div className="cs-fact-evidence">
                      <strong>Grounded in your verified profile:</strong> {draft.groundingFacts.join(' · ')}
                    </div>
                  )}

                  {draft.status === 'approved' && isEmailTarget && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--accent-border)', background: 'var(--accent-soft)' }}>
                      <label className="cs-checkbox" style={{ color: 'var(--text-primary)' }}>
                        <input
                          type="checkbox"
                          checked={attachResume}
                          onChange={(e) => setAttachResumeById({ ...attachResumeById, [draft.id]: e.target.checked })}
                        />
                        <span>Attach primary resume PDF from Resume Studio</span>
                      </label>
                      {smtpConfigured ? (
                        <button
                          type="button"
                          className="cs-btn cs-btn-sm cs-btn-primary"
                          disabled={busyId === draft.id}
                          onClick={() => void handleSendEmail(draft)}
                        >
                          {busyId === draft.id ? <LoaderCircle size={13} className="cs-spin" /> : <Send size={13} />}
                          Send email now via SMTP
                        </button>
                      ) : (
                        <button type="button" className="cs-btn cs-btn-sm" onClick={() => navigate('/settings')}>
                          Configure Gmail / SMTP in Settings to send directly
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <footer className="cs-card-footer" style={{ flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="cs-btn cs-btn-sm" onClick={() => void copyDraftText(draft, true)}>
                      {copiedId === draft.id ? <Check size={13} /> : <Copy size={13} />}
                      {copiedId === draft.id ? 'Copied!' : 'Copy draft'}
                    </button>
                    <button type="button" className="cs-btn cs-btn-sm" disabled={busyId === draft.id} onClick={() => void saveDecision(draft)}>
                      Save edits
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {draft.status !== 'rejected' && (
                      <button type="button" className="cs-btn cs-btn-sm cs-btn-danger" disabled={busyId === draft.id} onClick={() => void saveDecision(draft, 'rejected')}>
                        <XCircle size={14} />Reject
                      </button>
                    )}
                    {draft.status !== 'approved' && draft.status !== 'sent_externally' && (
                      <button type="button" className="cs-btn cs-btn-sm cs-btn-primary" disabled={busyId === draft.id} onClick={() => void saveDecision(draft, 'approved')}>
                        <Check size={14} />Accept & approve
                      </button>
                    )}
                    {draft.status === 'approved' && (
                      <button type="button" className="cs-btn cs-btn-sm" disabled={busyId === draft.id} onClick={() => void saveDecision(draft, 'sent_externally')}>
                        <Check size={13} />Mark as sent manually
                      </button>
                    )}
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
