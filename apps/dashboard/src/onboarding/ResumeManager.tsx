import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Check, Download, Eye, FileText, LoaderCircle, Star, Trash2, Upload, X } from 'lucide-react';
import { resumeApi, type ResumeRecord } from './resumeApi';
import './resume-manager.css';

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

function statusLabel(resume: ResumeRecord): string {
  if (resume.processingStatus === 'needs_review') return 'Text extracted · Review recommended';
  if (resume.processingStatus === 'failed') return 'Text extraction unavailable';
  return resume.processingStatus.replaceAll('_', ' ');
}

export default function ResumeManager() {
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  async function refreshResumes() {
    const result = await resumeApi.list();
    setResumes(result.resumes);
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

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setError('');
    setNotice('');
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'pdf' && extension !== 'docx') {
      setSelectedFile(null);
      event.target.value = '';
      setError('Choose a PDF or DOCX file.');
      return;
    }
    if (file.size === 0) {
      setSelectedFile(null);
      event.target.value = '';
      setError('The selected file is empty.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setSelectedFile(null);
      event.target.value = '';
      setError('The file exceeds the 10 MiB upload limit.');
      return;
    }
    setSelectedFile(file);
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
      setNotice('Resume uploaded. Extracted text is kept separate until you review it.');
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
      if (previewId === resume.id) {
        setPreviewId(null);
        setPreviewText('');
      }
      await refreshResumes();
      setNotice('Resume and its local files were deleted.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete the resume.');
    } finally {
      setBusyId(null);
    }
  }

  async function handlePreview(resume: ResumeRecord) {
    if (previewId === resume.id) {
      setPreviewId(null);
      setPreviewText('');
      return;
    }
    setPreviewLoading(true);
    setError('');
    try {
      const text = await resumeApi.readText(resume.id);
      setPreviewId(resume.id);
      setPreviewText(text);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load extracted text.');
    } finally {
      setPreviewLoading(false);
    }
  }

  return <section className="resume-manager" aria-label="Resume management">
    <div className="resume-manager-upload">
      <div className="resume-manager-upload-copy">
        <div className="resume-manager-upload-icon"><Upload size={20} /></div>
        <div>
          <strong>Upload a resume</strong>
          <p>PDF or DOCX · Maximum 10 MiB · Stored locally on this device</p>
        </div>
      </div>
      <div className="resume-manager-upload-controls">
        <label className="resume-manager-choose" htmlFor="career-scout-resume-file">Choose file</label>
        <input
          ref={fileInput}
          id="career-scout-resume-file"
          className="resume-manager-file-input"
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFileChange}
        />
        <button type="button" className="resume-manager-upload-button" onClick={() => void handleUpload()} disabled={!selectedFile || uploading}>
          {uploading ? <LoaderCircle size={15} className="resume-manager-spin" /> : <Upload size={15} />}
          {uploading ? 'Uploading…' : 'Upload resume'}
        </button>
      </div>
      {selectedFile && <div className="resume-manager-selected-file"><FileText size={14} /><span>{selectedFile.name}</span><small>{formatBytes(selectedFile.size)}</small><button type="button" onClick={() => { setSelectedFile(null); if (fileInput.current) fileInput.current.value = ''; }} aria-label="Remove selected file"><X size={14} /></button></div>}
    </div>

    {error && <div className="resume-manager-message error" role="alert">{error}<button type="button" onClick={() => setError('')} aria-label="Dismiss error"><X size={14} /></button></div>}
    {notice && <div className="resume-manager-message success" role="status"><Check size={14} />{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss message"><X size={14} /></button></div>}

    <div className="resume-manager-list-heading">
      <div><h3>Your resumes</h3><p>{resumes.length} {resumes.length === 1 ? 'file' : 'files'} saved to this device</p></div>
      {loading && <LoaderCircle size={17} className="resume-manager-spin" aria-label="Loading resumes" />}
    </div>

    {!loading && resumes.length === 0 && <div className="resume-manager-empty"><FileText size={22} /><strong>No resumes added yet</strong><span>Choose a PDF or DOCX file above to add your first resume.</span></div>}

    <div className="resume-manager-list">
      {resumes.map((resume) => <article className="resume-manager-item" key={resume.id}>
        <div className="resume-manager-file-icon"><FileText size={19} /></div>
        <div className="resume-manager-file-details">
          <div className="resume-manager-file-title"><strong title={resume.originalFilename}>{resume.originalFilename}</strong>{resume.isPrimary && <span className="resume-manager-primary"><Star size={11} fill="currentColor" />Primary</span>}</div>
          <span>{formatBytes(resume.fileSizeBytes)} · Added {formatDate(resume.uploadedAt)}</span>
          <small className={resume.processingStatus === 'failed' ? 'failed' : resume.processingStatus === 'needs_review' ? 'review' : ''}>{statusLabel(resume)}</small>
          {resume.processingError && <small className="resume-manager-processing-error">{resume.processingError}</small>}
          <div className="resume-manager-actions">
            {resume.hasExtractedText && <button type="button" onClick={() => void handlePreview(resume)} disabled={previewLoading}><Eye size={13} />{previewId === resume.id ? 'Hide text' : 'Review extracted text'}</button>}
            <a href={resumeApi.downloadUrl(resume.id)} download><Download size={13} />Download</a>
            {!resume.isPrimary && <button type="button" onClick={() => void handleSetPrimary(resume)} disabled={busyId === resume.id}><Star size={13} />Set as primary</button>}
            <button type="button" className="danger" onClick={() => void handleDelete(resume)} disabled={busyId === resume.id}><Trash2 size={13} />Delete</button>
          </div>
        </div>
        {busyId === resume.id && <LoaderCircle size={16} className="resume-manager-item-spinner" />}
        {previewId === resume.id && <div className="resume-manager-preview"><div><strong>Extracted text</strong><span>Review this content before using it in your profile.</span></div><pre>{previewText || 'No text was extracted from this document.'}</pre></div>}
      </article>)}
    </div>
  </section>;
}
