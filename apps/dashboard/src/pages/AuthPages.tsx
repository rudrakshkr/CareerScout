import { useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  Terminal,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { useTheme } from '../theme/ThemeProvider';

function BrandMark() {
  return (
    <span className="cs-brand">
      <span className="cs-brand-mark"><Sparkles size={15} strokeWidth={2.2} /></span>
      <span>career<span className="cs-brand-muted">scout</span></span>
    </span>
  );
}

function AuthFrame({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <main className="cs-auth-shell">
      <aside className="cs-auth-aside" aria-label="About CareerScout">
        <div className="cs-auth-aside-top">
          <Link to="/login" aria-label="CareerScout home">
            <BrandMark />
          </Link>
        </div>

        <div className="cs-auth-aside-body">
          <span className="cs-badge cs-badge-accent">Local-First Career Workspace</span>
          <h1>Your job search, engineered with precision.</h1>
          <p>
            Manage verified profile facts, extract structured resume data, track applications, and prepare
            source-backed outreach from one private workspace on your machine.
          </p>

          <div className="cs-auth-pillars">
            <div className="cs-auth-pillar">
              <span className="cs-auth-pillar-icon"><ShieldCheck size={16} /></span>
              <div>
                <strong>Private & Multi-User by Design</strong>
                <span>Every account, resume file, and SQLite record stays strictly scoped on your device.</span>
              </div>
            </div>
            <div className="cs-auth-pillar">
              <span className="cs-auth-pillar-icon"><CheckCircle2 size={16} /></span>
              <div>
                <strong>Human Approval Always Required</strong>
                <span>No resume fact, email, or application is ever saved or sent without your explicit review.</span>
              </div>
            </div>
            <div className="cs-auth-pillar">
              <span className="cs-auth-pillar-icon"><Terminal size={16} /></span>
              <div>
                <strong>Ready for Local AI & Discovery</strong>
                <span>Built for local Ollama inference, explainable match scoring, and budgeted web discovery.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="cs-auth-aside-footer">
          <LockKeyhole size={13} />
          <span>Loopback-only API (127.0.0.1) · Zero cloud lock-in</span>
        </div>
      </aside>

      <section className="cs-auth-main">
        <div className="cs-auth-main-top">
          <Link className="cs-auth-mobile-brand" to="/login" aria-label="CareerScout home">
            <BrandMark />
          </Link>
          <button
            type="button"
            className="cs-btn cs-btn-sm cs-btn-ghost"
            onClick={toggleTheme}
            style={{ marginLeft: 'auto' }}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
        </div>

        <div className="cs-auth-card">{children}</div>
      </section>
    </main>
  );
}

function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder = 'Enter your password',
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder?: string;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="cs-field">
      <label className="cs-label" htmlFor={id}>{label}</label>
      <div className="cs-password-wrap">
        <input
          id={id}
          name={id}
          className="cs-input"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required
        />
        <button
          type="button"
          className="cs-password-toggle"
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {hint && <span className="cs-hint">{hint}</span>}
    </div>
  );
}

function getReturnPath(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('from' in state)) return '/overview';
  const from = state.from;
  if (typeof from !== 'object' || from === null || !('pathname' in from)) return '/overview';
  const pathname = from.pathname;
  return typeof pathname === 'string' && pathname.startsWith('/') && !pathname.startsWith('//')
    ? pathname
    : '/overview';
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(getReturnPath(location.state), { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFrame>
      <div className="cs-auth-card-head">
        <h2>Sign in to CareerScout</h2>
        <p>Pick up right where your job search left off.</p>
      </div>

      <form className="cs-auth-form" onSubmit={handleSubmit}>
        {error && <div className="cs-alert cs-alert-error" role="alert">{error}</div>}
        <div className="cs-field">
          <label className="cs-label" htmlFor="login-email">Email address</label>
          <input
            id="login-email"
            name="email"
            className="cs-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            maxLength={254}
            required
            autoFocus
          />
        </div>

        <PasswordInput
          id="login-password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />

        <button className="cs-btn cs-btn-primary" type="submit" disabled={submitting} style={{ width: '100%', minHeight: 40 }}>
          {submitting ? 'Signing in…' : 'Sign in'}
          <ArrowRight size={15} />
        </button>
      </form>

      <p className="cs-auth-switch">
        New to CareerScout? <Link to="/register">Create a local account</Link>
      </p>
    </AuthFrame>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Your passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await register(displayName.trim(), email.trim(), password);
      navigate('/onboarding', { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create your account. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFrame>
      <div className="cs-auth-card-head">
        <h2>Create your workspace</h2>
        <p>Set up an isolated local account for your profile and resumes.</p>
      </div>

      <form className="cs-auth-form" onSubmit={handleSubmit}>
        {error && <div className="cs-alert cs-alert-error" role="alert">{error}</div>}
        <div className="cs-field">
          <label className="cs-label" htmlFor="register-name">Full name</label>
          <input
            id="register-name"
            name="displayName"
            className="cs-input"
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Your full name"
            autoComplete="name"
            minLength={2}
            maxLength={80}
            required
            autoFocus
          />
        </div>

        <div className="cs-field">
          <label className="cs-label" htmlFor="register-email">Email address</label>
          <input
            id="register-email"
            name="email"
            className="cs-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            maxLength={254}
            required
          />
        </div>

        <PasswordInput
          id="register-password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          hint="Minimum 12 characters. Hashed locally with scrypt."
        />

        <PasswordInput
          id="confirm-password"
          label="Confirm password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          placeholder="Re-enter your password"
        />

        <button className="cs-btn cs-btn-primary" type="submit" disabled={submitting} style={{ width: '100%', minHeight: 40 }}>
          {submitting ? 'Creating account…' : 'Create account'}
          <ArrowRight size={15} />
        </button>
      </form>

      <p className="cs-auth-switch">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthFrame>
  );
}

export function AuthUnavailablePage() {
  const { error, refresh } = useAuth();
  const [retrying, setRetrying] = useState(false);

  return (
    <main className="cs-auth-status-page">
      <div className="cs-card cs-auth-status-card">
        <BrandMark />
        <h1>Local CareerScout API is offline</h1>
        <p>{error || 'Start the local server from your repository, then retry.'}</p>
        <button
          className="cs-btn cs-btn-primary"
          type="button"
          disabled={retrying}
          onClick={async () => {
            setRetrying(true);
            await refresh();
            setRetrying(false);
          }}
        >
          {retrying ? 'Checking connection…' : 'Retry connection'}
          <ArrowRight size={15} />
        </button>
        <p>Run <code>npm run dev</code> inside your repository directory.</p>
      </div>
    </main>
  );
}

export function AuthLoadingPage() {
  return (
    <main className="cs-auth-status-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-secondary)' }}>
        <Sparkles size={18} className="cs-spin" style={{ color: 'var(--accent-text)' }} />
        <span>Restoring your local CareerScout session…</span>
      </div>
    </main>
  );
}
