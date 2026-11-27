import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Circle,
  Compass,
  FileCheck2,
  FileText,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Terminal,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from './auth/AuthProvider';
import { useTheme } from './theme/ThemeProvider';
import { onboardingApi, type OnboardingData } from './onboarding/onboardingApi';
import { OnboardingPage } from './onboarding/OnboardingPage';
import ResumeManager from './onboarding/ResumeManager';
import CommandPalette from './components/CommandPalette';
import { discoveryApi, type DiscoverySummary } from './discovery/discoveryApi';
import DiscoverPage from './discovery/DiscoverPage';
import OutreachPage from './discovery/OutreachPage';
import CompaniesContactsPage from './discovery/CompaniesContactsPage';
import { ApplicationsView, ResearchRunnerView } from './discovery/ResearchAndApplications';
import SettingsIntegrations from './discovery/SettingsIntegrations';

type SectionId =
  | 'overview'
  | 'discover'
  | 'resumes'
  | 'companies'
  | 'contacts'
  | 'applications'
  | 'outreach'
  | 'reviewed'
  | 'research'
  | 'profile'
  | 'settings';

const navGroups: Array<{
  title: string;
  items: Array<{ id: SectionId; label: string; path: string; icon: typeof LayoutDashboard }>;
}> = [
  {
    title: 'Workspace',
    items: [
      { id: 'overview', label: 'Overview', path: '/overview', icon: LayoutDashboard },
      { id: 'discover', label: 'Discover jobs', path: '/discover', icon: Compass },
      { id: 'resumes', label: 'Resume Studio', path: '/resumes', icon: FileText },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { id: 'companies', label: 'Companies', path: '/companies', icon: Building2 },
      { id: 'contacts', label: 'People & contacts', path: '/contacts', icon: Users },
    ],
  },
  {
    title: 'Pipeline',
    items: [
      { id: 'applications', label: 'Applications', path: '/applications', icon: BriefcaseBusiness },
      { id: 'outreach', label: 'Outreach drafts', path: '/outreach', icon: Mail },
      { id: 'reviewed', label: 'Reviewed drafts', path: '/reviewed', icon: FileCheck2 },
      { id: 'research', label: 'Research runner', path: '/research', icon: Terminal },
    ],
  },
  {
    title: 'Account',
    items: [
      { id: 'profile', label: 'Profile Hub', path: '/profile/personal', icon: UserRound },
      { id: 'settings', label: 'Settings', path: '/settings', icon: Settings },
    ],
  },
];

const sectionHeaderCopy: Record<SectionId, { title: string; subtitle: string }> = {
  overview: { title: 'Workspace overview', subtitle: 'Live job matches, pending outreach approvals, and profile grounding readiness.' },
  discover: { title: 'Discover opportunities', subtitle: 'Jobs filtered strictly to your Target Roles with recency, pay, remote/hybrid/on-site, and national/international filters.' },
  resumes: { title: 'Resume Studio', subtitle: 'Upload local PDF/DOCX resumes, manage your primary CV, and review extracted profile facts.' },
  companies: { title: 'Companies', subtitle: 'Employers discovered from matched roles with ATS links, open roles, and contact counts.' },
  contacts: { title: 'People & contacts', subtitle: 'Source-backed hiring managers, recruiters, and engineers discovered for matched companies.' },
  applications: { title: 'Applications pipeline', subtitle: 'Track saved roles, preparation, submissions, and interview stages.' },
  outreach: { title: 'Outreach drafts', subtitle: 'Pending review inbox. Approved and rejected drafts move automatically to Reviewed drafts.' },
  reviewed: { title: 'Reviewed drafts', subtitle: 'Approved drafts ready to send, sent outreach history, and rejected proposals.' },
  research: { title: 'Overnight research runner', subtitle: 'Configure multi-hour overnight runs or quick scans with live checkpoints and logs.' },
  profile: { title: 'Profile Hub', subtitle: 'Edit your verified personal details, education, experience, projects, skills, and target preferences.' },
  settings: { title: 'Settings & local runtime', subtitle: 'Manage appearance, local account security, and Ollama/Firecrawl/SMTP configuration.' },
};

function resolveSection(pathname: string): SectionId {
  const segment = pathname.split('/')[1] || 'overview';
  if (segment in sectionHeaderCopy) return segment as SectionId;
  return 'overview';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return 'CS';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function Dashboard() {
  const { user, logout, refresh } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const activeSection = resolveSection(location.pathname);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [apiStatus, setApiStatus] = useState<'checking' | 'connected' | 'offline'>('checking');
  const [profileData, setProfileData] = useState<OnboardingData | null>(null);
  const [discoverySummary, setDiscoverySummary] = useState<DiscoverySummary | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const loadSnapshot = useCallback(async () => {
    try {
      const [profileRes, summaryRes] = await Promise.all([
        onboardingApi.get(),
        discoveryApi.summary(),
      ]);
      setProfileData(profileRes);
      setDiscoverySummary(summaryRes);
    } catch {
      // Keep previous snapshot on transient errors.
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
    setMobileNavOpen(false);
  }, [loadSnapshot, activeSection]);

  useEffect(() => {
    let active = true;
    const checkHealth = async () => {
      try {
        const response = await fetch('/api/health', { headers: { accept: 'application/json' } });
        if (!active) return;
        setApiStatus(response.ok ? 'connected' : 'offline');
      } catch {
        if (active) setApiStatus('offline');
      }
    };
    void checkHealth();
    const timer = window.setInterval(() => void checkHealth(), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCmdOpen((prev) => !prev);
      } else if (event.key === 'Escape') {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const readiness = useMemo(() => {
    const checks = [
      {
        label: 'Personal profile & links',
        detail: profileData?.profile.currentTitle || 'Add title, phone, GitHub & LinkedIn',
        done: Boolean(profileData?.user.displayName && (profileData?.profile.githubUrl || profileData?.profile.linkedinUrl)),
        path: '/profile/personal',
      },
      {
        label: 'Education or work history',
        detail: `${profileData?.education.length ?? 0} education · ${profileData?.experience.length ?? 0} experience`,
        done: Boolean((profileData?.education.length ?? 0) > 0 || (profileData?.experience.length ?? 0) > 0),
        path: '/profile/education',
      },
      {
        label: 'Verified projects',
        detail: `${profileData?.projects.length ?? 0} projects recorded`,
        done: Boolean((profileData?.projects.length ?? 0) > 0),
        path: '/profile/projects',
      },
      {
        label: 'Technical skills',
        detail: `${profileData?.skills.length ?? 0} skills listed`,
        done: Boolean((profileData?.skills.length ?? 0) > 0),
        path: '/profile/skills',
      },
      {
        label: 'Target roles & locations',
        detail: `${profileData?.preferredRoles.length ?? 0} roles · ${profileData?.preferredLocations.length ?? 0} locations`,
        done: Boolean((profileData?.preferredRoles.length ?? 0) > 0 && (profileData?.preferredLocations.length ?? 0) > 0),
        path: '/profile/preferences',
      },
      {
        label: 'Primary resume uploaded',
        detail: profileData?.resumes.find((r) => r.isPrimary)?.originalFilename || 'Upload PDF or DOCX in Resume Studio',
        done: Boolean((profileData?.resumes.length ?? 0) > 0),
        path: '/resumes',
      },
    ];
    const completed = checks.filter((c) => c.done).length;
    const percent = Math.round((completed / checks.length) * 100);
    return { checks, completed, total: checks.length, percent };
  }, [profileData]);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setSigningOut(false);
    }
  }

  function go(path: string) {
    navigate(path);
    setMobileNavOpen(false);
  }

  const headerCopy = sectionHeaderCopy[activeSection];

  function getNavCount(id: SectionId): number | undefined {
    if (id === 'resumes') return profileData?.resumes.length;
    if (!discoverySummary) return undefined;
    if (id === 'discover') return discoverySummary.counts.totalJobs;
    if (id === 'companies') return discoverySummary.counts.companies;
    if (id === 'contacts') return discoverySummary.counts.contacts;
    if (id === 'applications') return discoverySummary.counts.applicationsActive;
    if (id === 'outreach') return discoverySummary.counts.pendingDrafts;
    if (id === 'reviewed') return discoverySummary.counts.approvedDrafts + (discoverySummary.counts.rejectedDrafts ?? 0);
    return undefined;
  }

  return (
    <div className={`cs-shell${collapsed ? ' collapsed' : ''}${mobileNavOpen ? ' mobile-open' : ''}`}>
      <div className="cs-mobile-nav-backdrop" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />

      <aside className="cs-sidebar" aria-label="Main navigation">
        <div className="cs-sidebar-top">
          <button
            type="button"
            className="cs-brand"
            style={{ background: 'transparent', border: 0, padding: 0 }}
            onClick={() => go('/overview')}
          >
            <span className="cs-brand-mark"><Sparkles size={15} strokeWidth={2.2} /></span>
            <span className="cs-brand-text">career<span className="cs-brand-muted">scout</span></span>
          </button>
          <button
            type="button"
            className="cs-btn cs-btn-icon cs-btn-ghost cs-sidebar-mobile-close"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation menu"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="cs-nav">
          {navGroups.map((group) => (
            <div key={group.title}>
              <div className="cs-nav-group-label">{group.title}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                const badgeCount = getNavCount(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`cs-nav-item${isActive ? ' active' : ''}`}
                    onClick={() => go(item.path)}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon size={16} />
                    <span className="cs-nav-label">{item.label}</span>
                    {badgeCount !== undefined && badgeCount > 0 && (
                      <span className="cs-nav-count">{badgeCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="cs-sidebar-footer">
          <div className="cs-user-card">
            <div className="cs-avatar">{initials(user?.displayName ?? 'CS')}</div>
            <div className="cs-user-meta">
              <strong>{user?.displayName ?? 'Local User'}</strong>
              <span>{user?.email ?? ''}</span>
            </div>
          </div>
          <button
            type="button"
            className="cs-nav-item"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            title={collapsed ? 'Sign out' : undefined}
          >
            <LogOut size={15} />
            <span className="cs-nav-label">{signingOut ? 'Signing out…' : 'Sign out'}</span>
          </button>
        </div>
      </aside>

      <div className="cs-main">
        <header className="cs-topbar">
          <div className="cs-topbar-left">
            <button
              type="button"
              className="cs-btn cs-btn-icon cs-btn-ghost cs-mobile-menu-btn"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu size={17} />
            </button>
            <button
              type="button"
              className="cs-btn cs-btn-icon cs-btn-ghost cs-desktop-collapse-btn"
              onClick={() => setCollapsed((prev) => !prev)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
            <div className="cs-breadcrumbs">
              <span>CareerScout</span>
              <span>/</span>
              <strong>{headerCopy.title}</strong>
            </div>
          </div>

          <div className="cs-topbar-right">
            <button type="button" className="cs-cmd-trigger" onClick={() => setCmdOpen(true)}>
              <Search size={14} />
              <span>Jump to…</span>
              <span className="cs-kbd">Ctrl K</span>
            </button>

            <div className="cs-status-pill" title="Local Express API health">
              <span className={`cs-dot ${apiStatus}`} />
              <span>{apiStatus === 'connected' ? 'API Online' : apiStatus === 'offline' ? 'API Offline' : 'Checking…'}</span>
            </div>

            <button
              type="button"
              className="cs-btn cs-btn-icon"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </header>

        <main className="cs-page">
          <div className="cs-page-head">
            <div>
              <h1>{headerCopy.title}</h1>
              <p>{headerCopy.subtitle}</p>
            </div>
            {activeSection === 'overview' && (
              <div className="cs-action-wrap">
                <button type="button" className="cs-btn" onClick={() => go('/research')}>
                  <Moon size={15} />Overnight runner
                </button>
                <button type="button" className="cs-btn cs-btn-primary" onClick={() => go('/discover')}>
                  <Play size={15} />Discover jobs
                </button>
              </div>
            )}
          </div>

          {activeSection === 'overview' && (
            <>
              <section className="cs-stat-grid" aria-label="Workspace metrics">
                <div className="cs-card cs-stat-card" style={{ cursor: 'pointer' }} onClick={() => go('/discover')}>
                  <div className="cs-stat-top">
                    <span>Target-role matches</span>
                    <span className="cs-stat-icon"><Compass size={15} /></span>
                  </div>
                  <span className="cs-stat-value">{discoverySummary?.counts.totalJobs ?? 0}</span>
                  <span className="cs-stat-note cs-tabular">{discoverySummary?.counts.strongMatches ?? 0} strong matches (65%+)</span>
                </div>

                <div className="cs-card cs-stat-card" style={{ cursor: 'pointer' }} onClick={() => go('/outreach')}>
                  <div className="cs-stat-top">
                    <span>Drafts awaiting review</span>
                    <span className="cs-stat-icon"><Mail size={15} /></span>
                  </div>
                  <span className="cs-stat-value">{discoverySummary?.counts.pendingDrafts ?? 0}</span>
                  <span className="cs-stat-note cs-tabular">{discoverySummary?.counts.approvedDrafts ?? 0} approved / sent</span>
                </div>

                <div className="cs-card cs-stat-card" style={{ cursor: 'pointer' }} onClick={() => go('/contacts')}>
                  <div className="cs-stat-top">
                    <span>Companies & people</span>
                    <span className="cs-stat-icon"><Users size={15} /></span>
                  </div>
                  <span className="cs-stat-value">{discoverySummary?.counts.contacts ?? 0}</span>
                  <span className="cs-stat-note cs-tabular">Across {discoverySummary?.counts.companies ?? 0} companies</span>
                </div>

                <div className="cs-card cs-stat-card" style={{ cursor: 'pointer' }} onClick={() => go('/profile/personal')}>
                  <div className="cs-stat-top">
                    <span>Profile readiness</span>
                    <span className="cs-stat-icon"><ShieldCheck size={15} /></span>
                  </div>
                  <span className="cs-stat-value">{readiness.percent}%</span>
                  <span className="cs-stat-note cs-tabular">{profileData?.skills.length ?? 0} skills · {profileData?.projects.length ?? 0} projects</span>
                </div>
              </section>

              <section className="cs-two-col">
                <div className="cs-card">
                  <div className="cs-card-header">
                    <div>
                      <h2>Profile grounding checklist</h2>
                      <p>Every match score, cover letter, and outreach proposal is grounded strictly in these facts.</p>
                    </div>
                    <span className="cs-badge cs-badge-accent cs-tabular">{readiness.completed}/{readiness.total}</span>
                  </div>
                  <div className="cs-card-body">
                    <div className="cs-checklist">
                      {readiness.checks.map((item) => (
                        <div className="cs-checklist-row" key={item.label}>
                          <div className="cs-checklist-copy">
                            {item.done
                              ? <CheckCircle2 size={17} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
                              : <Circle size={17} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                            <div style={{ minWidth: 0 }}>
                              <strong>{item.label}</strong>
                              <span>{item.detail}</span>
                            </div>
                          </div>
                          <button type="button" className="cs-btn cs-btn-sm cs-btn-ghost" onClick={() => go(item.path)}>
                            {item.done ? 'Manage' : 'Set up'}<ArrowRight size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="cs-card">
                  <div className="cs-card-header">
                    <div>
                      <h2>Target roles & overnight status</h2>
                      <p>Only jobs aligned with these roles are saved during discovery.</p>
                    </div>
                  </div>
                  <div className="cs-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <span className="cs-label">Active target roles</span>
                      <div className="cs-chip-group" style={{ marginTop: 8, marginBottom: 0 }}>
                        {(profileData?.preferredRoles ?? []).length === 0 ? (
                          <span className="cs-hint">Add target roles in Profile Preferences first.</span>
                        ) : (
                          profileData!.preferredRoles.map((role) => (
                            <span className="cs-badge cs-badge-accent" key={role.id}>{role.title}</span>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="cs-kv-list">
                      <div className="cs-kv-row">
                        <span>Latest research run</span>
                        <strong>{discoverySummary?.latestRun ? `${discoverySummary.latestRun.mode} · ${discoverySummary.latestRun.status}` : 'None run yet'}</strong>
                      </div>
                      <div className="cs-kv-row">
                        <span>Work arrangement</span>
                        <strong>{profileData?.preferences?.workArrangement.replaceAll('_', ' ') ?? 'Not set'}</strong>
                      </div>
                      <div className="cs-kv-row">
                        <span>Compensation preference</span>
                        <strong>{profileData?.preferences?.paidPreference.replaceAll('_', ' ') ?? 'Not set'}</strong>
                      </div>
                    </div>

                    <div className="cs-action-wrap">
                      <button type="button" className="cs-btn cs-btn-primary" onClick={() => go('/research')}>
                        <Moon size={14} />Launch overnight run
                      </button>
                      <button type="button" className="cs-btn" onClick={() => go('/outreach')}>
                        Review drafts ({discoverySummary?.counts.pendingDrafts ?? 0})
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          {activeSection === 'discover' && <DiscoverPage onDataChanged={() => void loadSnapshot()} />}
          {activeSection === 'outreach' && <OutreachPage mode="inbox" onDataChanged={() => void loadSnapshot()} />}
          {activeSection === 'reviewed' && <OutreachPage mode="reviewed" onDataChanged={() => void loadSnapshot()} />}
          {activeSection === 'companies' && <CompaniesContactsPage view="companies" />}
          {activeSection === 'contacts' && <CompaniesContactsPage view="contacts" />}
          {activeSection === 'applications' && <ApplicationsView onDataChanged={() => void loadSnapshot()} />}
          {activeSection === 'research' && <ResearchRunnerView onDataChanged={() => void loadSnapshot()} />}
          {activeSection === 'resumes' && <ResumeManager onResumesChanged={() => void loadSnapshot()} />}

          {activeSection === 'profile' && user && (
            <OnboardingPage
              user={user}
              mode="manage"
              onComplete={async () => {
                await refresh();
                await loadSnapshot();
              }}
              onFinish={() => go('/overview')}
            />
          )}

          {activeSection === 'settings' && <SettingsIntegrations onChanged={() => void loadSnapshot()} />}
        </main>
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} onSignOut={() => void handleSignOut()} />
    </div>
  );
}
