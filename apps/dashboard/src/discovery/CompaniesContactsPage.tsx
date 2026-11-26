import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Building2,
  Check,
  ExternalLink,
  LoaderCircle,
  Mail,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react';
import { discoveryApi, type CompanyRecord, type ContactRecord } from './discoveryApi';

export default function CompaniesContactsPage({ view }: { view: 'companies' | 'contacts' }) {
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [confidence, setConfidence] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [form, setForm] = useState({
    companyName: '',
    fullName: '',
    roleTitle: '',
    contactType: 'recruiter',
    email: '',
    profileUrl: '',
    sourceNote: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (view === 'companies') {
        const res = await discoveryApi.listCompanies();
        setCompanies(res.companies);
      } else {
        const res = await discoveryApi.listContacts({ search, confidence });
        setContacts(res.contacts);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load directory.');
    } finally {
      setLoading(false);
    }
  }, [view, search, confidence]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAddContact(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await discoveryApi.createContact({
        ...form,
        sourceUrl: form.profileUrl || (form.email ? `mailto:${form.email}` : ''),
      });
      setShowAdd(false);
      setForm({ companyName: '', fullName: '', roleTitle: '', contactType: 'recruiter', email: '', profileUrl: '', sourceNote: '' });
      setNotice('Verified contact added.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save contact.');
    } finally {
      setSaving(false);
    }
  }

  if (view === 'companies') {
    const visible = companies.filter((c) => !search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase()));
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="cs-card cs-filter-bar" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
          <div className="cs-filter-search">
            <Search size={15} style={{ color: 'var(--text-muted)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search discovered companies…" />
          </div>
        </div>

        {loading ? (
          <div className="cs-card cs-empty-panel"><LoaderCircle size={20} className="cs-spin" style={{ color: 'var(--accent-text)' }} /></div>
        ) : visible.length === 0 ? (
          <div className="cs-card cs-empty-panel">
            <div className="cs-empty-icon"><Building2 size={20} /></div>
            <h3>No companies tracked yet</h3>
            <p>Companies appear automatically as soon as CareerScout discovers matching roles.</p>
          </div>
        ) : (
          <div className="cs-job-list">
            {visible.map((company) => (
              <article className="cs-card cs-job-row" key={company.id} style={{ cursor: 'default' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 15 }}>{company.name}</strong>
                    <span className="cs-badge">{company.atsProvider}</span>
                    <span className="cs-badge cs-badge-accent cs-tabular">{company.jobCount} matched job{company.jobCount === 1 ? '' : 's'}</span>
                    <span className="cs-badge cs-tabular">{company.contactCount} contact{company.contactCount === 1 ? '' : 's'}</span>
                  </div>
                  {company.headquarters && <span className="cs-hint" style={{ display: 'block', marginTop: 4 }}>{company.headquarters}</span>}
                </div>
                <div className="cs-job-row-actions">
                  {company.careersUrl && (
                    <a className="cs-btn cs-btn-sm" href={company.careersUrl} target="_blank" rel="noreferrer">
                      <ExternalLink size={13} />Careers
                    </a>
                  )}
                  {company.websiteUrl && (
                    <a className="cs-btn cs-btn-sm" href={company.websiteUrl} target="_blank" rel="noreferrer">
                      <ExternalLink size={13} />Website
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="cs-card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, flex: 1, minWidth: 260 }}>
          <div className="cs-filter-search" style={{ flex: 1 }}>
            <Search size={15} style={{ color: 'var(--text-muted)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people, companies, or emails…" />
          </div>
          <select className="cs-select" style={{ width: 170 }} value={confidence} onChange={(e) => setConfidence(e.target.value)}>
            <option value="all">All confidence</option>
            <option value="verified">Verified</option>
            <option value="likely">Likely (GitHub/HN)</option>
            <option value="search_lead">LinkedIn Leads</option>
          </select>
        </div>
        <button type="button" className="cs-btn cs-btn-primary" onClick={() => setShowAdd((v) => !v)}>
          <Plus size={15} />Add verified contact
        </button>
      </div>

      {error && <div className="cs-alert cs-alert-error">{error}</div>}
      {notice && <div className="cs-alert cs-alert-success"><div className="cs-alert-content"><Check size={15} /><span>{notice}</span></div></div>}

      {showAdd && (
        <form className="cs-card" onSubmit={(e) => void handleAddContact(e)}>
          <div className="cs-card-header">
            <div><h2>Add hiring manager, recruiter, or referrer</h2></div>
            <button type="button" className="cs-btn cs-btn-icon cs-btn-ghost" onClick={() => setShowAdd(false)}><X size={16} /></button>
          </div>
          <div className="cs-card-body">
            <div className="cs-form-grid">
              <label className="cs-field"><span className="cs-label">Person name *</span><input className="cs-input" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></label>
              <label className="cs-field"><span className="cs-label">Company *</span><input className="cs-input" required value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></label>
              <label className="cs-field"><span className="cs-label">Role / Title</span><input className="cs-input" value={form.roleTitle} onChange={(e) => setForm({ ...form, roleTitle: e.target.value })} placeholder="e.g. Engineering Manager" /></label>
              <label className="cs-field">
                <span className="cs-label">Contact type</span>
                <select className="cs-select" value={form.contactType} onChange={(e) => setForm({ ...form, contactType: e.target.value })}>
                  <option value="recruiter">Recruiter</option>
                  <option value="hiring_manager">Hiring Manager</option>
                  <option value="engineer_referral">Engineer / Referrer</option>
                  <option value="founder">Founder</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="cs-field"><span className="cs-label">Public email (optional)</span><input className="cs-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <label className="cs-field"><span className="cs-label">LinkedIn / GitHub / Source URL *</span><input className="cs-input" type="url" required value={form.profileUrl} onChange={(e) => setForm({ ...form, profileUrl: e.target.value })} /></label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button type="button" className="cs-btn" onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="submit" className="cs-btn cs-btn-primary" disabled={saving}>Save contact</button>
            </div>
          </div>
        </form>
      )}

      {loading ? (
        <div className="cs-card cs-empty-panel"><LoaderCircle size={20} className="cs-spin" style={{ color: 'var(--accent-text)' }} /></div>
      ) : contacts.length === 0 ? (
        <div className="cs-card cs-empty-panel">
          <div className="cs-empty-icon"><Users size={20} /></div>
          <h3>No people or referral leads yet</h3>
          <p>Run job discovery to automatically extract public hiring emails, GitHub org engineers, and targeted LinkedIn referral leads for every matched company.</p>
        </div>
      ) : (
        <div className="cs-job-list">
          {contacts.map((contact) => (
            <article className="cs-card cs-job-row" key={contact.id} style={{ cursor: 'default' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 14.5 }}>{contact.fullName}</strong>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>· {contact.companyName}</span>
                  <span className={contact.confidence === 'verified' ? 'cs-badge cs-badge-accent' : contact.confidence === 'likely' ? 'cs-badge cs-badge-info' : 'cs-badge'}>
                    {contact.confidence.replace('_', ' ')}
                  </span>
                  <span className="cs-badge">{contact.contactType.replace('_', ' ')}</span>
                </div>
                {contact.roleTitle && <div className="cs-hint" style={{ marginTop: 4 }}>{contact.roleTitle}</div>}
                {contact.sourceNote && <div className="cs-hint" style={{ marginTop: 4 }}>{contact.sourceNote}</div>}
              </div>
              <div className="cs-job-row-actions">
                {contact.email && (
                  <a className="cs-btn cs-btn-sm cs-btn-accent-soft" href={`mailto:${contact.email}`}>
                    <Mail size={13} />{contact.email}
                  </a>
                )}
                {contact.profileUrl && (
                  <a className="cs-btn cs-btn-sm" href={contact.profileUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={13} />{contact.platform === 'linkedin' ? 'Open LinkedIn' : 'Open profile'}
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
