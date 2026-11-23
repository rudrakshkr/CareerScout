import { useEffect, useMemo, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft, ArrowRight, BriefcaseBusiness, Check, CheckCircle2, ChevronDown,
  Code2, FileText, GraduationCap, LoaderCircle, Pencil, Plus,
  SlidersHorizontal, Sparkles, Trash2, UserRound, Wrench, X,
} from 'lucide-react';
import type { ApiUser } from '../lib/api';
import {
  onboardingApi,
  type EducationEntry,
  type EducationInput,
  type ExperienceEntry,
  type ExperienceInput,
  type OnboardingData,
  type ProjectEntry,
  type ProjectInput,
  type SkillEntry,
  type SkillInput,
} from './onboardingApi';
import './onboarding.css';
import ResumeManager from './ResumeManager';

type StepId = 'personal' | 'education' | 'experience' | 'projects' | 'skills' | 'preferences' | 'resume' | 'review';
type PersistedStep = Exclude<StepId, 'review'>;

const steps: Array<{ id: StepId; title: string; detail: string }> = [
  { id: 'personal', title: 'Personal details', detail: 'A little about you' },
  { id: 'education', title: 'Education', detail: 'Your academic background' },
  { id: 'experience', title: 'Experience', detail: 'Work and other experience' },
  { id: 'projects', title: 'Projects', detail: 'Things you have built' },
  { id: 'skills', title: 'Skills', detail: 'What you can work with' },
  { id: 'preferences', title: 'Job preferences', detail: 'What you are looking for' },
  { id: 'resume', title: 'Resume', detail: 'Upload and review your CV' },
  { id: 'review', title: 'Review profile', detail: 'Check before finishing' },
];

const icons = {
  personal: UserRound,
  education: GraduationCap,
  experience: BriefcaseBusiness,
  projects: Code2,
  skills: Wrench,
  preferences: SlidersHorizontal,
  resume: FileText,
  review: CheckCircle2,
};

const emptyEducation = {
  institution: '', educationLevel: 'bachelor', degree: '', fieldOfStudy: '', startDate: '',
  endDate: '', graduationYear: '', grade: '', description: '', isCurrent: true,
};
const emptyExperience = {
  companyName: '', jobTitle: '', employmentType: 'internship', location: '', workArrangement: 'remote',
  startDate: '', endDate: '', isCurrent: false, description: '', achievements: '',
};
const emptyProject = {
  name: '', tagline: '', description: '', role: '', projectUrl: '', repositoryUrl: '',
  startDate: '', endDate: '', isOngoing: true, technologies: '',
};
const emptySkill = {
  name: '', category: 'programming_language', proficiency: 'intermediate', yearsExperience: '', isHighlighted: false,
};

function clean(value: string): string | null {
  const result = value.trim();
  return result ? result : null;
}

function toDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function Field({ label, hint, children, wide = false }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return <label className={`onboarding-field${wide ? ' onboarding-field-wide' : ''}`}>
    <span className="onboarding-field-label">{label}</span>
    {children}
    {hint && <span className="onboarding-field-hint">{hint}</span>}
  </label>;
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`onboarding-input ${props.className ?? ''}`} />;
}

function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`onboarding-input onboarding-textarea ${props.className ?? ''}`} />;
}

function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <span className="onboarding-select-wrap"><select {...props} className={`onboarding-input onboarding-select ${props.className ?? ''}`} /> <ChevronDown size={15} /></span>;
}

function EntryActions({ onEdit, onDelete, deleting }: { onEdit: () => void; onDelete: () => void; deleting: boolean }) {
  return <div className="onboarding-entry-actions">
    <button type="button" className="onboarding-icon-action" onClick={onEdit} aria-label="Edit entry"><Pencil size={15} /></button>
    <button type="button" className="onboarding-icon-action danger" onClick={onDelete} disabled={deleting} aria-label="Delete entry"><Trash2 size={15} /></button>
  </div>;
}

export function OnboardingPage({ user, onComplete }: { user: ApiUser; onComplete: () => Promise<void> }) {
  const navigate = useNavigate();
  const [data, setData] = useState<OnboardingData | null>(null);
  const [step, setStep] = useState<StepId>('personal');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [personal, setPersonal] = useState({
    displayName: user.displayName, phone: '', locationCity: '', locationCountry: '', headline: '',
    currentTitle: '', portfolioUrl: '', linkedinUrl: '', githubUrl: '',
  });

  const [educationForm, setEducationForm] = useState({ ...emptyEducation });
  const [educationEditing, setEducationEditing] = useState<string | null>(null);
  const [experienceForm, setExperienceForm] = useState({ ...emptyExperience });
  const [experienceEditing, setExperienceEditing] = useState<string | null>(null);
  const [projectForm, setProjectForm] = useState({ ...emptyProject });
  const [projectEditing, setProjectEditing] = useState<string | null>(null);
  const [skillForm, setSkillForm] = useState({ ...emptySkill });
  const [skillEditing, setSkillEditing] = useState<string | null>(null);
  const [preferences, setPreferences] = useState({
    minimumSalary: '', maximumSalary: '', salaryCurrency: 'INR', salaryPeriod: 'monthly',
    paidPreference: 'paid_preferred', workArrangement: 'remote_preferred', willingToRelocate: false,
  });
  const [roles, setRoles] = useState<Array<{ title: string; category: string; seniority: string }>>([]);
  const [locations, setLocations] = useState<Array<{ city: string; region: string; country: string }>>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    onboardingApi.get().then((payload) => {
      if (!active) return;
      setData(payload);
      setPersonal({
        displayName: payload.user.displayName ?? user.displayName,
        phone: payload.profile.phone ?? '',
        locationCity: payload.profile.locationCity ?? '',
        locationCountry: payload.profile.locationCountry ?? '',
        headline: payload.profile.headline ?? '',
        currentTitle: payload.profile.currentTitle ?? '',
        portfolioUrl: payload.profile.portfolioUrl ?? '',
        linkedinUrl: payload.profile.linkedinUrl ?? '',
        githubUrl: payload.profile.githubUrl ?? '',
      });
      const savedStep = payload.profile.onboardingCurrentStep;
      if (steps.some((item) => item.id === savedStep)) setStep(savedStep as PersistedStep);
      const savedPreferences = payload.preferences;
      if (savedPreferences) setPreferences({
        minimumSalary: savedPreferences.minimumSalary === null ? '' : String(savedPreferences.minimumSalary),
        maximumSalary: savedPreferences.maximumSalary === null ? '' : String(savedPreferences.maximumSalary),
        salaryCurrency: savedPreferences.salaryCurrency ?? 'INR',
        salaryPeriod: savedPreferences.salaryPeriod ?? 'monthly',
        paidPreference: savedPreferences.paidPreference,
        workArrangement: savedPreferences.workArrangement,
        willingToRelocate: savedPreferences.willingToRelocate,
      });
      setRoles(payload.preferredRoles.map((role) => ({ title: role.title, category: role.category ?? '', seniority: role.seniority })));
      setLocations(payload.preferredLocations.map((location) => ({ city: location.city ?? '', region: location.region ?? '', country: location.country })));
      setLoading(false);
    }).catch((cause: unknown) => {
      if (!active) return;
      setError(errorMessage(cause));
      setLoading(false);
    });
    return () => { active = false; };
  }, [user.displayName]);

  const activeIndex = steps.findIndex((item) => item.id === step);
  const progress = Math.round((activeIndex / (steps.length - 1)) * 100);
  const currentStep = steps[activeIndex] ?? steps[0];
  const education = data?.education ?? [];
  const experience = data?.experience ?? [];
  const projects = data?.projects ?? [];
  const skills = data?.skills ?? [];
  const hasBackground = education.length > 0 || experience.length > 0 || projects.length > 0;
  const reviewItems = useMemo(() => [
    { title: 'Personal details', ready: Boolean(personal.displayName.trim()) },
    { title: 'Background', ready: hasBackground },
    { title: 'Skills', ready: skills.length > 0 },
    { title: 'Job preferences', ready: Boolean(data?.preferences && data.preferredRoles.length && data.preferredLocations.length) },
  ], [personal.displayName, hasBackground, skills.length, data]);

  async function refreshData() {
    const latest = await onboardingApi.get();
    setData(latest);
  }

  async function savePersonal() {
    if (!personal.displayName.trim()) throw new Error('Please enter your name before continuing.');
    const result = await onboardingApi.patchPersonal({
      displayName: personal.displayName.trim(), phone: clean(personal.phone),
      locationCity: clean(personal.locationCity), locationCountry: clean(personal.locationCountry),
      headline: clean(personal.headline), currentTitle: clean(personal.currentTitle),
      portfolioUrl: clean(personal.portfolioUrl), linkedinUrl: clean(personal.linkedinUrl), githubUrl: clean(personal.githubUrl),
    });
    setData((current) => current ? { ...current, user: result.user, profile: result.profile } : current);
  }

  async function savePreferences() {
    const validRoles = roles.filter((role) => role.title.trim());
    const validLocations = locations.filter((location) => location.country.trim());
    if (!validRoles.length) throw new Error('Add at least one job role so CareerScout knows what to look for.');
    if (!validLocations.length) throw new Error('Add at least one preferred location.');
    const parseSalary = (value: string) => value.trim() ? Number(value) : null;
    const minimumSalary = parseSalary(preferences.minimumSalary);
    const maximumSalary = parseSalary(preferences.maximumSalary);
    if ((minimumSalary !== null && (!Number.isSafeInteger(minimumSalary) || minimumSalary < 0 || minimumSalary > 2_000_000_000)) ||
        (maximumSalary !== null && (!Number.isSafeInteger(maximumSalary) || maximumSalary < 0 || maximumSalary > 2_000_000_000))) {
      throw new Error('Salary amounts must be whole, non-negative numbers.');
    }
    if (minimumSalary !== null && maximumSalary !== null && minimumSalary > maximumSalary) {
      throw new Error('Minimum salary cannot exceed maximum salary.');
    }
    await onboardingApi.savePreferences({
      minimumSalary, maximumSalary,
      salaryCurrency: clean(preferences.salaryCurrency)?.toUpperCase() ?? null,
      salaryPeriod: preferences.salaryPeriod || null,
      paidPreference: preferences.paidPreference,
      workArrangement: preferences.workArrangement,
      willingToRelocate: preferences.willingToRelocate,
      roles: validRoles.map((role, index) => ({ title: role.title.trim(), category: role.category || null, seniority: role.seniority || 'any', priority: index })),
      locations: validLocations.map((location, index) => ({ city: clean(location.city), region: clean(location.region), country: location.country.trim(), priority: index })),
    });
    await refreshData();
  }

  function hasUnsubmittedEntry(): boolean {
    if (step === 'education') return Boolean(educationEditing || educationForm.institution.trim() || educationForm.degree.trim() || educationForm.fieldOfStudy.trim() || educationForm.startDate.trim() || educationForm.endDate.trim() || educationForm.graduationYear.trim() || educationForm.grade.trim() || educationForm.description.trim());
    if (step === 'experience') return Boolean(experienceEditing || experienceForm.companyName.trim() || experienceForm.jobTitle.trim() || experienceForm.location.trim() || experienceForm.startDate.trim() || experienceForm.endDate.trim() || experienceForm.description.trim() || experienceForm.achievements.trim());
    if (step === 'projects') return Boolean(projectEditing || projectForm.name.trim() || projectForm.tagline.trim() || projectForm.description.trim() || projectForm.role.trim() || projectForm.projectUrl.trim() || projectForm.repositoryUrl.trim() || projectForm.startDate.trim() || projectForm.endDate.trim() || projectForm.technologies.trim());
    if (step === 'skills') return Boolean(skillEditing || skillForm.name.trim() || skillForm.yearsExperience.trim());
    return false;
  }

  async function goTo(target: StepId) {
    if (saving || target === step) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const movingForward = steps.findIndex((item) => item.id === target) > activeIndex;
      if (step === 'personal' && movingForward) await savePersonal();
      if (step === 'preferences' && movingForward) await savePreferences();
      if (hasUnsubmittedEntry()) throw new Error('Save or cancel the entry you are editing before leaving this step.');
      const persistedTarget: PersistedStep = target === 'review' ? 'resume' : target;
      await onboardingApi.saveStep(persistedTarget);
      setStep(target);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(kind: 'education' | 'experience' | 'projects' | 'skills', id: string) {
    setDeletingId(id);
    setError('');
    try {
      if (kind === 'education') await onboardingApi.deleteEducation(id);
      if (kind === 'experience') await onboardingApi.deleteExperience(id);
      if (kind === 'projects') await onboardingApi.deleteProject(id);
      if (kind === 'skills') await onboardingApi.deleteSkill(id);
      await refreshData();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setDeletingId(null);
    }
  }

  async function saveEducation() {
    if (!educationForm.institution.trim()) { setError('Enter the institution name.'); return; }
    setSaving(true); setError('');
    const body: EducationInput = {
      institution: educationForm.institution.trim(), educationLevel: clean(educationForm.educationLevel),
      degree: clean(educationForm.degree), fieldOfStudy: clean(educationForm.fieldOfStudy),
      startDate: clean(educationForm.startDate), endDate: educationForm.isCurrent ? null : clean(educationForm.endDate),
      graduationYear: educationForm.graduationYear.trim() ? Number(educationForm.graduationYear) : null,
      grade: clean(educationForm.grade), description: clean(educationForm.description),
      isCurrent: educationForm.isCurrent, sortOrder: educationEditing ? education.find((item) => item.id === educationEditing)?.sortOrder ?? education.length : education.length,
    };
    try {
      if (educationForm.graduationYear.trim() && (!Number.isInteger(body.graduationYear) || Number(body.graduationYear) < 1900 || Number(body.graduationYear) > 2200)) {
        throw new Error('Enter a valid graduation year.');
      }
      const result = educationEditing ? await onboardingApi.updateEducation(educationEditing, body) : await onboardingApi.createEducation(body);
      setData((current) => current ? { ...current, education: educationEditing ? current.education.map((item) => item.id === educationEditing ? result.entry : item) : [...current.education, result.entry] } : current);
      setEducationForm({ ...emptyEducation }); setEducationEditing(null); setNotice('Education saved.');
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setSaving(false); }
  }

  function editEducation(entry: EducationEntry) {
    setEducationEditing(entry.id);
    setEducationForm({
      institution: entry.institution, educationLevel: entry.educationLevel ?? '', degree: entry.degree ?? '',
      fieldOfStudy: entry.fieldOfStudy ?? '', startDate: toDate(entry.startDate), endDate: toDate(entry.endDate),
      graduationYear: entry.graduationYear === null ? '' : String(entry.graduationYear), grade: entry.grade ?? '',
      description: entry.description ?? '', isCurrent: entry.isCurrent,
    });
  }

  async function saveExperience() {
    if (!experienceForm.companyName.trim() || !experienceForm.jobTitle.trim()) { setError('Company and job title are required.'); return; }
    setSaving(true); setError('');
    const body: ExperienceInput = {
      companyName: experienceForm.companyName.trim(), jobTitle: experienceForm.jobTitle.trim(),
      employmentType: clean(experienceForm.employmentType), location: clean(experienceForm.location),
      workArrangement: clean(experienceForm.workArrangement), startDate: clean(experienceForm.startDate),
      endDate: experienceForm.isCurrent ? null : clean(experienceForm.endDate), isCurrent: experienceForm.isCurrent,
      description: clean(experienceForm.description), achievements: clean(experienceForm.achievements),
      sortOrder: experienceEditing ? experience.find((item) => item.id === experienceEditing)?.sortOrder ?? experience.length : experience.length,
    };
    try {
      const result = experienceEditing ? await onboardingApi.updateExperience(experienceEditing, body) : await onboardingApi.createExperience(body);
      setData((current) => current ? { ...current, experience: experienceEditing ? current.experience.map((item) => item.id === experienceEditing ? result.entry : item) : [...current.experience, result.entry] } : current);
      setExperienceForm({ ...emptyExperience }); setExperienceEditing(null); setNotice('Experience saved.');
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setSaving(false); }
  }

  function editExperience(entry: ExperienceEntry) {
    setExperienceEditing(entry.id);
    setExperienceForm({
      companyName: entry.companyName, jobTitle: entry.jobTitle, employmentType: entry.employmentType ?? '',
      location: entry.location ?? '', workArrangement: entry.workArrangement ?? '', startDate: toDate(entry.startDate),
      endDate: toDate(entry.endDate), isCurrent: entry.isCurrent, description: entry.description ?? '', achievements: entry.achievements ?? '',
    });
  }

  async function saveProject() {
    if (!projectForm.name.trim()) { setError('Enter a project name.'); return; }
    setSaving(true); setError('');
    const body: ProjectInput = {
      name: projectForm.name.trim(), tagline: clean(projectForm.tagline), description: clean(projectForm.description),
      role: clean(projectForm.role), projectUrl: clean(projectForm.projectUrl), repositoryUrl: clean(projectForm.repositoryUrl),
      startDate: clean(projectForm.startDate), endDate: projectForm.isOngoing ? null : clean(projectForm.endDate),
      isOngoing: projectForm.isOngoing, sortOrder: projectEditing ? projects.find((item) => item.id === projectEditing)?.sortOrder ?? projects.length : projects.length,
      technologies: projectForm.technologies.split(',').map((item) => item.trim()).filter(Boolean),
    };
    try {
      const result = projectEditing ? await onboardingApi.updateProject(projectEditing, body) : await onboardingApi.createProject(body);
      setData((current) => current ? { ...current, projects: projectEditing ? current.projects.map((item) => item.id === projectEditing ? result.entry : item) : [...current.projects, result.entry] } : current);
      setProjectForm({ ...emptyProject }); setProjectEditing(null); setNotice('Project saved.');
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setSaving(false); }
  }

  function editProject(entry: ProjectEntry) {
    setProjectEditing(entry.id);
    setProjectForm({
      name: entry.name, tagline: entry.tagline ?? '', description: entry.description ?? '', role: entry.role ?? '',
      projectUrl: entry.projectUrl ?? '', repositoryUrl: entry.repositoryUrl ?? '', startDate: toDate(entry.startDate),
      endDate: toDate(entry.endDate), isOngoing: entry.isOngoing, technologies: entry.technologies.map((item) => item.name).join(', '),
    });
  }

  async function saveSkill() {
    if (!skillForm.name.trim()) { setError('Enter a skill name.'); return; }
    setSaving(true); setError('');
    const body: SkillInput = {
      name: skillForm.name.trim(), category: skillForm.category, proficiency: clean(skillForm.proficiency),
      yearsExperience: skillForm.yearsExperience.trim() ? Number(skillForm.yearsExperience) : null,
      isHighlighted: skillForm.isHighlighted, sortOrder: skillEditing ? skills.find((item) => item.id === skillEditing)?.sortOrder ?? skills.length : skills.length,
    };
    try {
      if (body.yearsExperience !== null && (!Number.isFinite(body.yearsExperience) || body.yearsExperience < 0 || body.yearsExperience > 80)) {
        throw new Error('Years of experience must be between 0 and 80.');
      }
      const result = skillEditing ? await onboardingApi.updateSkill(skillEditing, body) : await onboardingApi.createSkill(body);
      setData((current) => current ? { ...current, skills: skillEditing ? current.skills.map((item) => item.id === skillEditing ? result.entry : item) : [...current.skills, result.entry] } : current);
      setSkillForm({ ...emptySkill }); setSkillEditing(null); setNotice('Skill saved.');
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setSaving(false); }
  }

  function editSkill(entry: SkillEntry) {
    setSkillEditing(entry.id);
    setSkillForm({
      name: entry.name, category: entry.category, proficiency: entry.proficiency ?? '',
      yearsExperience: entry.yearsExperience === null ? '' : String(entry.yearsExperience), isHighlighted: entry.isHighlighted,
    });
  }

  async function completeOnboarding() {
    setCompleting(true); setError(''); setNotice('');
    try {
      await onboardingApi.complete();
      await onComplete();
      navigate('/', { replace: true });
    } catch (cause) {
      setError(errorMessage(cause));
      try { await refreshData(); } catch { /* keep the original completion error */ }
    } finally { setCompleting(false); }
  }

  function renderPersonal() {
    return <>
      <div className="onboarding-section-intro"><span className="onboarding-step-kicker">STEP 01 / 08</span><h2>Let's start with you.</h2><p>These details help personalize your workspace and application materials.</p></div>
      <div className="onboarding-form-grid">
        <Field label="Full name"><TextInput value={personal.displayName} onChange={(event) => setPersonal({ ...personal, displayName: event.target.value })} placeholder="Your name" autoComplete="name" /></Field>
        <Field label="Email address" hint="Your account email is used for sign-in."><TextInput value={user.email} disabled /></Field>
        <Field label="Phone number"><TextInput value={personal.phone} onChange={(event) => setPersonal({ ...personal, phone: event.target.value })} placeholder="Optional" autoComplete="tel" /></Field>
        <Field label="Current title"><TextInput value={personal.currentTitle} onChange={(event) => setPersonal({ ...personal, currentTitle: event.target.value })} placeholder="e.g. Computer Science student" /></Field>
        <Field label="City"><TextInput value={personal.locationCity} onChange={(event) => setPersonal({ ...personal, locationCity: event.target.value })} placeholder="e.g. Ludhiana" autoComplete="address-level2" /></Field>
        <Field label="Country"><TextInput value={personal.locationCountry} onChange={(event) => setPersonal({ ...personal, locationCountry: event.target.value })} placeholder="e.g. India" autoComplete="country-name" /></Field>
        <Field label="Professional headline" wide hint="A short line that describes what you do or want to do."><TextInput value={personal.headline} onChange={(event) => setPersonal({ ...personal, headline: event.target.value })} placeholder="e.g. Full-stack developer interested in building useful products" /></Field>
        <Field label="Portfolio URL"><TextInput value={personal.portfolioUrl} onChange={(event) => setPersonal({ ...personal, portfolioUrl: event.target.value })} placeholder="https://" inputMode="url" /></Field>
        <Field label="GitHub URL"><TextInput value={personal.githubUrl} onChange={(event) => setPersonal({ ...personal, githubUrl: event.target.value })} placeholder="https://github.com/" inputMode="url" /></Field>
        <Field label="LinkedIn URL" wide><TextInput value={personal.linkedinUrl} onChange={(event) => setPersonal({ ...personal, linkedinUrl: event.target.value })} placeholder="https://linkedin.com/in/" inputMode="url" /></Field>
      </div>
    </>;
  }

  function renderEducation() {
    return <>
      <div className="onboarding-section-intro"><span className="onboarding-step-kicker">STEP 02 / 08</span><h2>Where have you studied?</h2><p>Add your current education and any previous qualifications. You can add more than one entry.</p></div>
      <div className="onboarding-entry-list">
        {education.map((entry) => <article className="onboarding-entry-card" key={entry.id}>
          <div className="onboarding-entry-symbol"><GraduationCap size={18} /></div>
          <div className="onboarding-entry-copy"><strong>{entry.degree || entry.educationLevel || 'Education'}{entry.fieldOfStudy ? ` · ${entry.fieldOfStudy}` : ''}</strong><span>{entry.institution}</span><small>{entry.startDate || entry.graduationYear || 'Dates not added'}{entry.isCurrent ? ' · Current' : entry.endDate ? ` – ${entry.endDate}` : ''}</small></div>
          <EntryActions onEdit={() => editEducation(entry)} onDelete={() => void deleteEntry('education', entry.id)} deleting={deletingId === entry.id} />
        </article>)}
        {!education.length && <div className="onboarding-empty-inline">No education added yet. Add a qualification below, or continue and use a project or experience entry as your background.</div>}
      </div>
      <div className="onboarding-form-panel">
        <div className="onboarding-form-panel-heading"><div><strong>{educationEditing ? 'Edit education' : 'Add education'}</strong><span>Fields marked as optional can be left blank.</span></div>{educationEditing && <button className="onboarding-text-action" type="button" onClick={() => { setEducationEditing(null); setEducationForm({ ...emptyEducation }); }}>Cancel edit</button>}</div>
        <div className="onboarding-form-grid">
          <Field label="Institution"><TextInput value={educationForm.institution} onChange={(event) => setEducationForm({ ...educationForm, institution: event.target.value })} placeholder="University or school" /></Field>
          <Field label="Education level"><SelectInput value={educationForm.educationLevel} onChange={(event) => setEducationForm({ ...educationForm, educationLevel: event.target.value })}><option value="">Select level</option><option value="high_school">High school</option><option value="diploma">Diploma</option><option value="associate">Associate</option><option value="bachelor">Bachelor's</option><option value="master">Master's</option><option value="doctorate">Doctorate</option><option value="bootcamp">Bootcamp</option><option value="other">Other</option></SelectInput></Field>
          <Field label="Degree"><TextInput value={educationForm.degree} onChange={(event) => setEducationForm({ ...educationForm, degree: event.target.value })} placeholder="e.g. B.Tech" /></Field>
          <Field label="Field of study"><TextInput value={educationForm.fieldOfStudy} onChange={(event) => setEducationForm({ ...educationForm, fieldOfStudy: event.target.value })} placeholder="e.g. Computer Science" /></Field>
          <Field label="Start date"><TextInput type="month" value={educationForm.startDate.slice(0, 7)} onChange={(event) => setEducationForm({ ...educationForm, startDate: event.target.value })} /></Field>
          <Field label="Graduation year"><TextInput type="number" min="1900" max="2200" value={educationForm.graduationYear} onChange={(event) => setEducationForm({ ...educationForm, graduationYear: event.target.value })} placeholder="e.g. 2027" /></Field>
          <Field label="Grade / GPA"><TextInput value={educationForm.grade} onChange={(event) => setEducationForm({ ...educationForm, grade: event.target.value })} placeholder="Optional" /></Field>
          <Field label="End date"><TextInput type="month" value={educationForm.endDate.slice(0, 7)} disabled={educationForm.isCurrent} onChange={(event) => setEducationForm({ ...educationForm, endDate: event.target.value })} /></Field>
          <Field label="Description" wide><TextArea rows={3} value={educationForm.description} onChange={(event) => setEducationForm({ ...educationForm, description: event.target.value })} placeholder="Relevant coursework, honors or activities" /></Field>
          <label className="onboarding-checkbox onboarding-field-wide"><input type="checkbox" checked={educationForm.isCurrent} onChange={(event) => setEducationForm({ ...educationForm, isCurrent: event.target.checked, endDate: event.target.checked ? '' : educationForm.endDate })} /><span>I'm currently studying here</span></label>
        </div>
        <div className="onboarding-form-actions"><button type="button" className="onboarding-small-primary" onClick={() => void saveEducation()} disabled={saving}><Plus size={15} /> {saving ? 'Saving…' : educationEditing ? 'Update education' : 'Save education'}</button></div>
      </div>
    </>;
  }

  function renderExperience() {
    return <>
      <div className="onboarding-section-intro"><span className="onboarding-step-kicker">STEP 03 / 08</span><h2>Tell us about your experience.</h2><p>Include jobs, internships, freelance work, volunteering or other relevant experience. This step is optional.</p></div>
      <div className="onboarding-entry-list">
        {experience.map((entry) => <article className="onboarding-entry-card" key={entry.id}>
          <div className="onboarding-entry-symbol"><BriefcaseBusiness size={18} /></div>
          <div className="onboarding-entry-copy"><strong>{entry.jobTitle}</strong><span>{entry.companyName}{entry.location ? ` · ${entry.location}` : ''}</span><small>{entry.employmentType ?? 'Experience'}{entry.isCurrent ? ' · Current' : ''}</small></div>
          <EntryActions onEdit={() => editExperience(entry)} onDelete={() => void deleteEntry('experience', entry.id)} deleting={deletingId === entry.id} />
        </article>)}
        {!experience.length && <div className="onboarding-empty-inline">No experience yet. That's completely fine; projects and education can show your background.</div>}
      </div>
      <div className="onboarding-form-panel">
        <div className="onboarding-form-panel-heading"><div><strong>{experienceEditing ? 'Edit experience' : 'Add experience'}</strong><span>Use accurate details. You can add multiple entries.</span></div>{experienceEditing && <button className="onboarding-text-action" type="button" onClick={() => { setExperienceEditing(null); setExperienceForm({ ...emptyExperience }); }}>Cancel edit</button>}</div>
        <div className="onboarding-form-grid">
          <Field label="Company / organization"><TextInput value={experienceForm.companyName} onChange={(event) => setExperienceForm({ ...experienceForm, companyName: event.target.value })} placeholder="Company name" /></Field>
          <Field label="Job title"><TextInput value={experienceForm.jobTitle} onChange={(event) => setExperienceForm({ ...experienceForm, jobTitle: event.target.value })} placeholder="e.g. Software Engineering Intern" /></Field>
          <Field label="Employment type"><SelectInput value={experienceForm.employmentType} onChange={(event) => setExperienceForm({ ...experienceForm, employmentType: event.target.value })}><option value="internship">Internship</option><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contract">Contract</option><option value="freelance">Freelance</option><option value="volunteer">Volunteer</option><option value="apprenticeship">Apprenticeship</option><option value="other">Other</option></SelectInput></Field>
          <Field label="Work arrangement"><SelectInput value={experienceForm.workArrangement} onChange={(event) => setExperienceForm({ ...experienceForm, workArrangement: event.target.value })}><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></SelectInput></Field>
          <Field label="Location"><TextInput value={experienceForm.location} onChange={(event) => setExperienceForm({ ...experienceForm, location: event.target.value })} placeholder="City, country or remote" /></Field>
          <Field label="Start date"><TextInput type="month" value={experienceForm.startDate.slice(0, 7)} onChange={(event) => setExperienceForm({ ...experienceForm, startDate: event.target.value })} /></Field>
          <Field label="End date"><TextInput type="month" value={experienceForm.endDate.slice(0, 7)} disabled={experienceForm.isCurrent} onChange={(event) => setExperienceForm({ ...experienceForm, endDate: event.target.value })} /></Field>
          <Field label="Description" wide><TextArea rows={3} value={experienceForm.description} onChange={(event) => setExperienceForm({ ...experienceForm, description: event.target.value })} placeholder="What did you work on?" /></Field>
          <Field label="Achievements" wide><TextArea rows={3} value={experienceForm.achievements} onChange={(event) => setExperienceForm({ ...experienceForm, achievements: event.target.value })} placeholder="Results, contributions or outcomes" /></Field>
          <label className="onboarding-checkbox onboarding-field-wide"><input type="checkbox" checked={experienceForm.isCurrent} onChange={(event) => setExperienceForm({ ...experienceForm, isCurrent: event.target.checked, endDate: event.target.checked ? '' : experienceForm.endDate })} /><span>I currently work here</span></label>
        </div>
        <div className="onboarding-form-actions"><button type="button" className="onboarding-small-primary" onClick={() => void saveExperience()} disabled={saving}><Plus size={15} /> {saving ? 'Saving…' : experienceEditing ? 'Update experience' : 'Save experience'}</button></div>
      </div>
    </>;
  }

  function renderProjects() {
    return <>
      <div className="onboarding-section-intro"><span className="onboarding-step-kicker">STEP 04 / 08</span><h2>Show us what you've built.</h2><p>Add personal, academic, open-source or professional projects. Focus on your contribution and the technologies used.</p></div>
      <div className="onboarding-entry-list">
        {projects.map((entry) => <article className="onboarding-entry-card" key={entry.id}>
          <div className="onboarding-entry-symbol"><Code2 size={18} /></div>
          <div className="onboarding-entry-copy"><strong>{entry.name}</strong><span>{entry.tagline || entry.description || 'Project details'}</span><small>{entry.technologies.map((technology) => technology.name).join(' · ') || 'Technologies not added'}</small></div>
          <EntryActions onEdit={() => editProject(entry)} onDelete={() => void deleteEntry('projects', entry.id)} deleting={deletingId === entry.id} />
        </article>)}
        {!projects.length && <div className="onboarding-empty-inline">No projects added yet. A project can also satisfy the background requirement for completing your profile.</div>}
      </div>
      <div className="onboarding-form-panel">
        <div className="onboarding-form-panel-heading"><div><strong>{projectEditing ? 'Edit project' : 'Add project'}</strong><span>Include links where available.</span></div>{projectEditing && <button className="onboarding-text-action" type="button" onClick={() => { setProjectEditing(null); setProjectForm({ ...emptyProject }); }}>Cancel edit</button>}</div>
        <div className="onboarding-form-grid">
          <Field label="Project name"><TextInput value={projectForm.name} onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })} placeholder="Project name" /></Field>
          <Field label="Your role"><TextInput value={projectForm.role} onChange={(event) => setProjectForm({ ...projectForm, role: event.target.value })} placeholder="e.g. Full-stack developer" /></Field>
          <Field label="Short tagline" wide><TextInput value={projectForm.tagline} onChange={(event) => setProjectForm({ ...projectForm, tagline: event.target.value })} placeholder="One line about the project" /></Field>
          <Field label="Live project URL"><TextInput value={projectForm.projectUrl} onChange={(event) => setProjectForm({ ...projectForm, projectUrl: event.target.value })} placeholder="https://" /></Field>
          <Field label="Repository URL"><TextInput value={projectForm.repositoryUrl} onChange={(event) => setProjectForm({ ...projectForm, repositoryUrl: event.target.value })} placeholder="https://github.com/" /></Field>
          <Field label="Technologies" wide hint="Separate technologies with commas."><TextInput value={projectForm.technologies} onChange={(event) => setProjectForm({ ...projectForm, technologies: event.target.value })} placeholder="React, TypeScript, Node.js, PostgreSQL" /></Field>
          <Field label="Description" wide><TextArea rows={4} value={projectForm.description} onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })} placeholder="What does it do? What did you implement?" /></Field>
          <Field label="Start date"><TextInput type="month" value={projectForm.startDate.slice(0, 7)} onChange={(event) => setProjectForm({ ...projectForm, startDate: event.target.value })} /></Field>
          <Field label="End date"><TextInput type="month" value={projectForm.endDate.slice(0, 7)} disabled={projectForm.isOngoing} onChange={(event) => setProjectForm({ ...projectForm, endDate: event.target.value })} /></Field>
          <label className="onboarding-checkbox onboarding-field-wide"><input type="checkbox" checked={projectForm.isOngoing} onChange={(event) => setProjectForm({ ...projectForm, isOngoing: event.target.checked, endDate: event.target.checked ? '' : projectForm.endDate })} /><span>This project is ongoing</span></label>
        </div>
        <div className="onboarding-form-actions"><button type="button" className="onboarding-small-primary" onClick={() => void saveProject()} disabled={saving}><Plus size={15} /> {saving ? 'Saving…' : projectEditing ? 'Update project' : 'Save project'}</button></div>
      </div>
    </>;
  }

  function renderSkills() {
    return <>
      <div className="onboarding-section-intro"><span className="onboarding-step-kicker">STEP 05 / 08</span><h2>What are your skills?</h2><p>Add the technologies and strengths you can confidently discuss. CareerScout uses these to evaluate role fit.</p></div>
      <div className="onboarding-skill-chips">{skills.map((skill) => <div className="onboarding-skill-chip" key={skill.id}><span>{skill.name}</span><small>{skill.proficiency ?? skill.category.replaceAll('_', ' ')}</small><button type="button" onClick={() => editSkill(skill)} aria-label={`Edit ${skill.name}`}><Pencil size={12} /></button><button type="button" onClick={() => void deleteEntry('skills', skill.id)} disabled={deletingId === skill.id} aria-label={`Delete ${skill.name}`}><X size={13} /></button></div>)}</div>
      {!skills.length && <div className="onboarding-empty-inline">Add at least one skill to complete your profile.</div>}
      <div className="onboarding-form-panel">
        <div className="onboarding-form-panel-heading"><div><strong>{skillEditing ? 'Edit skill' : 'Add a skill'}</strong><span>Add skills one at a time so each can have its own proficiency.</span></div>{skillEditing && <button className="onboarding-text-action" type="button" onClick={() => { setSkillEditing(null); setSkillForm({ ...emptySkill }); }}>Cancel edit</button>}</div>
        <div className="onboarding-form-grid">
          <Field label="Skill name"><TextInput value={skillForm.name} onChange={(event) => setSkillForm({ ...skillForm, name: event.target.value })} placeholder="e.g. TypeScript" /></Field>
          <Field label="Category"><SelectInput value={skillForm.category} onChange={(event) => setSkillForm({ ...skillForm, category: event.target.value })}><option value="programming_language">Programming language</option><option value="frontend">Frontend</option><option value="backend">Backend</option><option value="database">Database</option><option value="tool">Tool</option><option value="cloud">Cloud</option><option value="testing">Testing</option><option value="soft_skill">Soft skill</option><option value="other">Other</option></SelectInput></Field>
          <Field label="Proficiency"><SelectInput value={skillForm.proficiency} onChange={(event) => setSkillForm({ ...skillForm, proficiency: event.target.value })}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option><option value="expert">Expert</option></SelectInput></Field>
          <Field label="Years of experience (optional)" hint="Leave blank if you do not track it."><TextInput type="number" min="0" max="80" step="0.5" value={skillForm.yearsExperience} onChange={(event) => setSkillForm({ ...skillForm, yearsExperience: event.target.value })} placeholder="Optional" /></Field>
          <label className="onboarding-checkbox onboarding-field-wide"><input type="checkbox" checked={skillForm.isHighlighted} onChange={(event) => setSkillForm({ ...skillForm, isHighlighted: event.target.checked })} /><span>Highlight this skill on my profile</span></label>
        </div>
        <div className="onboarding-form-actions"><button type="button" className="onboarding-small-primary" onClick={() => void saveSkill()} disabled={saving}><Plus size={15} /> {saving ? 'Saving…' : skillEditing ? 'Update skill' : 'Save skill'}</button></div>
      </div>
    </>;
  }

  function renderPreferences() {
    return <>
      <div className="onboarding-section-intro"><span className="onboarding-step-kicker">STEP 06 / 08</span><h2>What opportunities are you looking for?</h2><p>Be specific about roles and locations. You can change these preferences any time.</p></div>
      <div className="onboarding-form-panel preference-panel">
        <div className="onboarding-form-panel-heading"><div><strong>Target roles</strong><span>Add at least one role. You can set different seniority levels.</span></div><button type="button" className="onboarding-text-action" onClick={() => setRoles([...roles, { title: '', category: 'software_engineering', seniority: 'internship' }])}><Plus size={14} /> Add role</button></div>
        {roles.map((role, index) => <div className="onboarding-dynamic-row" key={`role-${index}`}>
          <Field label={`Role ${index + 1}`}><TextInput value={role.title} onChange={(event) => setRoles(roles.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} placeholder="e.g. Software Engineering Intern" /></Field>
          <Field label="Category"><SelectInput value={role.category} onChange={(event) => setRoles(roles.map((item, itemIndex) => itemIndex === index ? { ...item, category: event.target.value } : item))}><option value="software_engineering">Software engineering</option><option value="full_stack">Full-stack</option><option value="frontend">Frontend</option><option value="backend">Backend</option><option value="devops">DevOps</option><option value="data">Data</option><option value="mobile">Mobile</option><option value="other">Other</option></SelectInput></Field>
          <Field label="Seniority"><SelectInput value={role.seniority} onChange={(event) => setRoles(roles.map((item, itemIndex) => itemIndex === index ? { ...item, seniority: event.target.value } : item))}><option value="internship">Internship</option><option value="entry_level">Entry-level</option><option value="junior">Junior</option><option value="mid_level">Mid-level</option><option value="senior">Senior</option><option value="any">Any</option></SelectInput></Field>
          <button type="button" className="onboarding-remove-row" onClick={() => setRoles(roles.filter((_, itemIndex) => itemIndex !== index))} aria-label="Remove role"><Trash2 size={15} /></button>
        </div>)}
        {!roles.length && <div className="onboarding-empty-inline">No target roles added yet.</div>}
      </div>
      <div className="onboarding-form-panel preference-panel">
        <div className="onboarding-form-panel-heading"><div><strong>Preferred locations</strong><span>Add at least one country. City and region are optional.</span></div><button type="button" className="onboarding-text-action" onClick={() => setLocations([...locations, { city: '', region: '', country: '' }])}><Plus size={14} /> Add location</button></div>
        {locations.map((location, index) => <div className="onboarding-dynamic-row" key={`location-${index}`}>
          <Field label="City"><TextInput value={location.city} onChange={(event) => setLocations(locations.map((item, itemIndex) => itemIndex === index ? { ...item, city: event.target.value } : item))} placeholder="Optional" /></Field>
          <Field label="State / region"><TextInput value={location.region} onChange={(event) => setLocations(locations.map((item, itemIndex) => itemIndex === index ? { ...item, region: event.target.value } : item))} placeholder="Optional" /></Field>
          <Field label="Country"><TextInput value={location.country} onChange={(event) => setLocations(locations.map((item, itemIndex) => itemIndex === index ? { ...item, country: event.target.value } : item))} placeholder="e.g. India" /></Field>
          <button type="button" className="onboarding-remove-row" onClick={() => setLocations(locations.filter((_, itemIndex) => itemIndex !== index))} aria-label="Remove location"><Trash2 size={15} /></button>
        </div>)}
        {!locations.length && <div className="onboarding-empty-inline">No preferred locations added yet.</div>}
      </div>
      <div className="onboarding-form-panel preference-panel">
        <div className="onboarding-form-panel-heading"><div><strong>Work and compensation</strong><span>These filters help prioritize relevant opportunities.</span></div></div>
        <div className="onboarding-form-grid">
          <Field label="Minimum compensation"><TextInput type="number" min="0" value={preferences.minimumSalary} onChange={(event) => setPreferences({ ...preferences, minimumSalary: event.target.value })} placeholder="No minimum" /></Field>
          <Field label="Maximum compensation"><TextInput type="number" min="0" value={preferences.maximumSalary} onChange={(event) => setPreferences({ ...preferences, maximumSalary: event.target.value })} placeholder="No maximum" /></Field>
          <Field label="Currency"><SelectInput value={preferences.salaryCurrency} onChange={(event) => setPreferences({ ...preferences, salaryCurrency: event.target.value })}><option value="INR">INR · Indian Rupee</option><option value="USD">USD · US Dollar</option><option value="EUR">EUR · Euro</option><option value="GBP">GBP · Pound Sterling</option><option value="JPY">JPY · Japanese Yen</option></SelectInput></Field>
          <Field label="Pay period"><SelectInput value={preferences.salaryPeriod} onChange={(event) => setPreferences({ ...preferences, salaryPeriod: event.target.value })}><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="hourly">Hourly</option></SelectInput></Field>
          <Field label="Paid preference"><SelectInput value={preferences.paidPreference} onChange={(event) => setPreferences({ ...preferences, paidPreference: event.target.value })}><option value="paid_preferred">Paid preferred</option><option value="paid_only">Paid only</option><option value="any">Any, including unpaid</option></SelectInput></Field>
          <Field label="Work arrangement"><SelectInput value={preferences.workArrangement} onChange={(event) => setPreferences({ ...preferences, workArrangement: event.target.value })}><option value="remote_preferred">Remote preferred</option><option value="remote_only">Remote only</option><option value="hybrid_or_remote">Hybrid or remote</option><option value="any">Any arrangement</option></SelectInput></Field>
          <label className="onboarding-checkbox onboarding-field-wide"><input type="checkbox" checked={preferences.willingToRelocate} onChange={(event) => setPreferences({ ...preferences, willingToRelocate: event.target.checked })} /><span>I'm open to relocating for a suitable opportunity</span></label>
        </div>
      </div>
    </>;
  }

  function renderResume() {
    return <>
      <div className="onboarding-section-intro"><span className="onboarding-step-kicker">STEP 07 / 08</span><h2>Add your resume.</h2><p>Keep your resume on this device. CareerScout can extract its text for review, but it will not change your profile facts without your approval.</p></div>
      <ResumeManager />
    </>;
  }

  function renderReview() {
    return <>
      <div className="onboarding-section-intro"><span className="onboarding-step-kicker">STEP 08 / 08</span><h2>Review your profile.</h2><p>Check the information you've saved. You can go back and change any section before completing onboarding.</p></div>
      <div className="onboarding-review-grid">
        {reviewItems.map((item) => <div className={`onboarding-review-check ${item.ready ? 'ready' : 'missing'}`} key={item.title}>{item.ready ? <CheckCircle2 size={18} /> : <span className="onboarding-review-dot" />}<span>{item.title}</span><strong>{item.ready ? 'Ready' : 'Needs attention'}</strong></div>)}
      </div>
      <div className="onboarding-review-card">
        <div className="onboarding-review-heading"><strong>{personal.displayName || user.displayName}</strong><span>{personal.headline || personal.currentTitle || 'Add a headline to introduce yourself'}</span></div>
        <div className="onboarding-review-columns">
          <div><small>EDUCATION</small><strong>{education.length} {education.length === 1 ? 'entry' : 'entries'}</strong></div>
          <div><small>EXPERIENCE</small><strong>{experience.length} {experience.length === 1 ? 'entry' : 'entries'}</strong></div>
          <div><small>PROJECTS</small><strong>{projects.length} {projects.length === 1 ? 'project' : 'projects'}</strong></div>
          <div><small>SKILLS</small><strong>{skills.length} {skills.length === 1 ? 'skill' : 'skills'}</strong></div>
          <div><small>TARGET ROLES</small><strong>{data?.preferredRoles.length ?? 0}</strong></div>
          <div><small>LOCATIONS</small><strong>{data?.preferredLocations.length ?? 0}</strong></div>
        </div>
      </div>
      <div className="onboarding-review-note"><Sparkles size={18} /><p>CareerScout will use this profile to research relevant roles and prepare application materials. It will not apply or send messages without your review and approval.</p></div>
      <p className="onboarding-review-footnote">Your profile information stays in your local CareerScout data store.</p>
    </>;
  }

  if (loading) return <div className="onboarding-loading"><LoaderCircle size={22} className="onboarding-spin" /><span>Loading your profile…</span></div>;

  return <main className="onboarding-screen">
    <header className="onboarding-topbar">
      <a href="/onboarding" className="onboarding-brand" onClick={(event) => event.preventDefault()}><span className="onboarding-brand-mark"><Sparkles size={16} /></span><span>career<span>scout</span></span></a>
      <div className="onboarding-topbar-right"><span className="onboarding-local-indicator"><i /> Local workspace</span><span className="onboarding-user-pill">{user.displayName}</span></div>
    </header>
    <section className="onboarding-heading-row">
      <div><span className="onboarding-eyebrow">PROFILE SETUP</span><h1>Build your career profile</h1><p>A few details now will make your job discovery more relevant later.</p></div>
      <div className="onboarding-progress-label"><strong>{progress}%</strong><span>completed</span></div>
    </section>
    <div className="onboarding-progress-track"><span style={{ width: `${progress}%` }} /></div>

    <div className="onboarding-layout">
      <aside className="onboarding-step-sidebar">
        <div className="onboarding-sidebar-title">YOUR PROFILE <span>08 STEPS</span></div>
        <nav aria-label="Profile setup steps">
          {steps.map((item, index) => {
            const Icon = icons[item.id];
            const isCurrent = item.id === step;
            const isPast = index < activeIndex;
            return <button key={item.id} type="button" className={`onboarding-step-nav${isCurrent ? ' active' : ''}${isPast ? ' past' : ''}`} onClick={() => void goTo(item.id)} disabled={saving} aria-current={isCurrent ? 'step' : undefined}>
              <span className="onboarding-step-icon">{isPast ? <Check size={16} /> : <Icon size={16} />}</span>
              <span className="onboarding-step-nav-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
            </button>;
          })}
        </nav>
        <div className="onboarding-sidebar-note"><div><Sparkles size={16} /></div><strong>Built around your goals</strong><p>You can edit your profile later as your experience and preferences change.</p></div>
      </aside>

      <section className="onboarding-workspace">
        <div className="onboarding-card-topline"><span>{currentStep.title}</span><span>{String(activeIndex + 1).padStart(2, '0')} <i>/</i> 08</span></div>
        <div className="onboarding-card-content">
          {error && <div className="onboarding-alert" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Dismiss error"><X size={15} /></button></div>}
          {notice && <div className="onboarding-notice" role="status"><CheckCircle2 size={15} /> {notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss message"><X size={14} /></button></div>}
          {step === 'personal' && renderPersonal()}
          {step === 'education' && renderEducation()}
          {step === 'experience' && renderExperience()}
          {step === 'projects' && renderProjects()}
          {step === 'skills' && renderSkills()}
          {step === 'preferences' && renderPreferences()}
          {step === 'resume' && renderResume()}
          {step === 'review' && renderReview()}
        </div>
        <footer className="onboarding-card-footer">
          <button type="button" className="onboarding-back-button" onClick={() => void goTo(steps[Math.max(0, activeIndex - 1)].id)} disabled={saving || activeIndex === 0}><ArrowLeft size={16} /> Back</button>
          {step === 'review' ? <button type="button" className="onboarding-continue-button" onClick={() => void completeOnboarding()} disabled={completing || saving}><>{completing ? <LoaderCircle size={16} className="onboarding-spin" /> : <CheckCircle2 size={16} />}{completing ? 'Completing…' : 'Complete profile'}</></button> : <button type="button" className="onboarding-continue-button" onClick={() => void goTo(steps[Math.min(steps.length - 1, activeIndex + 1)].id)} disabled={saving}><>{saving ? <LoaderCircle size={16} className="onboarding-spin" /> : null}{saving ? 'Saving…' : step === 'resume' ? 'Review profile' : 'Save and continue'}<ArrowRight size={16} /></></button>}
        </footer>
      </section>
    </div>
    <footer className="onboarding-page-footer"><span>CareerScout · Local-first career intelligence</span><span>Your profile is stored on this device</span></footer>
  </main>;
}
