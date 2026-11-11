import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import illustration from '../assets/swmo-login-1600.webp';
import illustrationSmall from '../assets/swmo-login-800.webp';
import logo from '../assets/resiklean-logo.png';
import './Login.css';

const API_URL = import.meta.env.VITE_API_URL;

function FieldIcon({ type }) {
  if (type === 'mail') {
    return <svg aria-hidden="true" className="field-icon" fill="none" height="19" viewBox="0 0 24 24" width="19"><rect height="14" rx="2" stroke="currentColor" strokeWidth="1.8" width="18" x="3" y="5" /><path d="m4 7 8 6 8-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>;
  }
  return <svg aria-hidden="true" className="field-icon" fill="none" height="19" viewBox="0 0 24 24" width="19"><rect height="10" rx="2" stroke="currentColor" strokeWidth="1.8" width="14" x="5" y="10" /><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg>;
}

function EyeIcon({ hidden }) {
  return hidden
    ? <svg aria-hidden="true" fill="none" height="19" viewBox="0 0 24 24" width="19"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.7 10.7 0 0 1 12 5c5.2 0 8.4 4.7 9 6-.2.4-.8 1.5-1.8 2.6M6.2 6.2C4.1 7.6 2.8 9.6 2 11c.6 1.3 3.8 6 10 6 1 0 1.9-.2 2.7-.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" /></svg>
    : <svg aria-hidden="true" fill="none" height="19" viewBox="0 0 24 24" width="19"><path d="M2.5 12s3.2-6 9.5-6 9.5 6 9.5 6-3.2 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" /><circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.7" /></svg>;
}

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!API_URL) {
      setError('VITE_API_URL is not configured.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL.replace(/\/$/, '')}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Unable to sign in.');
      }

      if (result.data?.user?.role !== 'admin' || !result.data?.token) {
        throw new Error('This account does not have administrator access.');
      }

      sessionStorage.setItem('resiklean_admin_token', result.data.token);
      sessionStorage.setItem('resiklean_admin_user', JSON.stringify(result.data.user));

      navigate('/dashboard', { replace: true });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-sheet" aria-labelledby="login-title">
        <img alt="ResiKlean logo" className="login-logo" src={logo} width="1125" height="340" />
        <form className="login-form" onSubmit={handleSubmit} aria-busy={isSubmitting}>
        <div className="login-heading">
          <p className="login-eyebrow">ADMIN PORTAL</p>
          <h1 id="login-title">Welcome back</h1>
          <p>Sign in to manage collection operations and landfill activity.</p>
        </div>

        <div className="login-fields">
          <div className="login-field">
            <label htmlFor="email">Email address</label>
            <div className={`login-input-wrap${error ? ' has-error' : ''}`}><FieldIcon type="mail" /><input id="email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" aria-describedby={error ? 'login-error' : undefined} placeholder="you@example.com" required /></div>
          </div>
          <div className="login-field">
            <label htmlFor="password">Password</label>
            <div className={`login-input-wrap login-password-wrap${error ? ' has-error' : ''}`}><FieldIcon type="lock" /><input id="password" name="password" type={isPasswordVisible ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" aria-describedby={error ? 'login-error' : undefined} placeholder="Enter your password" required /><button aria-label={isPasswordVisible ? 'Hide password' : 'Show password'} className="login-password-toggle" onClick={() => setIsPasswordVisible((visible) => !visible)} type="button"><EyeIcon hidden={isPasswordVisible} /></button></div>
          </div>
        </div>

        {error ? <p className="login-error" id="login-error" role="alert">{error}</p> : null}
        <button className="login-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : <><span>Sign in</span><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></>}</button>
        <p className="login-note"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="m8 12 3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg><span>Secure access for authorized SWMO administrators</span></p>
        </form>
        <footer className="login-footer">Naga City Solid Waste Management</footer>
      </section>
      <aside className="login-art" aria-hidden="true">
        <picture>
        <source media="(min-width: 1024px)" srcSet={illustration} />
        <img className="login-illustration" src={illustration} srcSet={`${illustrationSmall} 800w, ${illustration} 1600w`} sizes="(max-width: 1023px) 100vw, calc(100vw - 656px)" width="1600" height="900" alt="" fetchPriority="high" />
        </picture>
        <div className="login-art-overlay" />
        <div className="login-art-caption">
          <span className="login-art-chip">SWMO · Naga City</span>
          <h2>Collection operations and landfill activity, in one place.</h2>
        </div>
      </aside>
    </main>
  );
}
