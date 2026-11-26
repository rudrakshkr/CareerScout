import { useEffect, useState } from 'react';
import { Check, FileCheck2, LoaderCircle, X } from 'lucide-react';
import { onboardingApi, type OnboardingData } from './onboardingApi';
import {
  extractResumeFacts,
  type ResumeFactCandidate,
  type ResumeFactKind,
  type ResumeSkillCategory,
} from './resume-fact-extractor';

interface ReviewFact extends ResumeFactCandidate {
  selected: boolean;
  currentValue?: string | null;
}

interface Props {
  resumeId: string;
  filename: string;
  text: string;
  onClose: () => void;
  onApplied: (message: string) => void;
}

const profileFieldForKind: Partial<Record<ResumeFactKind, keyof OnboardingData['profile']>> = {
  phone: 'phone',
  currentTitle: 'currentTitle',
  locationCity: 'locationCity',
  locationCountry: 'locationCountry',
  headline: 'headline',
  portfolioUrl: 'portfolioUrl',
  linkedinUrl: 'linkedinUrl',
  githubUrl: 'githubUrl',
};

const URL_KINDS = new Set<ResumeFactKind>(['portfolioUrl', 'linkedinUrl', 'githubUrl']);

function comparable(value: string | null | undefined): string {
  return (value ?? '').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/gu, ' ').replace(/\/+$/u, '').replace(/[.,;:]+$/u, '');
}

function sanitizeText(value: string | null | undefined, maxLen: number): string {
  return (value ?? '')
    .replace(/[\u0000-\u001F\u007F]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maxLen);
}

function sanitizeOptionalText(value: string | null | undefined, maxLen: number): string | null {
  const cleaned = sanitizeText(value, maxLen);
  return cleaned || null;
}

function sanitizeOptionalUrl(value: string | null | undefined, fieldLabel: string): string | null {
  const trimmed = sanitizeText(value, 2000);
  if (!trimmed) return null;
  const candidateUrl = /^https?:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidateUrl);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) {
      throw new Error(`${fieldLabel} must be a valid HTTP or HTTPS URL.`);
    }
    return parsed.href;
  } catch {
    throw new Error(`${fieldLabel} is not a valid URL (“${trimmed}”).`);
  }
}

function sanitizeMonth(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  if (/^\d{4}-(0[1-9]|1[0-2])$/u.test(trimmed)) return trimmed;
  if (/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/u.test(trimmed)) return trimmed.slice(0, 7);
  if (/^\d{4}$/u.test(trimmed)) return trimmed;
  return null;
}

function sanitizeDatePair(
  rawStart: string | null | undefined,
  rawEnd: string | null | undefined,
  isCurrent: boolean,
): { startDate: string | null; endDate: string | null } {
  const startDate = sanitizeMonth(rawStart);
  let endDate = isCurrent ? null : sanitizeMonth(rawEnd);
  if (startDate && endDate && startDate > endDate) {
    endDate = null;
  }
  return { startDate, endDate };
}

function sanitizeGraduationYear(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isInteger(value)) return null;
  if (value < 1950 || value > 2100) return null;
  return value;
}

function sanitizeTechnologies(items: string[] | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of items ?? []) {
    const clean = sanitizeText(raw, 50);
    const key = comparable(clean);
    if (!clean || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
    if (result.length >= 20) break;
  }
  return result;
}

function samePersonalValue(kind: ResumeFactKind, existing: string | null | undefined, suggestion: string): boolean {
  if (!existing) return false;
  if (kind === 'phone') return existing.replace(/\D/gu, '') === suggestion.replace(/\D/gu, '');
  if (kind === 'headline') {
    const left = comparable(existing);
    const right = comparable(suggestion);
    const sharedPrefix = left.startsWith(right) || right.startsWith(left);
    return left === right || (sharedPrefix && Math.min(left.length, right.length) >= 60);
  }
  if (URL_KINDS.has(kind)) {
    const cleanUrl = (value: string) => comparable(value).replace(/^https?:\/\//u, '').replace(/^www\./u, '');
    return cleanUrl(existing) === cleanUrl(suggestion);
  }
  return comparable(existing) === comparable(suggestion);
}

function dateValue(value: string | null | undefined): string {
  return value ? value.slice(0, 7) : '';
}

function isFactValid(fact: ReviewFact): boolean {
  if (fact.kind === 'education') return Boolean(fact.institution?.trim());
  if (fact.kind === 'experience') return Boolean(fact.companyName?.trim() && fact.jobTitle?.trim());
  if (fact.kind === 'project') return Boolean((fact.projectName ?? fact.value).trim());
  return Boolean(fact.value.trim());
}

type FactGroupKey = 'personal' | 'experience' | 'education' | 'projects' | 'skills';

const groupMeta: Array<{ key: FactGroupKey; title: string; kinds: ResumeFactKind[] }> = [
  {
    key: 'personal',
    title: 'Personal details & links',
    kinds: ['phone', 'currentTitle', 'locationCity', 'locationCountry', 'headline', 'linkedinUrl', 'githubUrl', 'portfolioUrl'],
  },
  { key: 'experience', title: 'Experience', kinds: ['experience'] },
  { key: 'education', title: 'Education', kinds: ['education'] },
  { key: 'projects', title: 'Projects', kinds: ['project'] },
  { key: 'skills', title: 'Skills', kinds: ['skill'] },
];

export default function ResumeFactReview({ filename, text, onClose, onApplied }: Props) {
  const [facts, setFacts] = useState<ReviewFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, saving]);

  useEffect(() => {
    let active = true;
    onboardingApi.get().then((data) => {
      if (!active) return;
      const candidates = extractResumeFacts(text);
      const mapped = candidates.flatMap((item): ReviewFact[] => {
        if (item.kind === 'skill') {
          const exists = data.skills.some((skill) => comparable(skill.name) === comparable(item.value));
          return exists ? [] : [{ ...item, selected: true }];
        }
        if (item.kind === 'education') {
          const exists = data.education.some((entry) =>
            comparable(entry.institution) === comparable(item.institution)
            && (!item.degree || !entry.degree || comparable(entry.degree) === comparable(item.degree)),
          );
          return exists ? [] : [{ ...item, selected: true }];
        }
        if (item.kind === 'experience') {
          const exists = data.experience.some((entry) =>
            comparable(entry.companyName) === comparable(item.companyName)
            && comparable(entry.jobTitle) === comparable(item.jobTitle),
          );
          return exists ? [] : [{ ...item, selected: true }];
        }
        if (item.kind === 'project') {
          const exists = data.projects.some((entry) => comparable(entry.name) === comparable(item.projectName ?? item.value));
          return exists ? [] : [{ ...item, selected: true }];
        }
        const field = profileFieldForKind[item.kind];
        const current = field ? data.profile[field] : null;
        const currentText = typeof current === 'string' && current.trim() ? current : null;
        if (currentText && samePersonalValue(item.kind, currentText, item.value)) return [];
        return [{ ...item, selected: !currentText, currentValue: currentText }];
      });
      setFacts(mapped);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not load your profile for fact review.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [text]);

  function updateFact(id: string, patch: Partial<ReviewFact>) {
    setFacts((current) => current.map((fact) => (fact.id === id ? { ...fact, ...patch } : fact)));
  }

  function setAllSelected(selected: boolean) {
    setFacts((current) => current.map((fact) => ({ ...fact, selected })));
  }

  async function approveSelected() {
    const selected = facts.filter((fact) => fact.selected && isFactValid(fact));
    if (!selected.length) {
      setError('Select at least one suggestion with valid required fields.');
      return;
    }
    setSaving(true);
    setError('');
    const savedIds = new Set<string>();
    let savedCount = 0;
    let savedSkills = 0;
    let savedEducation = 0;
    let savedExperience = 0;
    let savedProjects = 0;
    let activeTarget = 'Profile';

    try {
      const data = await onboardingApi.get();

      // 1. Personal details (patch only the selected fields so untouched fields cannot fail validation)
      const personal = selected.filter((fact) => Boolean(profileFieldForKind[fact.kind]));
      if (personal.length) {
        activeTarget = 'Personal details';
        const patch: Parameters<typeof onboardingApi.patchPersonal>[0] = {};
        for (const fact of personal) {
          if (fact.kind === 'phone') patch.phone = sanitizeOptionalText(fact.value, 30);
          else if (fact.kind === 'currentTitle') patch.currentTitle = sanitizeOptionalText(fact.value, 100);
          else if (fact.kind === 'locationCity') patch.locationCity = sanitizeOptionalText(fact.value, 80);
          else if (fact.kind === 'locationCountry') patch.locationCountry = sanitizeOptionalText(fact.value, 80);
          else if (fact.kind === 'headline') patch.headline = sanitizeOptionalText(fact.value, 160);
          else if (fact.kind === 'portfolioUrl') patch.portfolioUrl = sanitizeOptionalUrl(fact.value, 'Portfolio URL');
          else if (fact.kind === 'linkedinUrl') patch.linkedinUrl = sanitizeOptionalUrl(fact.value, 'LinkedIn URL');
          else if (fact.kind === 'githubUrl') patch.githubUrl = sanitizeOptionalUrl(fact.value, 'GitHub URL');
        }
        await onboardingApi.patchPersonal(patch);
        personal.forEach((fact) => savedIds.add(fact.id));
        savedCount += personal.length;
      }

      // 2. Experience entries
      for (const fact of selected.filter((item) => item.kind === 'experience')) {
        const companyName = sanitizeText(fact.companyName, 120);
        const jobTitle = sanitizeText(fact.jobTitle, 120);
        if (!companyName || !jobTitle) continue;
        activeTarget = `Experience “${jobTitle} at ${companyName}”`;
        const exists = data.experience.some((entry) =>
          comparable(entry.companyName) === comparable(companyName)
          && comparable(entry.jobTitle) === comparable(jobTitle),
        );
        if (exists) { savedIds.add(fact.id); continue; }
        const dates = sanitizeDatePair(fact.experienceStartDate, fact.experienceEndDate, Boolean(fact.experienceIsCurrent));
        await onboardingApi.createExperience({
          companyName,
          jobTitle,
          employmentType: fact.employmentType || null,
          location: sanitizeOptionalText(fact.experienceLocation, 100),
          workArrangement: fact.workArrangement || null,
          startDate: dates.startDate,
          endDate: dates.endDate,
          isCurrent: Boolean(fact.experienceIsCurrent),
          description: sanitizeOptionalText(fact.experienceDescription, 1200),
          achievements: sanitizeOptionalText(fact.achievements, 1000),
          sortOrder: data.experience.length + savedExperience,
        });
        savedIds.add(fact.id);
        savedCount += 1;
        savedExperience += 1;
      }

      // 3. Education entries
      for (const fact of selected.filter((item) => item.kind === 'education')) {
        const institution = sanitizeText(fact.institution, 140);
        if (!institution) continue;
        activeTarget = `Education “${institution}”`;
        const degree = sanitizeOptionalText(fact.degree, 100);
        const exists = data.education.some((entry) =>
          comparable(entry.institution) === comparable(institution)
          && (!degree || !entry.degree || comparable(entry.degree) === comparable(degree)),
        );
        if (exists) { savedIds.add(fact.id); continue; }
        const dates = sanitizeDatePair(fact.startDate, fact.endDate, Boolean(fact.isCurrent));
        await onboardingApi.createEducation({
          institution,
          educationLevel: fact.educationLevel || null,
          degree,
          fieldOfStudy: sanitizeOptionalText(fact.fieldOfStudy, 100),
          startDate: dates.startDate,
          endDate: dates.endDate,
          graduationYear: sanitizeGraduationYear(fact.graduationYear),
          grade: sanitizeOptionalText(fact.grade, 32),
          description: sanitizeOptionalText(fact.educationDescription, 800),
          isCurrent: Boolean(fact.isCurrent),
          sortOrder: data.education.length + savedEducation,
        });
        savedIds.add(fact.id);
        savedCount += 1;
        savedEducation += 1;
      }

      // 4. Project entries
      for (const fact of selected.filter((item) => item.kind === 'project')) {
        const name = sanitizeText(fact.projectName ?? fact.value, 100);
        if (!name) continue;
        activeTarget = `Project “${name}”`;
        const exists = data.projects.some((entry) => comparable(entry.name) === comparable(name));
        if (exists) { savedIds.add(fact.id); continue; }
        const dates = sanitizeDatePair(fact.projectStartDate, fact.projectEndDate, Boolean(fact.isOngoing));
        await onboardingApi.createProject({
          name,
          tagline: sanitizeOptionalText(fact.tagline, 140),
          description: sanitizeOptionalText(fact.projectDescription, 1200),
          role: sanitizeOptionalText(fact.role, 80),
          projectUrl: sanitizeOptionalUrl(fact.projectUrl, `${name} Live URL`),
          repositoryUrl: sanitizeOptionalUrl(fact.repositoryUrl, `${name} Repository URL`),
          startDate: dates.startDate,
          endDate: dates.endDate,
          isOngoing: Boolean(fact.isOngoing),
          sortOrder: data.projects.length + savedProjects,
          technologies: sanitizeTechnologies(fact.technologies),
        });
        savedIds.add(fact.id);
        savedCount += 1;
        savedProjects += 1;
      }

      // 5. Skill entries (deduplicated against both existing profile skills and current batch)
      const knownSkills = new Set(data.skills.map((skill) => comparable(skill.name)));
      for (const fact of selected.filter((item) => item.kind === 'skill')) {
        const skillName = sanitizeText(fact.value, 60);
        const key = comparable(skillName);
        if (!skillName || !key || knownSkills.has(key)) {
          savedIds.add(fact.id);
          continue;
        }
        activeTarget = `Skill “${skillName}”`;
        await onboardingApi.createSkill({
          name: skillName,
          category: fact.category ?? 'other',
          proficiency: 'intermediate',
          yearsExperience: null,
          isHighlighted: false,
          sortOrder: data.skills.length + savedSkills,
        });
        knownSkills.add(key);
        savedIds.add(fact.id);
        savedCount += 1;
        savedSkills += 1;
      }

      if (savedCount > 0) {
        onApplied(`Approved ${savedCount} new fact${savedCount === 1 ? '' : 's'} from ${filename} and saved to your profile.`);
      } else {
        setFacts((current) => current.filter((fact) => !savedIds.has(fact.id)));
        setError('No new suggestions needed saving.');
      }
    } catch (cause) {
      setFacts((current) => current.filter((fact) => !savedIds.has(fact.id)));
      const detail = cause instanceof Error ? cause.message : 'Validation failed.';
      setError(`${activeTarget}: ${detail}`);
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = facts.filter((fact) => fact.selected && isFactValid(fact)).length;
  const allSelected = facts.length > 0 && facts.every((fact) => fact.selected);

  return (
    <div className="cs-drawer-backdrop" role="presentation" onMouseDown={() => { if (!saving) onClose(); }}>
      <section
        className="cs-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cs-fact-review-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="cs-drawer-header">
          <div>
            <span className="cs-badge cs-badge-accent">Human Review Required</span>
            <h2 id="cs-fact-review-title" style={{ marginTop: 8 }}>Review extracted resume facts</h2>
            <p className="cs-mono">{filename}</p>
          </div>
          <button type="button" className="cs-btn cs-btn-icon cs-btn-ghost" onClick={onClose} disabled={saving} aria-label="Close fact review">
            <X size={18} />
          </button>
        </header>

        <div className="cs-drawer-body">
          <div className="cs-alert cs-alert-success">
            <div className="cs-alert-content">
              <FileCheck2 size={16} />
              <span>Only new or updated suggestions are shown. Nothing is written to your profile until you approve it.</span>
            </div>
          </div>

          {!loading && facts.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span className="cs-hint cs-tabular">{facts.length} suggestion{facts.length === 1 ? '' : 's'} detected</span>
              <button type="button" className="cs-btn cs-btn-sm" onClick={() => setAllSelected(!allSelected)} disabled={saving}>
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
            </div>
          )}

          {error && <div className="cs-alert cs-alert-error" role="alert">{error}</div>}

          {loading ? (
            <div className="cs-empty-panel">
              <LoaderCircle size={20} className="cs-spin" style={{ color: 'var(--accent-text)' }} />
              <p>Extracting facts and comparing against your verified profile…</p>
            </div>
          ) : facts.length === 0 ? (
            <div className="cs-empty-panel">
              <div className="cs-empty-icon"><FileCheck2 size={20} /></div>
              <h3>Your profile is up to date</h3>
              <p>No new facts were detected in this resume. Information already saved in your profile is hidden.</p>
            </div>
          ) : (
            groupMeta.map((group) => {
              const items = facts.filter((fact) => group.kinds.includes(fact.kind));
              if (items.length === 0) return null;
              return (
                <div className="cs-fact-group" key={group.key}>
                  <div className="cs-fact-group-head">
                    <h3>{group.title}</h3>
                    <span className="cs-hint cs-tabular">{items.filter((i) => i.selected).length}/{items.length} selected</span>
                  </div>

                  {items.map((fact) => (
                    <article className="cs-fact-card" key={fact.id}>
                      <label className="cs-checkbox" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                        <input
                          type="checkbox"
                          checked={fact.selected}
                          onChange={(event) => updateFact(fact.id, { selected: event.target.checked })}
                        />
                        <span>{fact.kind === 'skill' ? fact.value : fact.label}</span>
                      </label>

                      {fact.kind === 'experience' ? (
                        <div className="cs-form-grid">
                          <label className="cs-field"><span className="cs-label">Company</span><input className="cs-input" maxLength={120} value={fact.companyName ?? ''} onChange={(e) => updateFact(fact.id, { companyName: e.target.value })} /></label>
                          <label className="cs-field"><span className="cs-label">Job title</span><input className="cs-input" maxLength={120} value={fact.jobTitle ?? ''} onChange={(e) => updateFact(fact.id, { jobTitle: e.target.value })} /></label>
                          <label className="cs-field">
                            <span className="cs-label">Employment type</span>
                            <select className="cs-select" value={fact.employmentType ?? ''} onChange={(e) => updateFact(fact.id, { employmentType: e.target.value || null })}>
                              <option value="">Not specified</option>
                              <option value="internship">Internship</option>
                              <option value="full_time">Full-time</option>
                              <option value="part_time">Part-time</option>
                              <option value="contract">Contract</option>
                              <option value="freelance">Freelance</option>
                              <option value="volunteer">Volunteer</option>
                              <option value="apprenticeship">Apprenticeship</option>
                              <option value="other">Other</option>
                            </select>
                          </label>
                          <label className="cs-field">
                            <span className="cs-label">Work arrangement</span>
                            <select className="cs-select" value={fact.workArrangement ?? ''} onChange={(e) => updateFact(fact.id, { workArrangement: e.target.value || null })}>
                              <option value="">Not specified</option>
                              <option value="remote">Remote</option>
                              <option value="hybrid">Hybrid</option>
                              <option value="onsite">On-site</option>
                            </select>
                          </label>
                          <label className="cs-field cs-field-wide"><span className="cs-label">Location</span><input className="cs-input" maxLength={100} value={fact.experienceLocation ?? ''} onChange={(e) => updateFact(fact.id, { experienceLocation: e.target.value || null })} /></label>
                          <label className="cs-field"><span className="cs-label">Start date</span><input className="cs-input" type="month" value={dateValue(fact.experienceStartDate)} onChange={(e) => updateFact(fact.id, { experienceStartDate: e.target.value || null })} /></label>
                          <label className="cs-field"><span className="cs-label">End date</span><input className="cs-input" type="month" value={dateValue(fact.experienceEndDate)} disabled={Boolean(fact.experienceIsCurrent)} onChange={(e) => updateFact(fact.id, { experienceEndDate: e.target.value || null })} /></label>
                          <label className="cs-checkbox cs-field-wide">
                            <input type="checkbox" checked={Boolean(fact.experienceIsCurrent)} onChange={(e) => updateFact(fact.id, { experienceIsCurrent: e.target.checked, experienceEndDate: e.target.checked ? null : fact.experienceEndDate })} />
                            <span>Currently working here</span>
                          </label>
                          <label className="cs-field cs-field-wide"><span className="cs-label">Description</span><textarea className="cs-textarea" rows={3} maxLength={1200} value={fact.experienceDescription ?? ''} onChange={(e) => updateFact(fact.id, { experienceDescription: e.target.value })} /></label>
                        </div>
                      ) : fact.kind === 'education' ? (
                        <div className="cs-form-grid">
                          <label className="cs-field"><span className="cs-label">Institution</span><input className="cs-input" maxLength={140} value={fact.institution ?? ''} onChange={(e) => updateFact(fact.id, { institution: e.target.value, value: e.target.value })} /></label>
                          <label className="cs-field"><span className="cs-label">Degree</span><input className="cs-input" maxLength={100} value={fact.degree ?? ''} onChange={(e) => updateFact(fact.id, { degree: e.target.value })} /></label>
                          <label className="cs-field"><span className="cs-label">Field of study</span><input className="cs-input" maxLength={100} value={fact.fieldOfStudy ?? ''} onChange={(e) => updateFact(fact.id, { fieldOfStudy: e.target.value })} /></label>
                          <label className="cs-field">
                            <span className="cs-label">Education level</span>
                            <select className="cs-select" value={fact.educationLevel ?? ''} onChange={(e) => updateFact(fact.id, { educationLevel: e.target.value || null })}>
                              <option value="">Not detected</option>
                              <option value="high_school">High school</option>
                              <option value="diploma">Diploma</option>
                              <option value="associate">Associate</option>
                              <option value="bachelor">Bachelor's</option>
                              <option value="master">Master's</option>
                              <option value="doctorate">Doctorate</option>
                              <option value="bootcamp">Bootcamp</option>
                              <option value="other">Other</option>
                            </select>
                          </label>
                          <label className="cs-field"><span className="cs-label">Start date</span><input className="cs-input" type="month" value={dateValue(fact.startDate)} onChange={(e) => updateFact(fact.id, { startDate: e.target.value || null })} /></label>
                          <label className="cs-field"><span className="cs-label">End date</span><input className="cs-input" type="month" value={dateValue(fact.endDate)} disabled={Boolean(fact.isCurrent)} onChange={(e) => updateFact(fact.id, { endDate: e.target.value || null })} /></label>
                          <label className="cs-field"><span className="cs-label">Graduation year</span><input className="cs-input" type="number" min="1950" max="2100" value={fact.graduationYear ?? ''} onChange={(e) => updateFact(fact.id, { graduationYear: e.target.value ? Number(e.target.value) : null })} /></label>
                          <label className="cs-field"><span className="cs-label">Grade / GPA</span><input className="cs-input" maxLength={32} value={fact.grade ?? ''} onChange={(e) => updateFact(fact.id, { grade: e.target.value })} /></label>
                          <label className="cs-checkbox cs-field-wide">
                            <input type="checkbox" checked={Boolean(fact.isCurrent)} onChange={(e) => updateFact(fact.id, { isCurrent: e.target.checked, endDate: e.target.checked ? null : fact.endDate })} />
                            <span>Currently studying</span>
                          </label>
                          <label className="cs-field cs-field-wide"><span className="cs-label">Description</span><textarea className="cs-textarea" rows={2} maxLength={800} value={fact.educationDescription ?? ''} onChange={(e) => updateFact(fact.id, { educationDescription: e.target.value })} /></label>
                        </div>
                      ) : fact.kind === 'project' ? (
                        <div className="cs-form-grid">
                          <label className="cs-field"><span className="cs-label">Project name</span><input className="cs-input" maxLength={100} value={fact.projectName ?? fact.value} onChange={(e) => updateFact(fact.id, { projectName: e.target.value, value: e.target.value })} /></label>
                          <label className="cs-field"><span className="cs-label">Your role</span><input className="cs-input" maxLength={80} value={fact.role ?? ''} onChange={(e) => updateFact(fact.id, { role: e.target.value })} /></label>
                          <label className="cs-field cs-field-wide"><span className="cs-label">Tagline</span><input className="cs-input" maxLength={140} value={fact.tagline ?? ''} onChange={(e) => updateFact(fact.id, { tagline: e.target.value })} /></label>
                          <label className="cs-field"><span className="cs-label">Live project URL</span><input className="cs-input" value={fact.projectUrl ?? ''} onChange={(e) => updateFact(fact.id, { projectUrl: e.target.value || null })} /></label>
                          <label className="cs-field"><span className="cs-label">Repository URL</span><input className="cs-input" value={fact.repositoryUrl ?? ''} onChange={(e) => updateFact(fact.id, { repositoryUrl: e.target.value || null })} /></label>
                          <label className="cs-field cs-field-wide"><span className="cs-label">Technologies (comma-separated)</span><input className="cs-input" value={(fact.technologies ?? []).join(', ')} onChange={(e) => updateFact(fact.id, { technologies: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} /></label>
                          <label className="cs-field"><span className="cs-label">Start date</span><input className="cs-input" type="month" value={dateValue(fact.projectStartDate)} onChange={(e) => updateFact(fact.id, { projectStartDate: e.target.value || null })} /></label>
                          <label className="cs-field"><span className="cs-label">End date</span><input className="cs-input" type="month" value={dateValue(fact.projectEndDate)} disabled={Boolean(fact.isOngoing)} onChange={(e) => updateFact(fact.id, { projectEndDate: e.target.value || null })} /></label>
                          <label className="cs-checkbox cs-field-wide">
                            <input type="checkbox" checked={Boolean(fact.isOngoing)} onChange={(e) => updateFact(fact.id, { isOngoing: e.target.checked, projectEndDate: e.target.checked ? null : fact.projectEndDate })} />
                            <span>Ongoing project</span>
                          </label>
                          <label className="cs-field cs-field-wide"><span className="cs-label">Description</span><textarea className="cs-textarea" rows={3} maxLength={1200} value={fact.projectDescription ?? ''} onChange={(e) => updateFact(fact.id, { projectDescription: e.target.value })} /></label>
                        </div>
                      ) : fact.kind === 'skill' ? (
                        <div className="cs-skill-row">
                          <select
                            className="cs-select"
                            value={fact.category ?? 'other'}
                            onChange={(e) => updateFact(fact.id, { category: e.target.value as ResumeSkillCategory })}
                            aria-label={`Category for ${fact.value}`}
                          >
                            <option value="programming_language">Language</option>
                            <option value="frontend">Frontend</option>
                            <option value="backend">Backend</option>
                            <option value="database">Database</option>
                            <option value="cloud">Cloud / DevOps</option>
                            <option value="tool">Tool</option>
                            <option value="testing">Testing</option>
                            <option value="soft_skill">Soft skill</option>
                            <option value="other">Other</option>
                          </select>
                          <input
                            className="cs-input"
                            value={fact.value}
                            maxLength={60}
                            onChange={(e) => updateFact(fact.id, { value: e.target.value })}
                            aria-label={`Edit suggested skill ${fact.value}`}
                          />
                        </div>
                      ) : (
                        <input
                          className="cs-input"
                          value={fact.value}
                          maxLength={fact.kind === 'headline' ? 160 : fact.kind === 'phone' ? 30 : 2000}
                          onChange={(e) => updateFact(fact.id, { value: e.target.value })}
                          aria-label={`Edit ${fact.label}`}
                        />
                      )}

                      {fact.currentValue && (
                        <span className="cs-badge cs-badge-warning" style={{ alignSelf: 'flex-start' }}>
                          Current profile value: “{fact.currentValue}” — select to replace
                        </span>
                      )}

                      <div className="cs-fact-evidence">
                        Evidence: “{fact.evidence.slice(0, 320)}”
                      </div>
                    </article>
                  ))}
                </div>
              );
            })
          )}
        </div>

        <footer className="cs-drawer-footer">
          <span className="cs-hint cs-tabular">{selectedCount} selected to approve</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="cs-btn" onClick={onClose} disabled={saving}>Cancel</button>
            <button
              type="button"
              className="cs-btn cs-btn-primary"
              onClick={() => void approveSelected()}
              disabled={loading || saving || selectedCount === 0}
            >
              {saving ? <LoaderCircle size={15} className="cs-spin" /> : <Check size={15} />}
              {saving ? 'Saving…' : 'Approve & save to profile'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
