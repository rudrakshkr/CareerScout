import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, BriefcaseBusiness, Eye, EyeOff, LockKeyhole, Search, Sparkles, Users } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider';

function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="About CareerScout">
        <Link className="auth-brand" to="/login" aria-label="CareerScout home">
          <span className="brand-mark"><Sparkles size={17} strokeWidth={2.2} /></span>
          <span>career<span className="brand-light">scout</span></span>
        </Link>
        <div className="auth-story-content">
          <span className="auth-eyebrow"><span /> YOUR CAREER WORKSPACE</span>
          <h1>A more intentional way to find your next opportunity.</h1>
          <p>Bring job discovery, company research and application preparation into one private workspace on your computer.</p>
          <div className="auth-feature-list">
            <div><span><Search size={16}/></span><div><strong>Discover with context</strong><small>Find roles that fit your skills and preferences.</small></div></div>
            <div><span><BriefcaseBusiness size={16}/></span><div><strong>Prepare with confidence</strong><small>Keep your applications and documents organized.</small></div></div>
            <div><span><Users size={16}/></span><div><strong>Keep control</strong><small>Review every message and application before it leaves your device.</small></div></div>
          </div>
        </div>
        <div className="auth-story-footer"><LockKeyhole size={13}/> Local-first by design <span>·</span> Your workspace, your decisions</div>
        <div className="auth-orbit auth-orbit-one" />
        <div className="auth-orbit auth-orbit-two" />
      </section>
      <section className="auth-form-side">
        <div className="auth-mobile-brand"><span className="brand-mark"><Sparkles size={17} strokeWidth={2.2} /></span><span>career<span className="brand-light">scout</span></span></div>
        <div className="auth-form-wrap">{children}</div>
        <p className="auth-form-footer">CareerScout <span>·</span> Local-first career intelligence</p>
      </section>
    </main>
  );
}

function FormError({ children }: { children: string }) {
  return children ? <div className="auth-error" role="alert">{children}</div> : null;
}

function PasswordField({
  id, label, value, onChange, autoComplete, placeholder = 'Enter your password',
}: {
  id: string; label: string; value: string; onChange: (value: string) => void;
  autoComplete: string; placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-input-wrap">
        <LockKeyhole size={16} aria-hidden="true" />
        <input id={id} name={id} type={visible ? 'text' : 'password'} value={value}
          onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete}
          placeholder={placeholder} required />
        <button className="password-toggle" type="button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible((current) => !current)}>
          {visible ? <EyeOff size={16}/> : <Eye size={16}/>}
        </button>
      </div>
    </div>
  );
}

function getReturnPath(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('from' in state)) return '/';
  const from = state.from;
  if (typeof from !== 'object' || from === null || !('pathname' in from)) return '/';
  const pathname = from.pathname;
  return typeof pathname === 'string' && pathname.startsWith('/') && !pathname.startsWith('//') ? pathname : '/';
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
      <div className="auth-heading"><span className="auth-step-label">WELCOME BACK</span><h2>Sign in to CareerScout</h2><p>Pick up where your job search left off.</p></div>
      <form className="auth-form" onSubmit={handleSubmit}>
        <FormError>{error}</FormError>
        <div className="auth-field"><label htmlFor="login-email">Email address</label><input id="login-email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" maxLength={254} required autoFocus /></div>
        <PasswordField id="login-password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
        <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'} <ArrowRight size={16}/></button>
      </form>
      <p className="auth-switch">New to CareerScout? <Link to="/register">Create an account</Link></p>
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
    if (password !== confirmPassword) { setError('Your passwords do not match.'); return; }
    setSubmitting(true);
    try {
      await register(displayName.trim(), email.trim(), password);
      navigate('/', { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create your account. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFrame>
      <div className="auth-heading"><span className="auth-step-label">GET STARTED</span><h2>Create your workspace</h2><p>Set up your account. You can build your professional profile next.</p></div>
      <form className="auth-form auth-register-form" onSubmit={handleSubmit}>
        <FormError>{error}</FormError>
        <div className="auth-field"><label htmlFor="register-name">Full name</label><input id="register-name" name="displayName" type="text" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" autoComplete="name" minLength={2} maxLength={80} required autoFocus /></div>
        <div className="auth-field"><label htmlFor="register-email">Email address</label><input id="register-email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" maxLength={254} required /></div>
        <PasswordField id="register-password" label="Password" value={password} onChange={setPassword} autoComplete="new-password" />
        <PasswordField id="confirm-password" label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" placeholder="Enter your password again" />
        <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? 'Creating account…' : 'Create account'} <ArrowRight size={16}/></button>
        <p className="auth-privacy-note"><LockKeyhole size={13}/> Your account and career profile stay in your local CareerScout workspace.</p>
      </form>
      <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
    </AuthFrame>
  );
}

export function AuthUnavailablePage() {
  const { error, refresh } = useAuth();
  const [retrying, setRetrying] = useState(false);
  return (
    <main className="auth-status-page"><div className="auth-status-card">
      <span className="brand-mark"><Sparkles size={17}/></span>
      <h1>CareerScout can't reach its local API.</h1><p>{error || 'Start the local server, then try again.'}</p>
      <button className="auth-submit" type="button" disabled={retrying} onClick={async () => { setRetrying(true); await refresh(); setRetrying(false); }}>{retrying ? 'Checking…' : 'Try again'} <ArrowRight size={16}/></button>
      <small>From your repository, run <code>npm run dev</code>.</small>
    </div></main>
  );
}

export function AuthLoadingPage() {
  return <main className="auth-status-page"><div className="auth-loading"><span className="auth-spinner"/><p>Checking your CareerScout session…</p></div></main>;
}
