import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  Check,
  Download,
  FileText,
  LoaderCircle,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { resumeApi, type ResumeRecord } from './resumeApi';
import ResumeFactReview from './ResumeFactReview';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function statusBadge(resume: ResumeRecord): { label: string; className: string } {
  if (resume.processingStatus === 'needs_review') return { label: 'Text ready · Review facts', className: 'cs-badge cs-badge-accent' };
  if (resume.processingStatus === 'failed') return { label: 'No selectable text', className: 'cs-badge cs-badge-danger' };
  if (resume.processingStatus === 'verified') return { label: 'Verified', className: 'cs-badge cs-badge-accent' };
  return { label: resume.processingStatus.replaceAll('_', ' '), className: 'cs-badge' };
}

export default function ResumeManager({ onResumesChanged }: { onResumesChanged?: () => void } = {}) {
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{ id: string; filename: string; text: string } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  async function refreshResumes() {
    const result = await resumeApi.list();
    setResumes(result.resumes);
    onResumesChanged?.();
  }

  useEffect(() => {
    let active = true;
    resumeApi.list()
      .then((result) => { if (active) setResumes(result.resumes); })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load your resumes.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function validateAndStageFile(file: File | null) {
    setError('');
    setNotice('');
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'pdf' && extension !== 'docx') {
      setSelectedFile(null);
      if (fileInput.current) fileInput.current.value = '';
      setError('Only PDF and DOCX resume files are supported.');
      return;
    }
    if (file.size === 0) {
      setSelectedFile(null);
      if (fileInput.current) fileInput.current.value = '';
      setError('The selected file is empty.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setSelectedFile(null);
      if (fileInput.current) fileInput.current.value = '';
      setError('File exceeds the 10 MiB local upload limit.');
      return;
    }
    setSelectedFile(file);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    validateAndStageFile(event.target.files?.[0] ?? null);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    validateAndStageFile(event.dataTransfer.files?.[0] ?? null);
  }

  async function handleUpload() {
    if (!selectedFile || uploading) return;
    setUploading(true);
    setError('');
    setNotice('');
    try {
      await resumeApi.upload(selectedFile);
      setSelectedFile(null);
      if (fileInput.current) fileInput.current.value = '';
      await refreshResumes();
      setNotice('Resume uploaded and stored privately on this device. Click "Extract & review facts" to populate your profile.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Resume upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function handleSetPrimary(resume: ResumeRecord) {
    setBusyId(resume.id);
    setError('');
    setNotice('');
    try {
      await resumeApi.setPrimary(resume.id);
      await refreshResumes();
      setNotice(`${resume.originalFilename} is now your primary resume.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the primary resume.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(resume: ResumeRecord) {
    const confirmed = window.confirm(`Delete “${resume.originalFilename}” and its locally stored extracted text?`);
    if (!confirmed) return;
    setBusyId(resume.id);
    setError('');
    setNotice('');
    try {
      await resumeApi.remove(resume.id);
      await refreshResumes();
      setNotice('Resume and its local files were deleted.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete the resume.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleExtractFacts(resume: ResumeRecord) {
    if (extractingId) return;
    setExtractingId(resume.id);
    setError('');
    setNotice('');
    try {
      const text = await resumeApi.readText(resume.id, true);
      setReviewTarget({ id: resume.id, filename: resume.originalFilename, text });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read extracted text for fact review.');
    } finally {
      setExtractingId(null);
    }
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 18 }} aria-label="Resume management">
      <div
        className={`cs-dropzone${dragging ? ' dragging' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <div className="cs-dropzone-copy">
          <div className="cs-entry-icon"><Upload size={18} /></div>
          <div>
            <strong style={{ display: 'block', fontSize: 14 }}>Drop a PDF or DOCX resume here</strong>
            <span className="cs-hint">Up to 10 MiB · Stored locally with owner-only permissions (0600)</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label className="cs-btn" htmlFor="career-scout-resume-file">Choose file</label>
          <input
            ref={fileInput}
            id="career-scout-resume-file"
            className="cs-file-input"
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFileChange}
          />
          <button
            type="button"
            className="cs-btn cs-btn-primary"
            onClick={() => void handleUpload()}
            disabled={!selectedFile || uploading}
          >
            {uploading ? <LoaderCircle size={15} className="cs-spin" /> : <Upload size={15} />}
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>

        {selectedFile && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-surface)',
              fontSize: 13,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <FileText size={15} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedFile.name}</span>
              <span className="cs-hint cs-tabular">{formatBytes(selectedFile.size)}</span>
            </div>
            <button
              type="button"
              className="cs-btn cs-btn-icon cs-btn-ghost"
              onClick={() => { setSelectedFile(null); if (fileInput.current) fileInput.current.value = ''; }}
              aria-label="Clear selected file"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="cs-alert cs-alert-error" role="alert">
          <span>{error}</span>
          <button type="button" className="cs-alert-close" onClick={() => setError('')} aria-label="Dismiss error"><X size={15} /></button>
        </div>
      )}

      {notice && (
        <div className="cs-alert cs-alert-success" role="status">
          <div className="cs-alert-content"><Check size={15} /><span>{notice}</span></div>
          <button type="button" className="cs-alert-close" onClick={() => setNotice('')} aria-label="Dismiss message"><X size={15} /></button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 650 }}>Stored resumes</h3>
          <span className="cs-hint cs-tabular">{resumes.length} {resumes.length === 1 ? 'document' : 'documents'} saved locally</span>
        </div>
        {loading && <LoaderCircle size={16} className="cs-spin" style={{ color: 'var(--text-muted)' }} />}
      </div>

      {!loading && resumes.length === 0 ? (
        <div className="cs-card cs-empty-panel">
          <div className="cs-empty-icon"><FileText size={20} /></div>
          <h3>No resumes uploaded yet</h3>
          <p>Upload a PDF or DOCX resume above to extract structured facts for your profile and prepare tailored applications.</p>
        </div>
      ) : (
        <div className="cs-resume-list">
          {resumes.map((resume) => {
            const badge = statusBadge(resume);
            return (
              <article className="cs-card cs-resume-card" key={resume.id}>
                <div className="cs-resume-meta">
                  <div className="cs-entry-icon"><FileText size={18} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div className="cs-resume-title-row">
                      <strong title={resume.originalFilename}>{resume.originalFilename}</strong>
                      {resume.isPrimary && (
                        <span className="cs-badge cs-badge-accent"><Star size={11} fill="currentColor" />Primary</span>
                      )}
                      <span className={badge.className}>{badge.label}</span>
                    </div>
                    <div className="cs-hint cs-tabular" style={{ marginTop: 4 }}>
                      {formatBytes(resume.fileSizeBytes)} · Uploaded {formatDate(resume.uploadedAt)}
                    </div>
                    {resume.processingError && (
                      <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--danger-text)' }}>
                        {resume.processingError}
                      </div>
                    )}
                  </div>
                </div>

                <div className="cs-resume-actions">
                  {resume.hasExtractedText && (
                    <button
                      type="button"
                      className="cs-btn cs-btn-sm cs-btn-accent-soft"
                      onClick={() => void handleExtractFacts(resume)}
                      disabled={extractingId === resume.id}
                    >
                      {extractingId === resume.id ? <LoaderCircle size={14} className="cs-spin" /> : <Sparkles size={14} />}
                      {extractingId === resume.id ? 'Extracting…' : 'Extract & review facts'}
                    </button>
                  )}
                  <a className="cs-btn cs-btn-sm" href={resumeApi.downloadUrl(resume.id)} download>
                    <Download size={14} />Download
                  </a>
                  {!resume.isPrimary && (
                    <button
                      type="button"
                      className="cs-btn cs-btn-sm"
                      onClick={() => void handleSetPrimary(resume)}
                      disabled={busyId === resume.id}
                    >
                      <Star size={14} />Set primary
                    </button>
                  )}
                  <button
                    type="button"
                    className="cs-btn cs-btn-sm cs-btn-danger"
                    onClick={() => void handleDelete(resume)}
                    disabled={busyId === resume.id}
                  >
                    {busyId === resume.id ? <LoaderCircle size={14} className="cs-spin" /> : <Trash2 size={14} />}
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {reviewTarget && (
        <ResumeFactReview
          key={reviewTarget.id}
          resumeId={reviewTarget.id}
          filename={reviewTarget.filename}
          text={reviewTarget.text}
          onClose={() => setReviewTarget(null)}
          onApplied={(message) => {
            setReviewTarget(null);
            setNotice(message);
            onResumesChanged?.();
          }}
        />
      )}
    </section>
  );
}
