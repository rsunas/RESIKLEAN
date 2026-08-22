import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
    <main className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-brand">
          <div className="auth-brand-mark">R</div>
          <div><strong>ResiKlean</strong><span>SWMO administrator</span></div>
        </div>
        <div className="auth-heading">
          <p className="eyebrow">ADMIN PORTAL</p>
          <h1>Welcome back</h1>
          <p>Sign in to manage collection operations and landfill activity.</p>
        </div>

        <div className="auth-fields">
          <div className="auth-field">
            <label htmlFor="email">Email address</label>
            <div className="auth-input-wrap"><FieldIcon type="mail" /><input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required /></div>
          </div>
          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <div className="auth-input-wrap"><FieldIcon type="lock" /><input id="password" type={isPasswordVisible ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Enter your password" required /><button aria-label={isPasswordVisible ? 'Hide password' : 'Show password'} className="password-toggle" onClick={() => setIsPasswordVisible((visible) => !visible)} type="button"><EyeIcon hidden={isPasswordVisible} /></button></div>
          </div>
        </div>

        {error ? <p className="error" role="alert">{error}</p> : null}
        <button className="auth-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : <span>Sign in <span aria-hidden="true">→</span></span>}</button>
        <p className="auth-note"><span aria-hidden="true">✦</span> Secure access for authorized SWMO administrators</p>
      </form>
    </main>
  );
}
