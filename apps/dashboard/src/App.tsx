import { useEffect, useState, type ReactNode } from 'react';
import {
  Activity,
  ArrowUpRight,
  Bell,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  CircleHelp,
  FileText,
  LayoutDashboard,
  Search,
  Settings2,
  Sparkles,
  UserRoundSearch,
  Users,
  Zap,
} from 'lucide-react';

type Section =
  | 'Overview'
  | 'Discover jobs'
  | 'Companies'
  | 'People & contacts'
  | 'Applications'
  | 'Outreach drafts'
  | 'Research activity'
  | 'Settings';

type ApiState = 'checking' | 'connected' | 'offline';

const primaryNavigation: { label: Section; icon: typeof LayoutDashboard }[] = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Discover jobs', icon: Search },
  { label: 'Companies', icon: Building2 },
  { label: 'People & contacts', icon: Users },
];

const workflowNavigation: { label: Section; icon: typeof LayoutDashboard }[] = [
  { label: 'Applications', icon: BriefcaseBusiness },
  { label: 'Outreach drafts', icon: FileText },
  { label: 'Research activity', icon: Activity },
];

const sectionDescriptions: Record<Section, string> = {
  Overview: 'Your job search, company research and application work in one place.',
  'Discover jobs': 'Search results from your connected sources will appear here.',
  Companies: 'Keep track of companies, career pages and hiring activity.',
  'People & contacts': 'Review source-backed recruiter and hiring-team research.',
  Applications: 'Manage opportunities you have chosen to pursue.',
  'Outreach drafts': 'Review personalized messages before you send anything.',
  'Research activity': 'Monitor source runs, processing queues and errors.',
  Settings: 'Manage your profile, preferences and local integrations.',
};

function App() {
  const [activeSection, setActiveSection] = useState<Section>('Overview');
  const [apiState, setApiState] = useState<ApiState>('checking');

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/health', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('API health check failed');
        return response.json() as Promise<{ status?: string }>;
      })
      .then((payload) => setApiState(payload.status === 'ok' ? 'connected' : 'offline'))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setApiState('offline');
      });

    return () => controller.abort();
  }, []);

  const pageTitle = activeSection === 'Overview' ? 'Overview' : activeSection;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" onClick={() => setActiveSection('Overview')}>
          <span className="brand-mark"><Sparkles size={17} strokeWidth={2.2} /></span>
          <span>career<span className="brand-light">scout</span></span>
        </a>

        <div className="workspace-switcher">
          <div className="workspace-avatar">R</div>
          <div className="workspace-copy">
            <strong>Personal workspace</strong>
            <span>Local account setup next</span>
          </div>
          <ChevronDown size={15} className="muted-icon" />
        </div>

        <nav className="side-nav" aria-label="Main navigation">
          <span className="nav-label">Workspace</span>
          {primaryNavigation.map(({ label, icon: Icon }) => (
            <button
              className={`nav-item ${activeSection === label ? 'active' : ''}`}
              key={label}
              onClick={() => setActiveSection(label)}
              type="button"
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
              {label === 'Discover jobs' && <span className="nav-count">—</span>}
            </button>
          ))}

          <span className="nav-label nav-label-spaced">Application workflow</span>
          {workflowNavigation.map(({ label, icon: Icon }) => (
            <button
              className={`nav-item ${activeSection === label ? 'active' : ''}`}
              key={label}
              onClick={() => setActiveSection(label)}
              type="button"
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="local-note">
            <span className="local-note-icon"><Zap size={15} /></span>
            <div>
              <strong>Runs on your machine</strong>
              <p>Your profile and job data stay local.</p>
            </div>
          </div>
          <button
            className={`nav-item ${activeSection === 'Settings' ? 'active' : ''}`}
            onClick={() => setActiveSection('Settings')}
            type="button"
          >
            <Settings2 size={17} strokeWidth={1.8} />
            <span>Settings</span>
          </button>
          <button className="nav-item" type="button" onClick={() => window.alert('Documentation will be added as the project develops.')}>
            <CircleHelp size={17} strokeWidth={1.8} />
            <span>Help & documentation</span>
          </button>
          <div className="profile-row">
            <div className="profile-avatar">R</div>
            <div className="profile-copy">
              <strong>Profile not configured</strong>
              <span>Onboarding is next</span>
            </div>
            <ChevronDown size={15} className="muted-icon" />
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-divider">/</span><strong>{pageTitle}</strong></div>
          <div className="topbar-actions">
            <div className={`api-indicator ${apiState}`}>
              <span className="status-dot" />
              {apiState === 'connected' ? 'Local API connected' : apiState === 'offline' ? 'API offline' : 'Checking API'}
            </div>
            <button className="icon-button" aria-label="Notifications" type="button"><Bell size={17} /></button>
            <div className="top-avatar">R</div>
          </div>
        </header>

        <div className="page-content">
          <section className="welcome-row">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> YOUR CAREER WORKSPACE</div>
              <h1>{activeSection === 'Overview' ? 'Make your next move.' : activeSection}</h1>
              <p>{sectionDescriptions[activeSection]}</p>
            </div>
            <button className="primary-button" type="button" onClick={() => setActiveSection('Discover jobs')}>
              <Search size={16} /> Explore opportunities <ArrowUpRight size={15} />
            </button>
          </section>

          {activeSection === 'Overview' ? (
            <>
              <section className="stat-grid" aria-label="Job search summary">
                <StatCard label="New discoveries" value="—" note="Waiting for your first research run" icon={<Search size={17} />} />
                <StatCard label="Strong matches" value="—" note="Scored against your preferences" icon={<Sparkles size={17} />} />
                <StatCard label="Application ready" value="—" note="Prepared for your review" icon={<BriefcaseBusiness size={17} />} />
                <StatCard label="People to contact" value="—" note="Public professional leads" icon={<UserRoundSearch size={17} />} />
              </section>

              <section className="content-grid">
                <div className="panel discovery-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="panel-kicker">RESEARCH WORKSPACE</span>
                      <h2>Discovery runs</h2>
                    </div>
                    <span className="quiet-tag">Not started</span>
                  </div>
                  <div className="empty-research">
                    <div className="empty-icon"><Sparkles size={22} /></div>
                    <h3>Your first search starts here</h3>
                    <p>Once your profile and job preferences are configured, CareerScout can search permitted sources, collect listings and prepare a review queue.</p>
                    <button className="secondary-button" type="button" onClick={() => setActiveSection('Settings')}>
                      Set up your profile <ArrowUpRight size={15} />
                    </button>
                  </div>
                  <div className="panel-footnote"><span className="status-dot neutral" /> No background tasks are running</div>
                </div>

                <div className="panel setup-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="panel-kicker">GETTING STARTED</span>
                      <h2>Set up your workspace</h2>
                    </div>
                    <span className="setup-progress">0 / 4</span>
                  </div>
                  <div className="setup-list">
                    <SetupRow number="01" title="Create your local profile" description="Education, skills and experience" />
                    <SetupRow number="02" title="Add your master resume" description="Review the facts extracted from it" />
                    <SetupRow number="03" title="Set job preferences" description="Roles, locations and compensation" />
                    <SetupRow number="04" title="Connect discovery sources" description="Firecrawl, public feeds and APIs" />
                  </div>
                </div>
              </section>

              <section className="panel opportunities-panel">
                <div className="panel-heading opportunities-heading">
                  <div>
                    <span className="panel-kicker">YOUR REVIEW QUEUE</span>
                    <h2>Recently discovered opportunities</h2>
                  </div>
                  <button className="text-button" type="button" onClick={() => setActiveSection('Discover jobs')}>View all <ArrowUpRight size={14} /></button>
                </div>
                <div className="table-empty">
                  <div className="table-empty-icon"><FileText size={19} /></div>
                  <div><strong>No opportunities yet</strong><span>New listings will appear here after your first research run.</span></div>
                </div>
              </section>
            </>
          ) : (
            <section className="panel placeholder-panel">
              <div className="empty-icon"><Sparkles size={22} /></div>
              <h2>{activeSection} will live here</h2>
              <p>This section is part of the planned workspace. We are building the foundation first so it can connect to real user profiles, saved jobs and research data instead of showing fake demo records.</p>
              <button className="secondary-button" type="button" onClick={() => setActiveSection('Overview')}>
                Back to overview <ArrowUpRight size={15} />
              </button>
            </section>
          )}

          <footer className="page-footer">
            <span>CareerScout <span className="footer-dot">·</span> Local-first career intelligence</span>
            <span>Foundation build <span className="footer-dot">·</span> v0.1.0</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, note, icon }: { label: string; value: string; note: string; icon: ReactNode }) {
  return (
    <article className="stat-card">
      <div className="stat-card-top"><span>{label}</span><span className="stat-icon">{icon}</span></div>
      <strong className="stat-value">{value}</strong>
      <span className="stat-note">{note}</span>
    </article>
  );
}

function SetupRow({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="setup-row">
      <span className="setup-number">{number}</span>
      <div><strong>{title}</strong><span>{description}</span></div>
      <span className="setup-unchecked" />
    </div>
  );
}

export default App;
