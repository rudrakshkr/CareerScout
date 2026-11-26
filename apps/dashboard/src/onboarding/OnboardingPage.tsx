import {
  useEffect,
  useMemo,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  FileText,
  GraduationCap,
  LoaderCircle,
  Moon,
  Pencil,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  UserRound,
  Wrench,
  X,
} from 'lucide-react';
import type { ApiUser } from '../lib/api';
import { useTheme } from '../theme/ThemeProvider';
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
import ResumeManager from './ResumeManager';

type StepId = 'personal' | 'education' | 'experience' | 'projects' | 'skills' | 'preferences' | 'resume' | 'review';
type PersistedStep = Exclude<StepId, 'review'>;

const steps: Array<{ id: StepId; title: string; detail: string }> = [
  { id: 'personal', title: 'Personal details', detail: 'Contact & links' },
  { id: 'education', title: 'Education', detail: 'Degrees & schools' },
  { id: 'experience', title: 'Experience', detail: 'Work & internships' },
  { id: 'projects', title: 'Projects', detail: 'Portfolio builds' },
  { id: 'skills', title: 'Skills', detail: 'Technical stack' },
  { id: 'preferences', title: 'Job preferences', detail: 'Roles & locations' },
  { id: 'resume', title: 'Resume', detail: 'Upload & extract' },
  { id: 'review', title: 'Review & finish', detail: 'Verify profile' },
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
  startDate: '', endDate: '', isOngoing: false, technologies: '',
};
const emptySkill = {
  name: '', category: 'programming_language', proficiency: 'intermediate', yearsExperience: '', isHighlighted: false,
};

function clean(value: string): string | null {
  const result = value.trim();
  return result ? result : null;
}

function toMonth(value: string | null | undefined): string {
  return value ? value.slice(0, 7) : '';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function Field({ label, hint, children, wide = false }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`cs-field${wide ? ' cs-field-wide' : ''}`}>
      <span className="cs-label">{label}</span>
      {children}
      {hint && <span className="cs-hint">{hint}</span>}
    </label>
  );
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`cs-input ${props.className ?? ''}`} />;
}

function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`cs-textarea ${props.className ?? ''}`} />;
}

function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="cs-select-wrap">
      <select {...props} className={`cs-select ${props.className ?? ''}`} />
      <ChevronDown size={15} />
    </span>
  );
}

export function OnboardingPage({
  user,
  onComplete,
  onFinish,
  mode = 'onboarding',
}: {
  user: ApiUser;
  onComplete: () => Promise<void>;
  onFinish?: () => void;
  mode?: 'onboarding' | 'manage';
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const isManageMode = mode === 'manage';
  const visibleSteps = isManageMode ? steps.slice(0, 6) : steps;
  const routeStep = location.pathname.split('/')[2] ?? '';

  const [data, setData] = useState<OnboardingData | null>(null);
  const [step, setStep] = useState<StepId>('personal');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  useEffect(() => {
    if (
      routeStep
      && steps.some((item) => item.id === routeStep)
      && (!isManageMode || ['personal', 'education', 'experience', 'projects', 'skills', 'preferences'].includes(routeStep))
    ) {
      setStep(routeStep as StepId);
    }
  }, [routeStep, isManageMode]);

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
      if (!isManageMode && steps.some((item) => item.id === savedStep)) {
        const pathStep = location.pathname.split('/')[2] ?? '';
        if (pathStep && steps.some((item) => item.id === pathStep)) {
          setStep(pathStep as StepId);
        } else {
          setStep(savedStep as PersistedStep);
          if (location.pathname === '/onboarding') navigate(`/onboarding/${savedStep}`, { replace: true });
        }
      }

      if (payload.preferences) {
        setPreferences({
          minimumSalary: payload.preferences.minimumSalary === null ? '' : String(payload.preferences.minimumSalary),
          maximumSalary: payload.preferences.maximumSalary === null ? '' : String(payload.preferences.maximumSalary),
          salaryCurrency: payload.preferences.salaryCurrency ?? 'INR',
          salaryPeriod: payload.preferences.salaryPeriod ?? 'monthly',
          paidPreference: payload.preferences.paidPreference,
          workArrangement: payload.preferences.workArrangement,
          willingToRelocate: payload.preferences.willingToRelocate,
        });
      }
      setRoles(payload.preferredRoles.map((role) => ({ title: role.title, category: role.category ?? '', seniority: role.seniority })));
      setLocations(payload.preferredLocations.map((loc) => ({ city: loc.city ?? '', region: loc.region ?? '', country: loc.country })));
      setLoading(false);
    }).catch((cause: unknown) => {
      if (!active) return;
      setError(errorMessage(cause));
      setLoading(false);
    });
    return () => { active = false; };
  }, [user.displayName, isManageMode, location.pathname, navigate]);

  const activeIndex = Math.max(0, visibleSteps.findIndex((item) => item.id === step));
  const progress = Math.round((activeIndex / Math.max(1, visibleSteps.length - 1)) * 100);
  const education = data?.education ?? [];
  const experience = data?.experience ?? [];
  const projects = data?.projects ?? [];
  const skills = data?.skills ?? [];
  const hasBackground = education.length > 0 || experience.length > 0 || projects.length > 0;

  const reviewItems = useMemo(() => [
    { title: 'Personal details', ready: Boolean(personal.displayName.trim()) },
    { title: 'Background (education, experience, or projects)', ready: hasBackground },
    { title: 'Skills', ready: skills.length > 0 },
    { title: 'Job preferences, roles & locations', ready: Boolean(data?.preferences && data.preferredRoles.length && data.preferredLocations.length) },
  ], [personal.displayName, hasBackground, skills.length, data]);

  async function refreshData() {
    const latest = await onboardingApi.get();
    setData(latest);
  }

  async function savePersonal(showToast = false) {
    if (!personal.displayName.trim()) throw new Error('Enter your full name before saving.');
    const result = await onboardingApi.patchPersonal({
      displayName: personal.displayName.trim(),
      phone: clean(personal.phone),
      locationCity: clean(personal.locationCity),
      locationCountry: clean(personal.locationCountry),
      headline: clean(personal.headline),
      currentTitle: clean(personal.currentTitle),
      portfolioUrl: clean(personal.portfolioUrl),
      linkedinUrl: clean(personal.linkedinUrl),
      githubUrl: clean(personal.githubUrl),
    });
    setData((current) => (current ? { ...current, user: result.user, profile: result.profile } : current));
    if (isManageMode) await onComplete();
    if (showToast) setNotice('Personal details saved.');
  }

  async function savePreferences(showToast = false) {
    const validRoles = roles.filter((role) => role.title.trim());
    const validLocations = locations.filter((loc) => loc.country.trim());
    if (!validRoles.length) throw new Error('Add at least one preferred job role.');
    if (!validLocations.length) throw new Error('Add at least one preferred location.');
    const parseSalary = (value: string) => (value.trim() ? Number(value) : null);
    const minimumSalary = parseSalary(preferences.minimumSalary);
    const maximumSalary = parseSalary(preferences.maximumSalary);
    if (
      (minimumSalary !== null && (!Number.isSafeInteger(minimumSalary) || minimumSalary < 0 || minimumSalary > 2_000_000_000))
      || (maximumSalary !== null && (!Number.isSafeInteger(maximumSalary) || maximumSalary < 0 || maximumSalary > 2_000_000_000))
    ) {
      throw new Error('Salary amounts must be whole, non-negative numbers.');
    }
    if (minimumSalary !== null && maximumSalary !== null && minimumSalary > maximumSalary) {
      throw new Error('Minimum salary cannot exceed maximum salary.');
    }
    await onboardingApi.savePreferences({
      minimumSalary,
      maximumSalary,
      salaryCurrency: clean(preferences.salaryCurrency)?.toUpperCase() ?? null,
      salaryPeriod: preferences.salaryPeriod || null,
      paidPreference: preferences.paidPreference,
      workArrangement: preferences.workArrangement,
      willingToRelocate: preferences.willingToRelocate,
      roles: validRoles.map((role, index) => ({
        title: role.title.trim(),
        category: role.category || null,
        seniority: role.seniority || 'any',
        priority: index,
      })),
      locations: validLocations.map((loc, index) => ({
        city: clean(loc.city),
        region: clean(loc.region),
        country: loc.country.trim(),
        priority: index,
      })),
    });
    await refreshData();
    if (showToast) setNotice('Job preferences saved.');
  }

  async function goTo(target: StepId) {
    if (saving || target === step) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const movingForward = visibleSteps.findIndex((item) => item.id === target) > activeIndex;
      if (step === 'personal' && movingForward) await savePersonal();
      if (step === 'preferences' && movingForward) await savePreferences();
      if (!isManageMode) {
        const persistedTarget: PersistedStep = target === 'review' ? 'resume' : target;
        await onboardingApi.saveStep(persistedTarget);
      }
      setStep(target);
      navigate(`${isManageMode ? '/profile' : '/onboarding'}/${target}`);
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
      setNotice('Entry deleted.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setDeletingId(null);
    }
  }

  async function saveEducation() {
    if (!educationForm.institution.trim()) { setError('Enter the institution name.'); return; }
    setSaving(true);
    setError('');
    const body: EducationInput = {
      institution: educationForm.institution.trim(),
      educationLevel: clean(educationForm.educationLevel),
      degree: clean(educationForm.degree),
      fieldOfStudy: clean(educationForm.fieldOfStudy),
      startDate: clean(educationForm.startDate),
      endDate: educationForm.isCurrent ? null : clean(educationForm.endDate),
      graduationYear: educationForm.graduationYear.trim() ? Number(educationForm.graduationYear) : null,
      grade: clean(educationForm.grade),
      description: clean(educationForm.description),
      isCurrent: educationForm.isCurrent,
      sortOrder: educationEditing ? education.find((item) => item.id === educationEditing)?.sortOrder ?? education.length : education.length,
    };
    try {
      if (educationForm.graduationYear.trim() && (!Number.isInteger(body.graduationYear) || Number(body.graduationYear) < 1900 || Number(body.graduationYear) > 2200)) {
        throw new Error('Enter a valid 4-digit graduation year.');
      }
      const result = educationEditing
        ? await onboardingApi.updateEducation(educationEditing, body)
        : await onboardingApi.createEducation(body);
      setData((current) => (current ? {
        ...current,
        education: educationEditing
          ? current.education.map((item) => (item.id === educationEditing ? result.entry : item))
          : [...current.education, result.entry],
      } : current));
      setEducationForm({ ...emptyEducation });
      setEducationEditing(null);
      setNotice('Education saved.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  function editEducation(entry: EducationEntry) {
    setEducationEditing(entry.id);
    setEducationForm({
      institution: entry.institution,
      educationLevel: entry.educationLevel ?? '',
      degree: entry.degree ?? '',
      fieldOfStudy: entry.fieldOfStudy ?? '',
      startDate: toMonth(entry.startDate),
      endDate: toMonth(entry.endDate),
      graduationYear: entry.graduationYear === null ? '' : String(entry.graduationYear),
      grade: entry.grade ?? '',
      description: entry.description ?? '',
      isCurrent: entry.isCurrent,
    });
  }

  async function saveExperience() {
    if (!experienceForm.companyName.trim() || !experienceForm.jobTitle.trim()) {
      setError('Company name and job title are required.');
      return;
    }
    setSaving(true);
    setError('');
    const body: ExperienceInput = {
      companyName: experienceForm.companyName.trim(),
      jobTitle: experienceForm.jobTitle.trim(),
      employmentType: clean(experienceForm.employmentType),
      location: clean(experienceForm.location),
      workArrangement: clean(experienceForm.workArrangement),
      startDate: clean(experienceForm.startDate),
      endDate: experienceForm.isCurrent ? null : clean(experienceForm.endDate),
      isCurrent: experienceForm.isCurrent,
      description: clean(experienceForm.description),
      achievements: clean(experienceForm.achievements),
      sortOrder: experienceEditing ? experience.find((item) => item.id === experienceEditing)?.sortOrder ?? experience.length : experience.length,
    };
    try {
      const result = experienceEditing
        ? await onboardingApi.updateExperience(experienceEditing, body)
        : await onboardingApi.createExperience(body);
      setData((current) => (current ? {
        ...current,
        experience: experienceEditing
          ? current.experience.map((item) => (item.id === experienceEditing ? result.entry : item))
          : [...current.experience, result.entry],
      } : current));
      setExperienceForm({ ...emptyExperience });
      setExperienceEditing(null);
      setNotice('Experience saved.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  function editExperience(entry: ExperienceEntry) {
    setExperienceEditing(entry.id);
    setExperienceForm({
      companyName: entry.companyName,
      jobTitle: entry.jobTitle,
      employmentType: entry.employmentType ?? '',
      location: entry.location ?? '',
      workArrangement: entry.workArrangement ?? '',
      startDate: toMonth(entry.startDate),
      endDate: toMonth(entry.endDate),
      isCurrent: entry.isCurrent,
      description: entry.description ?? '',
      achievements: entry.achievements ?? '',
    });
  }

  async function saveProject() {
    if (!projectForm.name.trim()) { setError('Enter a project name.'); return; }
    setSaving(true);
    setError('');
    const body: ProjectInput = {
      name: projectForm.name.trim(),
      tagline: clean(projectForm.tagline),
      description: clean(projectForm.description),
      role: clean(projectForm.role),
      projectUrl: clean(projectForm.projectUrl),
      repositoryUrl: clean(projectForm.repositoryUrl),
      startDate: clean(projectForm.startDate),
      endDate: projectForm.isOngoing ? null : clean(projectForm.endDate),
      isOngoing: projectForm.isOngoing,
      sortOrder: projectEditing ? projects.find((item) => item.id === projectEditing)?.sortOrder ?? projects.length : projects.length,
      technologies: projectForm.technologies.split(',').map((item) => item.trim()).filter(Boolean),
    };
    try {
      const result = projectEditing
        ? await onboardingApi.updateProject(projectEditing, body)
        : await onboardingApi.createProject(body);
      setData((current) => (current ? {
        ...current,
        projects: projectEditing
          ? current.projects.map((item) => (item.id === projectEditing ? result.entry : item))
          : [...current.projects, result.entry],
      } : current));
      setProjectForm({ ...emptyProject });
      setProjectEditing(null);
      setNotice('Project saved.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  function editProject(entry: ProjectEntry) {
    setProjectEditing(entry.id);
    setProjectForm({
      name: entry.name,
      tagline: entry.tagline ?? '',
      description: entry.description ?? '',
      role: entry.role ?? '',
      projectUrl: entry.projectUrl ?? '',
      repositoryUrl: entry.repositoryUrl ?? '',
      startDate: toMonth(entry.startDate),
      endDate: toMonth(entry.endDate),
      isOngoing: entry.isOngoing,
      technologies: entry.technologies.map((item) => item.name).join(', '),
    });
  }

  async function saveSkill() {
    if (!skillForm.name.trim()) { setError('Enter a skill name.'); return; }
    setSaving(true);
    setError('');
    const body: SkillInput = {
      name: skillForm.name.trim(),
      category: skillForm.category,
      proficiency: clean(skillForm.proficiency),
      yearsExperience: skillForm.yearsExperience.trim() ? Number(skillForm.yearsExperience) : null,
      isHighlighted: skillForm.isHighlighted,
      sortOrder: skillEditing ? skills.find((item) => item.id === skillEditing)?.sortOrder ?? skills.length : skills.length,
    };
    try {
      if (body.yearsExperience !== null && (!Number.isFinite(body.yearsExperience) || body.yearsExperience < 0 || body.yearsExperience > 80)) {
        throw new Error('Years of experience must be between 0 and 80.');
      }
      const result = skillEditing
        ? await onboardingApi.updateSkill(skillEditing, body)
        : await onboardingApi.createSkill(body);
      setData((current) => (current ? {
        ...current,
        skills: skillEditing
          ? current.skills.map((item) => (item.id === skillEditing ? result.entry : item))
          : [...current.skills, result.entry],
      } : current));
      setSkillForm({ ...emptySkill });
      setSkillEditing(null);
      setNotice('Skill saved.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  function editSkill(entry: SkillEntry) {
    setSkillEditing(entry.id);
    setSkillForm({
      name: entry.name,
      category: entry.category,
      proficiency: entry.proficiency ?? '',
      yearsExperience: entry.yearsExperience === null ? '' : String(entry.yearsExperience),
      isHighlighted: entry.isHighlighted,
    });
  }

  async function completeOnboarding() {
    setCompleting(true);
    setError('');
    setNotice('');
    try {
      await onboardingApi.complete();
      await onComplete();
      navigate('/overview', { replace: true });
    } catch (cause) {
      setError(errorMessage(cause));
      try { await refreshData(); } catch { /* retain completion error */ }
    } finally {
      setCompleting(false);
    }
  }

  if (loading) {
    return (
      <div className="cs-empty-panel" style={{ minHeight: 280 }}>
        <LoaderCircle size={20} className="cs-spin" style={{ color: 'var(--accent-text)' }} />
        <p>Loading your profile…</p>
      </div>
    );
  }

  const content = (
    <div className="cs-profile-layout">
      <aside className="cs-card cs-step-rail" aria-label="Profile sections">
        {visibleSteps.map((item) => {
          const Icon = icons[item.id];
          const isActive = item.id === step;
          return (
            <button
              key={item.id}
              type="button"
              className={`cs-step-btn${isActive ? ' active' : ''}`}
              onClick={() => void goTo(item.id)}
              disabled={saving}
            >
              <span className="cs-step-icon"><Icon size={15} /></span>
              <span className="cs-step-copy">
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </span>
            </button>
          );
        })}
      </aside>

      <div className="cs-card" style={{ minWidth: 0 }}>
        <div className="cs-card-header">
          <div>
            <h2>{visibleSteps[activeIndex]?.title}</h2>
            <p>{visibleSteps[activeIndex]?.detail}</p>
          </div>
          {!isManageMode && (
            <span className="cs-badge cs-tabular">Step {activeIndex + 1} / {visibleSteps.length}</span>
          )}
        </div>

        <div className="cs-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
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

          {step === 'personal' && (
            <>
              <div className="cs-form-grid">
                <Field label="Full name"><TextInput value={personal.displayName} onChange={(e) => setPersonal({ ...personal, displayName: e.target.value })} placeholder="Your full name" /></Field>
                <Field label="Account email" hint="Used for local sign-in."><TextInput value={user.email} disabled /></Field>
                <Field label="Phone number"><TextInput value={personal.phone} onChange={(e) => setPersonal({ ...personal, phone: e.target.value })} placeholder="+91 98765 43210" /></Field>
                <Field label="Current title"><TextInput value={personal.currentTitle} onChange={(e) => setPersonal({ ...personal, currentTitle: e.target.value })} placeholder="e.g. Full-Stack Developer" /></Field>
                <Field label="City"><TextInput value={personal.locationCity} onChange={(e) => setPersonal({ ...personal, locationCity: e.target.value })} placeholder="e.g. Palampur" /></Field>
                <Field label="Country"><TextInput value={personal.locationCountry} onChange={(e) => setPersonal({ ...personal, locationCountry: e.target.value })} placeholder="e.g. India" /></Field>
                <Field label="Professional headline / summary" wide>
                  <TextArea rows={3} value={personal.headline} onChange={(e) => setPersonal({ ...personal, headline: e.target.value })} placeholder="Concise summary of your engineering background and target roles" />
                </Field>
                <Field label="Portfolio / Website URL"><TextInput value={personal.portfolioUrl} onChange={(e) => setPersonal({ ...personal, portfolioUrl: e.target.value })} placeholder="https://your-portfolio.dev" /></Field>
                <Field label="GitHub URL"><TextInput value={personal.githubUrl} onChange={(e) => setPersonal({ ...personal, githubUrl: e.target.value })} placeholder="https://github.com/username" /></Field>
                <Field label="LinkedIn URL" wide><TextInput value={personal.linkedinUrl} onChange={(e) => setPersonal({ ...personal, linkedinUrl: e.target.value })} placeholder="https://linkedin.com/in/username" /></Field>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="cs-btn cs-btn-primary"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    setError('');
                    try { await savePersonal(true); } catch (cause) { setError(errorMessage(cause)); } finally { setSaving(false); }
                  }}
                >
                  {saving ? <LoaderCircle size={15} className="cs-spin" /> : <Check size={15} />}
                  Save personal details
                </button>
              </div>
            </>
          )}

          {step === 'education' && (
            <>
              {education.length > 0 && (
                <div className="cs-entry-list">
                  {education.map((entry) => (
                    <div className="cs-entry-card" key={entry.id}>
                      <div className="cs-entry-icon"><GraduationCap size={17} /></div>
                      <div className="cs-entry-copy">
                        <strong>{entry.institution}</strong>
                        <span>{[entry.degree, entry.fieldOfStudy].filter(Boolean).join(' · ') || 'Qualification'}</span>
                        <small>{[entry.graduationYear ? `Class of ${entry.graduationYear}` : null, entry.grade ? `Grade: ${entry.grade}` : null, entry.isCurrent ? 'Currently studying' : null].filter(Boolean).join(' · ')}</small>
                      </div>
                      <div className="cs-entry-actions">
                        <button type="button" className="cs-btn cs-btn-icon cs-btn-sm" onClick={() => editEducation(entry)} aria-label="Edit education"><Pencil size={14} /></button>
                        <button type="button" className="cs-btn cs-btn-icon cs-btn-sm cs-btn-danger" disabled={deletingId === entry.id} onClick={() => void deleteEntry('education', entry.id)} aria-label="Delete education"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="cs-form-panel">
                <div className="cs-form-panel-head">
                  <strong>{educationEditing ? 'Edit education entry' : 'Add education'}</strong>
                  {educationEditing && (
                    <button type="button" className="cs-btn cs-btn-sm cs-btn-ghost" onClick={() => { setEducationEditing(null); setEducationForm({ ...emptyEducation }); }}>Cancel edit</button>
                  )}
                </div>
                <div className="cs-form-grid">
                  <Field label="Institution" wide><TextInput value={educationForm.institution} onChange={(e) => setEducationForm({ ...educationForm, institution: e.target.value })} placeholder="University or school name" /></Field>
                  <Field label="Education level">
                    <SelectInput value={educationForm.educationLevel} onChange={(e) => setEducationForm({ ...educationForm, educationLevel: e.target.value })}>
                      <option value="bachelor">Bachelor's</option>
                      <option value="master">Master's</option>
                      <option value="doctorate">Doctorate</option>
                      <option value="diploma">Diploma</option>
                      <option value="associate">Associate</option>
                      <option value="high_school">High school</option>
                      <option value="bootcamp">Bootcamp</option>
                      <option value="other">Other</option>
                    </SelectInput>
                  </Field>
                  <Field label="Degree"><TextInput value={educationForm.degree} onChange={(e) => setEducationForm({ ...educationForm, degree: e.target.value })} placeholder="e.g. B.Tech" /></Field>
                  <Field label="Field of study"><TextInput value={educationForm.fieldOfStudy} onChange={(e) => setEducationForm({ ...educationForm, fieldOfStudy: e.target.value })} placeholder="e.g. Computer Science and Engineering" /></Field>
                  <Field label="Grade / GPA"><TextInput value={educationForm.grade} onChange={(e) => setEducationForm({ ...educationForm, grade: e.target.value })} placeholder="e.g. 8.5 CGPA" /></Field>
                  <Field label="Start date"><TextInput type="month" value={educationForm.startDate} onChange={(e) => setEducationForm({ ...educationForm, startDate: e.target.value })} /></Field>
                  <Field label="End date"><TextInput type="month" value={educationForm.endDate} disabled={educationForm.isCurrent} onChange={(e) => setEducationForm({ ...educationForm, endDate: e.target.value })} /></Field>
                  <Field label="Graduation year"><TextInput type="number" min="1900" max="2200" value={educationForm.graduationYear} onChange={(e) => setEducationForm({ ...educationForm, graduationYear: e.target.value })} placeholder="e.g. 2027" /></Field>
                  <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
                    <label className="cs-checkbox">
                      <input type="checkbox" checked={educationForm.isCurrent} onChange={(e) => setEducationForm({ ...educationForm, isCurrent: e.target.checked, endDate: e.target.checked ? '' : educationForm.endDate })} />
                      <span>Currently studying here</span>
                    </label>
                  </div>
                  <Field label="Academic notes / coursework" wide><TextArea rows={2} value={educationForm.description} onChange={(e) => setEducationForm({ ...educationForm, description: e.target.value })} placeholder="Relevant coursework, honors, or focus areas" /></Field>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                  <button type="button" className="cs-btn cs-btn-primary" disabled={saving} onClick={() => void saveEducation()}>
                    {saving ? <LoaderCircle size={15} className="cs-spin" /> : <Check size={15} />}
                    {educationEditing ? 'Update education' : 'Add education'}
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 'experience' && (
            <>
              {experience.length > 0 && (
                <div className="cs-entry-list">
                  {experience.map((entry) => (
                    <div className="cs-entry-card" key={entry.id}>
                      <div className="cs-entry-icon"><BriefcaseBusiness size={17} /></div>
                      <div className="cs-entry-copy">
                        <strong>{entry.jobTitle}</strong>
                        <span>{entry.companyName}{entry.location ? ` · ${entry.location}` : ''}</span>
                        <small>{[entry.startDate, entry.isCurrent ? 'Present' : entry.endDate].filter(Boolean).join(' – ')}</small>
                      </div>
                      <div className="cs-entry-actions">
                        <button type="button" className="cs-btn cs-btn-icon cs-btn-sm" onClick={() => editExperience(entry)} aria-label="Edit experience"><Pencil size={14} /></button>
                        <button type="button" className="cs-btn cs-btn-icon cs-btn-sm cs-btn-danger" disabled={deletingId === entry.id} onClick={() => void deleteEntry('experience', entry.id)} aria-label="Delete experience"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="cs-form-panel">
                <div className="cs-form-panel-head">
                  <strong>{experienceEditing ? 'Edit experience entry' : 'Add experience (optional for students)'}</strong>
                  {experienceEditing && (
                    <button type="button" className="cs-btn cs-btn-sm cs-btn-ghost" onClick={() => { setExperienceEditing(null); setExperienceForm({ ...emptyExperience }); }}>Cancel edit</button>
                  )}
                </div>
                <div className="cs-form-grid">
                  <Field label="Company name"><TextInput value={experienceForm.companyName} onChange={(e) => setExperienceForm({ ...experienceForm, companyName: e.target.value })} placeholder="Company or organization" /></Field>
                  <Field label="Job title"><TextInput value={experienceForm.jobTitle} onChange={(e) => setExperienceForm({ ...experienceForm, jobTitle: e.target.value })} placeholder="e.g. Software Engineer Intern" /></Field>
                  <Field label="Employment type">
                    <SelectInput value={experienceForm.employmentType} onChange={(e) => setExperienceForm({ ...experienceForm, employmentType: e.target.value })}>
                      <option value="internship">Internship</option>
                      <option value="full_time">Full-time</option>
                      <option value="part_time">Part-time</option>
                      <option value="contract">Contract</option>
                      <option value="freelance">Freelance</option>
                      <option value="volunteer">Volunteer</option>
                      <option value="apprenticeship">Apprenticeship</option>
                      <option value="other">Other</option>
                    </SelectInput>
                  </Field>
                  <Field label="Work arrangement">
                    <SelectInput value={experienceForm.workArrangement} onChange={(e) => setExperienceForm({ ...experienceForm, workArrangement: e.target.value })}>
                      <option value="remote">Remote</option>
                      <option value="hybrid">Hybrid</option>
                      <option value="onsite">On-site</option>
                    </SelectInput>
                  </Field>
                  <Field label="Location" wide><TextInput value={experienceForm.location} onChange={(e) => setExperienceForm({ ...experienceForm, location: e.target.value })} placeholder="e.g. Delhi NCR, India" /></Field>
                  <Field label="Start date"><TextInput type="month" value={experienceForm.startDate} onChange={(e) => setExperienceForm({ ...experienceForm, startDate: e.target.value })} /></Field>
                  <Field label="End date"><TextInput type="month" value={experienceForm.endDate} disabled={experienceForm.isCurrent} onChange={(e) => setExperienceForm({ ...experienceForm, endDate: e.target.value })} /></Field>
                  <label className="cs-checkbox cs-field-wide">
                    <input type="checkbox" checked={experienceForm.isCurrent} onChange={(e) => setExperienceForm({ ...experienceForm, isCurrent: e.target.checked, endDate: e.target.checked ? '' : experienceForm.endDate })} />
                    <span>Currently working in this role</span>
                  </label>
                  <Field label="Description" wide><TextArea rows={3} value={experienceForm.description} onChange={(e) => setExperienceForm({ ...experienceForm, description: e.target.value })} placeholder="Key responsibilities and engineering impact" /></Field>
                  <Field label="Notable achievements (optional)" wide><TextArea rows={2} value={experienceForm.achievements} onChange={(e) => setExperienceForm({ ...experienceForm, achievements: e.target.value })} placeholder="Measurable outcomes or shipped milestones" /></Field>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                  <button type="button" className="cs-btn cs-btn-primary" disabled={saving} onClick={() => void saveExperience()}>
                    {saving ? <LoaderCircle size={15} className="cs-spin" /> : <Check size={15} />}
                    {experienceEditing ? 'Update experience' : 'Add experience'}
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 'projects' && (
            <>
              {projects.length > 0 && (
                <div className="cs-entry-list">
                  {projects.map((entry) => (
                    <div className="cs-entry-card" key={entry.id}>
                      <div className="cs-entry-icon"><Code2 size={17} /></div>
                      <div className="cs-entry-copy">
                        <strong>{entry.name}</strong>
                        <span>{entry.tagline || entry.description?.slice(0, 110) || 'Project'}</span>
                        {entry.technologies.length > 0 && (
                          <small>{entry.technologies.map((t) => t.name).join(' · ')}</small>
                        )}
                      </div>
                      <div className="cs-entry-actions">
                        <button type="button" className="cs-btn cs-btn-icon cs-btn-sm" onClick={() => editProject(entry)} aria-label="Edit project"><Pencil size={14} /></button>
                        <button type="button" className="cs-btn cs-btn-icon cs-btn-sm cs-btn-danger" disabled={deletingId === entry.id} onClick={() => void deleteEntry('projects', entry.id)} aria-label="Delete project"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="cs-form-panel">
                <div className="cs-form-panel-head">
                  <strong>{projectEditing ? 'Edit project' : 'Add project'}</strong>
                  {projectEditing && (
                    <button type="button" className="cs-btn cs-btn-sm cs-btn-ghost" onClick={() => { setProjectEditing(null); setProjectForm({ ...emptyProject }); }}>Cancel edit</button>
                  )}
                </div>
                <div className="cs-form-grid">
                  <Field label="Project name"><TextInput value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} placeholder="e.g. CareerScout" /></Field>
                  <Field label="Your role"><TextInput value={projectForm.role} onChange={(e) => setProjectForm({ ...projectForm, role: e.target.value })} placeholder="e.g. Full-Stack Developer" /></Field>
                  <Field label="Tagline" wide><TextInput value={projectForm.tagline} onChange={(e) => setProjectForm({ ...projectForm, tagline: e.target.value })} placeholder="One-line value summary" /></Field>
                  <Field label="Live URL"><TextInput value={projectForm.projectUrl} onChange={(e) => setProjectForm({ ...projectForm, projectUrl: e.target.value })} placeholder="https://…" /></Field>
                  <Field label="Repository URL"><TextInput value={projectForm.repositoryUrl} onChange={(e) => setProjectForm({ ...projectForm, repositoryUrl: e.target.value })} placeholder="https://github.com/…" /></Field>
                  <Field label="Technologies (comma-separated)" wide><TextInput value={projectForm.technologies} onChange={(e) => setProjectForm({ ...projectForm, technologies: e.target.value })} placeholder="React, TypeScript, Node.js, PostgreSQL" /></Field>
                  <Field label="Start date"><TextInput type="month" value={projectForm.startDate} onChange={(e) => setProjectForm({ ...projectForm, startDate: e.target.value })} /></Field>
                  <Field label="End date"><TextInput type="month" value={projectForm.endDate} disabled={projectForm.isOngoing} onChange={(e) => setProjectForm({ ...projectForm, endDate: e.target.value })} /></Field>
                  <label className="cs-checkbox cs-field-wide">
                    <input type="checkbox" checked={projectForm.isOngoing} onChange={(e) => setProjectForm({ ...projectForm, isOngoing: e.target.checked, endDate: e.target.checked ? '' : projectForm.endDate })} />
                    <span>Ongoing project</span>
                  </label>
                  <Field label="Description" wide><TextArea rows={3} value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} placeholder="What you built, architecture decisions, and outcomes" /></Field>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                  <button type="button" className="cs-btn cs-btn-primary" disabled={saving} onClick={() => void saveProject()}>
                    {saving ? <LoaderCircle size={15} className="cs-spin" /> : <Check size={15} />}
                    {projectEditing ? 'Update project' : 'Add project'}
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 'skills' && (
            <>
              {skills.length > 0 && (
                <div className="cs-chip-group">
                  {skills.map((skill) => (
                    <span className="cs-chip" key={skill.id}>
                      <button type="button" onClick={() => editSkill(skill)} style={{ color: 'inherit', padding: 0, borderRadius: 0 }} title="Edit skill">
                        {skill.name}
                      </button>
                      <small>{skill.category.replaceAll('_', ' ')}</small>
                      <button type="button" disabled={deletingId === skill.id} onClick={() => void deleteEntry('skills', skill.id)} aria-label={`Remove ${skill.name}`}>
                        <X size={13} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="cs-form-panel">
                <div className="cs-form-panel-head">
                  <strong>{skillEditing ? 'Edit skill' : 'Add skill'}</strong>
                  {skillEditing && (
                    <button type="button" className="cs-btn cs-btn-sm cs-btn-ghost" onClick={() => { setSkillEditing(null); setSkillForm({ ...emptySkill }); }}>Cancel edit</button>
                  )}
                </div>
                <div className="cs-form-grid">
                  <Field label="Skill name"><TextInput value={skillForm.name} onChange={(e) => setSkillForm({ ...skillForm, name: e.target.value })} placeholder="e.g. TypeScript" /></Field>
                  <Field label="Category">
                    <SelectInput value={skillForm.category} onChange={(e) => setSkillForm({ ...skillForm, category: e.target.value })}>
                      <option value="programming_language">Programming language</option>
                      <option value="frontend">Frontend</option>
                      <option value="backend">Backend</option>
                      <option value="database">Database</option>
                      <option value="cloud">Cloud / DevOps</option>
                      <option value="tool">Tool</option>
                      <option value="testing">Testing</option>
                      <option value="soft_skill">Soft skill</option>
                      <option value="other">Other</option>
                    </SelectInput>
                  </Field>
                  <Field label="Proficiency">
                    <SelectInput value={skillForm.proficiency} onChange={(e) => setSkillForm({ ...skillForm, proficiency: e.target.value })}>
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                      <option value="expert">Expert</option>
                    </SelectInput>
                  </Field>
                  <Field label="Years of experience (optional)" hint="Leave blank if not applicable.">
                    <TextInput type="number" step="0.5" min="0" max="80" value={skillForm.yearsExperience} onChange={(e) => setSkillForm({ ...skillForm, yearsExperience: e.target.value })} placeholder="Optional" />
                  </Field>
                  <label className="cs-checkbox cs-field-wide">
                    <input type="checkbox" checked={skillForm.isHighlighted} onChange={(e) => setSkillForm({ ...skillForm, isHighlighted: e.target.checked })} />
                    <span>Highlight as a core skill for job matching</span>
                  </label>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                  <button type="button" className="cs-btn cs-btn-primary" disabled={saving} onClick={() => void saveSkill()}>
                    {saving ? <LoaderCircle size={15} className="cs-spin" /> : <Check size={15} />}
                    {skillEditing ? 'Update skill' : 'Add skill'}
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 'preferences' && (
            <>
              <div className="cs-form-panel">
                <div className="cs-form-panel-head">
                  <strong>Target roles</strong>
                  <button type="button" className="cs-btn cs-btn-sm" onClick={() => setRoles([...roles, { title: '', category: 'full_stack', seniority: 'internship' }])}>
                    <Plus size={14} />Add role
                  </button>
                </div>
                {roles.length === 0 && <p className="cs-hint" style={{ marginBottom: 8 }}>Add at least one target role (e.g. Full-Stack Developer Intern).</p>}
                {roles.map((role, index) => (
                  <div className="cs-dynamic-row" key={index}>
                    <Field label="Role title"><TextInput value={role.title} onChange={(e) => setRoles(roles.map((r, i) => (i === index ? { ...r, title: e.target.value } : r)))} placeholder="e.g. Software Engineer Intern" /></Field>
                    <Field label="Category">
                      <SelectInput value={role.category} onChange={(e) => setRoles(roles.map((r, i) => (i === index ? { ...r, category: e.target.value } : r)))}>
                        <option value="">Any</option>
                        <option value="full_stack">Full-stack</option>
                        <option value="frontend">Frontend</option>
                        <option value="backend">Backend</option>
                        <option value="software_engineering">Software engineering</option>
                        <option value="devops">DevOps</option>
                        <option value="data">Data / AI</option>
                        <option value="mobile">Mobile</option>
                        <option value="other">Other</option>
                      </SelectInput>
                    </Field>
                    <Field label="Seniority">
                      <SelectInput value={role.seniority} onChange={(e) => setRoles(roles.map((r, i) => (i === index ? { ...r, seniority: e.target.value } : r)))}>
                        <option value="internship">Internship</option>
                        <option value="entry_level">Entry level</option>
                        <option value="junior">Junior</option>
                        <option value="mid_level">Mid level</option>
                        <option value="senior">Senior</option>
                        <option value="any">Any</option>
                      </SelectInput>
                    </Field>
                    <button type="button" className="cs-btn cs-btn-icon cs-btn-danger" onClick={() => setRoles(roles.filter((_r, i) => i !== index))} aria-label="Remove role"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>

              <div className="cs-form-panel">
                <div className="cs-form-panel-head">
                  <strong>Preferred locations</strong>
                  <button type="button" className="cs-btn cs-btn-sm" onClick={() => setLocations([...locations, { city: '', region: '', country: 'India' }])}>
                    <Plus size={14} />Add location
                  </button>
                </div>
                {locations.length === 0 && <p className="cs-hint" style={{ marginBottom: 8 }}>Add at least one preferred country or city.</p>}
                {locations.map((loc, index) => (
                  <div className="cs-dynamic-row" key={index}>
                    <Field label="City (optional)"><TextInput value={loc.city} onChange={(e) => setLocations(locations.map((l, i) => (i === index ? { ...l, city: e.target.value } : l)))} placeholder="e.g. Delhi / Remote" /></Field>
                    <Field label="State / Region"><TextInput value={loc.region} onChange={(e) => setLocations(locations.map((l, i) => (i === index ? { ...l, region: e.target.value } : l)))} placeholder="e.g. NCR" /></Field>
                    <Field label="Country"><TextInput value={loc.country} onChange={(e) => setLocations(locations.map((l, i) => (i === index ? { ...l, country: e.target.value } : l)))} placeholder="e.g. India" /></Field>
                    <button type="button" className="cs-btn cs-btn-icon cs-btn-danger" onClick={() => setLocations(locations.filter((_l, i) => i !== index))} aria-label="Remove location"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>

              <div className="cs-form-panel">
                <div className="cs-form-panel-head"><strong>Compensation & work arrangement</strong></div>
                <div className="cs-form-grid">
                  <Field label="Work arrangement">
                    <SelectInput value={preferences.workArrangement} onChange={(e) => setPreferences({ ...preferences, workArrangement: e.target.value })}>
                      <option value="remote_only">Remote only</option>
                      <option value="remote_preferred">Remote preferred</option>
                      <option value="hybrid_or_remote">Hybrid or remote</option>
                      <option value="any">Any</option>
                    </SelectInput>
                  </Field>
                  <Field label="Compensation preference">
                    <SelectInput value={preferences.paidPreference} onChange={(e) => setPreferences({ ...preferences, paidPreference: e.target.value })}>
                      <option value="paid_only">Paid only</option>
                      <option value="paid_preferred">Paid preferred</option>
                      <option value="any">Any (including unpaid)</option>
                    </SelectInput>
                  </Field>
                  <Field label="Minimum salary / stipend"><TextInput type="number" min="0" value={preferences.minimumSalary} onChange={(e) => setPreferences({ ...preferences, minimumSalary: e.target.value })} placeholder="Optional" /></Field>
                  <Field label="Maximum salary / stipend"><TextInput type="number" min="0" value={preferences.maximumSalary} onChange={(e) => setPreferences({ ...preferences, maximumSalary: e.target.value })} placeholder="Optional" /></Field>
                  <Field label="Currency"><TextInput maxLength={3} value={preferences.salaryCurrency} onChange={(e) => setPreferences({ ...preferences, salaryCurrency: e.target.value })} placeholder="INR" /></Field>
                  <Field label="Period">
                    <SelectInput value={preferences.salaryPeriod} onChange={(e) => setPreferences({ ...preferences, salaryPeriod: e.target.value })}>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                      <option value="hourly">Hourly</option>
                    </SelectInput>
                  </Field>
                  <label className="cs-checkbox cs-field-wide">
                    <input type="checkbox" checked={preferences.willingToRelocate} onChange={(e) => setPreferences({ ...preferences, willingToRelocate: e.target.checked })} />
                    <span>Open to relocation for the right opportunity</span>
                  </label>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                  <button
                    type="button"
                    className="cs-btn cs-btn-primary"
                    disabled={saving}
                    onClick={async () => {
                      setSaving(true);
                      setError('');
                      try { await savePreferences(true); } catch (cause) { setError(errorMessage(cause)); } finally { setSaving(false); }
                    }}
                  >
                    {saving ? <LoaderCircle size={15} className="cs-spin" /> : <Check size={15} />}
                    Save job preferences
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 'resume' && !isManageMode && (
            <ResumeManager onResumesChanged={() => void refreshData()} />
          )}

          {step === 'review' && !isManageMode && (
            <div style={{ display: 'grid', gap: 16 }}>
              <div className="cs-form-panel">
                <div className="cs-form-panel-head"><strong>Profile readiness checklist</strong></div>
                <div className="cs-checklist">
                  {reviewItems.map((item) => (
                    <div className="cs-checklist-row" key={item.title}>
                      <div className="cs-checklist-copy">
                        <CheckCircle2 size={16} style={{ color: item.ready ? 'var(--accent-text)' : 'var(--text-muted)' }} />
                        <strong>{item.title}</strong>
                      </div>
                      <span className={item.ready ? 'cs-badge cs-badge-accent' : 'cs-badge cs-badge-warning'}>
                        {item.ready ? 'Ready' : 'Required'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="cs-stat-grid">
                <div className="cs-card cs-stat-card"><span className="cs-hint">Education</span><span className="cs-stat-value">{education.length}</span></div>
                <div className="cs-card cs-stat-card"><span className="cs-hint">Experience</span><span className="cs-stat-value">{experience.length}</span></div>
                <div className="cs-card cs-stat-card"><span className="cs-hint">Projects</span><span className="cs-stat-value">{projects.length}</span></div>
                <div className="cs-card cs-stat-card"><span className="cs-hint">Skills</span><span className="cs-stat-value">{skills.length}</span></div>
              </div>
            </div>
          )}
        </div>

        <footer className="cs-card-footer">
          {activeIndex > 0 ? (
            <button type="button" className="cs-btn" disabled={saving} onClick={() => void goTo(visibleSteps[activeIndex - 1].id)}>
              <ArrowLeft size={15} />Previous
            </button>
          ) : <span />}

          {isManageMode ? (
            <div style={{ display: 'flex', gap: 8 }}>
              {activeIndex < visibleSteps.length - 1 ? (
                <button type="button" className="cs-btn" disabled={saving} onClick={() => void goTo(visibleSteps[activeIndex + 1].id)}>
                  Next section<ArrowRight size={15} />
                </button>
              ) : (
                <button type="button" className="cs-btn cs-btn-primary" onClick={() => (onFinish ? onFinish() : navigate('/overview'))}>
                  <Check size={15} />Done editing
                </button>
              )}
            </div>
          ) : step === 'review' ? (
            <button type="button" className="cs-btn cs-btn-primary" disabled={completing} onClick={() => void completeOnboarding()}>
              {completing ? <LoaderCircle size={15} className="cs-spin" /> : <Check size={15} />}
              {completing ? 'Completing setup…' : 'Complete setup & open workspace'}
            </button>
          ) : (
            <button type="button" className="cs-btn cs-btn-primary" disabled={saving} onClick={() => void goTo(visibleSteps[activeIndex + 1].id)}>
              {saving ? <LoaderCircle size={15} className="cs-spin" /> : null}
              Save & continue<ArrowRight size={15} />
            </button>
          )}
        </footer>
      </div>
    </div>
  );

  if (isManageMode) return content;

  return (
    <div className="cs-onboarding-screen">
      <header className="cs-onboarding-topbar">
        <span className="cs-brand">
          <span className="cs-brand-mark"><Sparkles size={15} strokeWidth={2.2} /></span>
          <span>career<span className="cs-brand-muted">scout</span></span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="cs-badge">{user.displayName}</span>
          <button type="button" className="cs-btn cs-btn-sm cs-btn-ghost" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
        </div>
      </header>

      <main className="cs-onboarding-wrap">
        <div className="cs-page-head">
          <div>
            <h1>Set up your career profile</h1>
            <p>Your profile grounds every job match score, resume extraction check, and tailored draft.</p>
          </div>
          <span className="cs-badge cs-badge-accent cs-tabular">{progress}% complete</span>
        </div>
        <div className="cs-progress-bar">
          <div className="cs-progress-fill" style={{ width: `${Math.max(8, progress)}%` }} />
        </div>
        {content}
      </main>
    </div>
  );
}
