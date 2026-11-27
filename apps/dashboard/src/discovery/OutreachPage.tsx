import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  FileCheck2,
  LoaderCircle,
  Mail,
  RotateCcw,
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

type ReviewedTab = 'approved' | 'sent_externally' | 'rejected';

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(value.trim());
}

function looksLikePersonProfile(value: string): boolean {
  return /linkedin\.com\/in\/|github\.com\/[^/?#]+\/?$|x\.com\/[^/?#]+\/?$/iu.test(value.trim());
}

function parseReviewedTab(raw: string | null): ReviewedTab {
  if (raw === 'sent' || raw === 'sent_externally') return 'sent_externally';
  if (raw === 'rejected') return 'rejected';
  return 'approved';
}

export default function OutreachPage({
  mode = 'inbox',
  onDataChanged,
}: {
  mode?: 'inbox' | 'reviewed';
  onDataChanged?: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const jobIdParam = params.get('jobId') || '';
  const tabParam = params.get('tab');

  const isInbox = mode === 'inbox';
  const [reviewedTab, setReviewedTab] = useState<ReviewedTab>(() => parseReviewedTab(tabParam));
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [drafts, setDrafts] = useState<OutreachDraftRecord[]>([]);
  const [counts, setCounts] = useState({ approved: 0, sent: 0, rejected: 0 });
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, { subject: string; body: string; recipientLabel: string; recipientTarget: string }>>({});
  const [attachResumeById, setAttachResumeById] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [findingJobId, setFindingJobId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ text: string; actionLabel?: string; actionPath?: string } | null>(null);

  useEffect(() => {
    if (!isInbox && tabParam) {
      setReviewedTab(parseReviewedTab(tabParam));
    }
  }, [isInbox, tabParam]);

  const activeStatus = isInbox ? 'pending_review' : reviewedTab;

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const [res, summary] = await Promise.all([
        discoveryApi.listDrafts({
          status: activeStatus,
          channel: channelFilter,
          jobId: jobIdParam || undefined,
        }),
        discoveryApi.summary(),
      ]);
      setDrafts(res.drafts);
      setSmtpConfigured(Boolean(summary.providers.smtpConfigured));
      setCounts({
        approved: summary.counts.approvedReady ?? 0,
        sent: summary.counts.sentDrafts ?? 0,
        rejected: summary.counts.rejectedDrafts ?? 0,
      });
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
  }, [activeStatus, channelFilter, jobIdParam]);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  async function saveDecision(draft: OutreachDraftRecord, status?: OutreachDraftRecord['status']) {
    const currentEdit = edits[draft.id];
    setBusyId(draft.id);
    setError('');
    setNotice(null);
    try {
      await discoveryApi.updateDraft(draft.id, {
        subject: currentEdit ? currentEdit.subject || null : draft.subject,
        body: currentEdit ? currentEdit.body : draft.body,
        recipientLabel: currentEdit ? currentEdit.recipientLabel : draft.recipientLabel,
        recipientTarget: currentEdit ? currentEdit.recipientTarget || null : draft.recipientTarget,
        ...(status ? { status } : {}),
      });

      if (status === 'approved') {
        setNotice({
          text: `Approved draft for ${draft.companyName} and moved it to Reviewed drafts.`,
          actionLabel: 'View Approved',
          actionPath: '/reviewed?tab=approved',
        });
      } else if (status === 'rejected') {
        setNotice({
          text: `Rejected draft for ${draft.companyName} and moved it to Reviewed drafts.`,
          actionLabel: 'View Rejected',
          actionPath: '/reviewed?tab=rejected',
        });
      } else if (status === 'sent_externally') {
        setNotice({
          text: `Marked draft for ${draft.companyName} as sent.`,
          actionLabel: 'View Sent',
          actionPath: '/reviewed?tab=sent',
        });
      } else if (status === 'pending_review') {
        setNotice({
          text: `Restored draft for ${draft.companyName} back to Outreach drafts.`,
          actionLabel: 'Open Outreach drafts',
          actionPath: '/outreach',
        });
      } else {
        setNotice({ text: 'Saved your edits.' });
      }

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
      setError('Enter a valid recipient email address in "Recipient email or direct profile URL" before sending.');
      return;
    }
    setBusyId(draft.id);
    setError('');
    setNotice(null);
    try {
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
      setNotice({
        text: `Email sent to ${targetEmail}${res.attachedFilename ? ` with attached resume “${res.attachedFilename}”` : ''}!`,
        actionLabel: 'View Sent',
        actionPath: '/reviewed?tab=sent',
      });
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
    setNotice(null);
    try {
      const res = await discoveryApi.generateDraftsForJob(draft.jobId);
      const d = res.diagnostics;
      if (d?.firecrawlError) {
        setError(`Firecrawl lookup warning for ${draft.companyName}: ${d.firecrawlError}`);
      } else if (res.newContactsAdded > 0) {
        setNotice({
          text: `Found ${res.newContactsAdded} verified current contact${res.newContactsAdded === 1 ? '' : 's'} at ${draft.companyName} and created ${res.created} personalized draft${res.created === 1 ? '' : 's'}!`,
        });
      } else {
        const summaryParts = d
          ? [
              `domain: ${d.resolvedDomain || 'not found'}`,
              `LinkedIn hits: ${d.linkedinHitsReturned}`,
              d.linkedinRejected > 0 ? `rejected ex-employee/wrong-company: ${d.linkedinRejected}` : null,
              `site emails: ${d.siteEmailsFound}`,
              `GitHub members: ${d.githubMembersFound}`,
            ].filter(Boolean).join(' · ')
          : 'no matches';
        setNotice({
          text: `No new verified current employee found for ${draft.companyName} (${summaryParts}). Paste a real recruiter/founder email or LinkedIn URL below if you find one manually.`,
        });
      }
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
    const paramsObj = new URLSearchParams({ view: 'cm', fs: '1', to: email, su: subject, body });
    return `https://mail.google.com/mail/?${paramsObj.toString()}`;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="cs-alert cs-alert-success">
        <div className="cs-alert-content">
          <ShieldCheck size={16} />
          <span>
            {isInbox ? (
              <>
                <strong>Pending review inbox:</strong> Only unreviewed drafts stay here. Approved and rejected drafts move
                automatically to <strong>Reviewed drafts</strong>.
              </>
            ) : (
              <>
                <strong>Reviewed archive:</strong> Manage approved drafts ready to send, track sent messages, or restore
                rejected proposals back to Outreach drafts.
              </>
            )}
          </span>
        </div>
        {isInbox ? (
          <button type="button" className="cs-btn cs-btn-sm" onClick={() => navigate('/reviewed')}>
            Reviewed drafts<ArrowRight size={13} />
          </button>
        ) : (
          <button type="button" className="cs-btn cs-btn-sm" onClick={() => navigate('/outreach')}>
            Pending inbox<ArrowRight size={13} />
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="cs-card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div className="cs-action-wrap">
          {isInbox ? (
            <>
              <span className="cs-badge cs-badge-warning cs-tabular">Pending review: {drafts.length}</span>
              {jobIdParam && (
                <>
                  <span className="cs-badge cs-badge-info">Filtered to selected job</span>
                  <button type="button" className="cs-btn cs-btn-sm" onClick={() => navigate('/outreach')}>
                    Show all pending
                  </button>
                  <button type="button" className="cs-btn cs-btn-sm" onClick={() => navigate(`/reviewed?jobId=${encodeURIComponent(jobIdParam)}`)}>
                    View reviewed for this job
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              {[
                { id: 'approved' as const, label: `Approved (${counts.approved})` },
                { id: 'sent_externally' as const, label: `Sent (${counts.sent})` },
                { id: 'rejected' as const, label: `Rejected (${counts.rejected})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`cs-btn cs-btn-sm${reviewedTab === tab.id ? ' cs-btn-primary' : ''}`}
                  onClick={() => {
                    setReviewedTab(tab.id);
                    const nextParams = new URLSearchParams(location.search);
                    nextParams.set('tab', tab.id === 'sent_externally' ? 'sent' : tab.id);
                    navigate(`/reviewed?${nextParams.toString()}`, { replace: true });
                  }}
                >
                  {tab.label}
                </button>
              ))}
              {jobIdParam && (
                <button type="button" className="cs-btn cs-btn-sm" onClick={() => navigate('/reviewed')}>
                  Clear job filter
                </button>
              )}
            </>
          )}
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
          <div className="cs-alert-content"><Check size={15} /><span>{notice.text}</span></div>
          <div className="cs-action-wrap">
            {notice.actionLabel && notice.actionPath && (
              <button type="button" className="cs-btn cs-btn-sm" onClick={() => navigate(notice.actionPath!)}>
                {notice.actionLabel}<ArrowRight size={13} />
              </button>
            )}
            <button type="button" className="cs-alert-close" onClick={() => setNotice(null)}><X size={15} /></button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="cs-card cs-empty-panel">
          <LoaderCircle size={20} className="cs-spin" style={{ color: 'var(--accent-text)' }} />
          <p>Loading {isInbox ? 'pending outreach drafts' : 'reviewed drafts'}…</p>
        </div>
      ) : drafts.length === 0 ? (
        <div className="cs-card cs-empty-panel">
          <div className="cs-empty-icon">{isInbox ? <Mail size={20} /> : <FileCheck2 size={20} />}</div>
          <h3>
            {isInbox
              ? 'All caught up — no pending drafts'
              : reviewedTab === 'approved'
                ? 'No approved drafts waiting to send'
                : reviewedTab === 'sent_externally'
                  ? 'No sent outreach recorded yet'
                  : 'No rejected drafts'}
          </h3>
          <p>
            {isInbox
              ? 'Every reviewed draft has moved to Reviewed drafts. Run job discovery to queue new proposals.'
              : 'Approve or reject drafts in Outreach drafts to organize them here.'}
          </p>
          <div className="cs-action-wrap">
            {isInbox && jobIdParam && (
              <button type="button" className="cs-btn cs-btn-primary" onClick={() => navigate(`/reviewed?jobId=${encodeURIComponent(jobIdParam)}`)}>
                View reviewed drafts for this job<ArrowRight size={14} />
              </button>
            )}
            {isInbox && !jobIdParam && (
              <button type="button" className="cs-btn" onClick={() => navigate('/reviewed')}>
                Open Reviewed drafts<ArrowRight size={14} />
              </button>
            )}
            {!isInbox && (
              <button type="button" className="cs-btn cs-btn-primary" onClick={() => navigate('/outreach')}>
                Review pending drafts<ArrowRight size={14} />
              </button>
            )}
          </div>
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

                  <div className="cs-action-wrap">
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
                        {isInbox && (
                          <button
                            type="button"
                            className="cs-btn cs-btn-sm cs-btn-accent-soft"
                            disabled={findingJobId === draft.jobId}
                            onClick={() => void handleFindRealPeople(draft)}
                          >
                            {findingJobId === draft.jobId ? <LoaderCircle size={13} className="cs-spin" /> : <Sparkles size={13} />}
                            Find real people
                          </button>
                        )}
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
                        placeholder="No verified person yet — paste recruiter@company.com or https://linkedin.com/in/..."
                      />
                      {targetValue && !isEmailTarget && !isRealPersonUrl && (
                        <span className="cs-hint" style={{ color: 'var(--warning)' }}>
                          This is a job posting link, not a person's email or LinkedIn profile. Click "Find real people" or replace it with a real person's email/LinkedIn URL.
                        </span>
                      )}
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
                    <span className="cs-label">Proposal body</span>
                    <textarea
                      className="cs-textarea"
                      rows={6}
                      value={edit.body}
                      onChange={(e) => setEdits({ ...edits, [draft.id]: { ...edit, body: e.target.value } })}
                    />
                  </label>

                  {draft.contactProof && (
                    <div className="cs-fact-evidence" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <span>
                        <strong>Contact source ({draft.contactProof.confidence} · {draft.contactProof.platform}):</strong>{' '}
                        {draft.contactProof.sourceNote || 'Discovered from public source.'}
                      </span>
                      <a className="cs-badge" href={draft.contactProof.sourceUrl} target="_blank" rel="noreferrer">
                        <ExternalLink size={10} />Inspect source
                      </a>
                    </div>
                  )}

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
                  <div className="cs-action-wrap">
                    <button type="button" className="cs-btn cs-btn-sm" onClick={() => void copyDraftText(draft, true)}>
                      {copiedId === draft.id ? <Check size={13} /> : <Copy size={13} />}
                      {copiedId === draft.id ? 'Copied!' : 'Copy draft'}
                    </button>
                    <button type="button" className="cs-btn cs-btn-sm" disabled={busyId === draft.id} onClick={() => void saveDecision(draft)}>
                      Save edits
                    </button>
                  </div>

                  <div className="cs-action-wrap">
                    {isInbox ? (
                      <>
                        <button type="button" className="cs-btn cs-btn-sm cs-btn-danger" disabled={busyId === draft.id} onClick={() => void saveDecision(draft, 'rejected')}>
                          <XCircle size={14} />Reject
                        </button>
                        <button type="button" className="cs-btn cs-btn-sm cs-btn-primary" disabled={busyId === draft.id} onClick={() => void saveDecision(draft, 'approved')}>
                          <Check size={14} />Accept & approve
                        </button>
                      </>
                    ) : draft.status === 'approved' ? (
                      <>
                        <button type="button" className="cs-btn cs-btn-sm" disabled={busyId === draft.id} onClick={() => void saveDecision(draft, 'pending_review')}>
                          <RotateCcw size={13} />Move to pending
                        </button>
                        <button type="button" className="cs-btn cs-btn-sm cs-btn-danger" disabled={busyId === draft.id} onClick={() => void saveDecision(draft, 'rejected')}>
                          <XCircle size={14} />Reject
                        </button>
                        <button type="button" className="cs-btn cs-btn-sm cs-btn-primary" disabled={busyId === draft.id} onClick={() => void saveDecision(draft, 'sent_externally')}>
                          <Check size={13} />Mark as sent
                        </button>
                      </>
                    ) : draft.status === 'rejected' ? (
                      <button type="button" className="cs-btn cs-btn-sm" disabled={busyId === draft.id} onClick={() => void saveDecision(draft, 'pending_review')}>
                        <RotateCcw size={13} />Restore to Outreach drafts
                      </button>
                    ) : (
                      <span className="cs-hint">
                        Sent {draft.reviewedAt ? new Date(draft.reviewedAt).toLocaleDateString() : ''}
                      </span>
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
