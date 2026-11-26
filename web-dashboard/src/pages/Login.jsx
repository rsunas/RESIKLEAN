import { Button } from '@heroui/react';
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
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState('request');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [isRecovering, setIsRecovering] = useState(false);
  const [verificationMode, setVerificationMode] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationError, setVerificationError] = useState('');
  const [verificationMessage, setVerificationMessage] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  function openRecovery() {
    setRecoveryMode(true);
    setRecoveryStep('request');
    setRecoveryEmail(email);
    setResetCode('');
    setNewPassword('');
    setConfirmPassword('');
    setRecoveryError('');
    setRecoveryMessage('');
  }

  function closeRecovery() {
    setRecoveryMode(false);
    setRecoveryError('');
    setRecoveryMessage('');
  }

  function openVerification() {
    setVerificationMode(true);
    setVerificationEmail(email);
    setVerificationCode('');
    setVerificationError('');
    setVerificationMessage('');
  }

  function closeVerification() {
    setVerificationMode(false);
    setVerificationError('');
    setVerificationMessage('');
  }

  async function resendVerification(event) {
    event.preventDefault();
    if (!API_URL) {
      setVerificationError('VITE_API_URL is not configured.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(verificationEmail.trim())) {
      setVerificationError('Enter a valid email address.');
      return;
    }
    setVerificationError('');
    setIsVerifying(true);
    try {
      const response = await fetch(`${API_URL.replace(/\/$/, '')}/auth/resend-verification`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: verificationEmail.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to resend the verification email.');
      setVerificationMessage(result.data?.message || 'Check your inbox and spam folder for a verification code.');
    } catch (caughtError) {
      setVerificationError(caughtError instanceof Error ? caughtError.message : 'Unable to resend the verification email.');
    } finally {
      setIsVerifying(false);
    }
  }

  async function verifyEmail(event) {
    event.preventDefault();
    if (!API_URL) {
      setVerificationError('VITE_API_URL is not configured.');
      return;
    }
    if (!/^[a-f0-9]{64}$/i.test(verificationCode.trim())) {
      setVerificationError('Paste the full verification code from your email.');
      return;
    }
    setVerificationError('');
    setIsVerifying(true);
    try {
      const response = await fetch(`${API_URL.replace(/\/$/, '')}/auth/verify-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: verificationCode.trim().toLowerCase() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to verify your email.');
      setVerificationMessage(result.data?.message || 'Email verified. You can now sign in.');
      setVerificationCode('');
    } catch (caughtError) {
      setVerificationError(caughtError instanceof Error ? caughtError.message : 'Unable to verify your email.');
    } finally {
      setIsVerifying(false);
    }
  }

  async function requestPasswordReset(event) {
    event.preventDefault();
    if (!API_URL) {
      setRecoveryError('VITE_API_URL is not configured.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail.trim())) {
      setRecoveryError('Enter a valid email address.');
      return;
    }

    setRecoveryError('');
    setIsRecovering(true);
    try {
      const response = await fetch(`${API_URL.replace(/\/$/, '')}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail.trim(), codeFormat: 'six-digit' }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Unable to send reset instructions.');
      }
      setRecoveryMessage(result.data?.message || 'Check your inbox and spam folder for password reset instructions.');
      setResetCode('');
      setRecoveryStep('reset');
    } catch (caughtError) {
      setRecoveryError(caughtError instanceof Error ? caughtError.message : 'Unable to send reset instructions.');
    } finally {
      setIsRecovering(false);
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    if (!API_URL) {
      setRecoveryError('VITE_API_URL is not configured.');
      return;
    }
    if (!/^(?:\d{6}|[a-f0-9]{64})$/.test(resetCode.trim())) {
      setRecoveryError('Enter the six-digit reset code from your email.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail.trim())) {
      setRecoveryError('Enter the email address that received the code.');
      return;
    }
    if (newPassword.trim().length < 6) {
      setRecoveryError('Use a password with at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setRecoveryError('The passwords do not match.');
      return;
    }

    setRecoveryError('');
    setIsRecovering(true);
    try {
      const response = await fetch(`${API_URL.replace(/\/$/, '')}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail.trim(), token: resetCode.trim(), password: newPassword }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Unable to reset your password.');
      }
      setRecoveryMessage(result.data?.message || 'Password updated. Sign in with your new password.');
      setRecoveryStep('complete');
      setResetCode('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (caughtError) {
      setRecoveryError(caughtError instanceof Error ? caughtError.message : 'Unable to reset your password.');
    } finally {
      setIsRecovering(false);
    }
  }

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
        {verificationMode ? <form className="login-form login-recovery-form" onSubmit={verifyEmail} aria-busy={isVerifying}>
          <div className="login-heading"><p className="login-eyebrow">ACCOUNT ACTIVATION</p><h1 id="login-title">Verify your email</h1><p>Admin-created accounts must verify their inbox before signing in or using password recovery.</p></div>
          <div className="login-fields">
            <div className="login-field"><label htmlFor="verification-email">Email address</label><div className={`login-input-wrap${verificationError ? ' has-error' : ''}`}><FieldIcon type="mail" /><input id="verification-email" type="email" value={verificationEmail} onChange={(event) => setVerificationEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required /></div></div>
            <div className="login-field"><label htmlFor="verification-code">Verification code</label><div className={`login-input-wrap${verificationError ? ' has-error' : ''}`}><FieldIcon type="lock" /><input id="verification-code" type="text" value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} autoComplete="one-time-code" autoCapitalize="none" placeholder="Paste the code from your email" required /></div></div>
          </div>
          {verificationError ? <p className="login-error" role="alert">{verificationError}</p> : null}
          {verificationMessage ? <p className="login-recovery-message" role="status">{verificationMessage}</p> : null}
          <Button variant="tertiary" className="login-submit" type="submit" isDisabled={isVerifying}>{isVerifying ? 'Verifying...' : 'Verify email'}</Button>
          <Button variant="tertiary" className="login-recovery-link" type="button" isDisabled={isVerifying} onPress={resendVerification}>{isVerifying ? 'Please wait...' : 'Resend verification email'}</Button>
          <Button variant="tertiary" className="login-recovery-back" type="button" onPress={closeVerification}>Back to sign in</Button>
        </form> : recoveryMode ? <form className="login-form login-recovery-form" onSubmit={recoveryStep === 'request' ? requestPasswordReset : resetPassword} aria-busy={isRecovering}>
          <div className="login-heading">
            <p className="login-eyebrow">ACCOUNT RECOVERY</p>
            <h1 id="login-title">{recoveryStep === 'complete' ? 'Password updated' : 'Reset password'}</h1>
            <p>{recoveryStep === 'request' ? 'Enter your registered email to receive a six-digit reset code.' : recoveryStep === 'reset' ? 'Enter the reset code from your email and choose a new password.' : 'Sign in with your new password.'}</p>
          </div>

          {recoveryStep === 'request' || recoveryStep === 'reset' ? <div className="login-fields">
            <div className="login-field">
              <label htmlFor="recovery-email">Email address</label>
              <div className={`login-input-wrap${recoveryError ? ' has-error' : ''}`}><FieldIcon type="mail" /><input id="recovery-email" name="email" type="email" value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} autoComplete="email" aria-describedby={recoveryError ? 'recovery-error' : undefined} placeholder="you@example.com" required /></div>
            </div>
          </div> : null}

          {recoveryStep === 'reset' ? <div className="login-fields">
            <div className="login-field">
              <label htmlFor="reset-code">Reset code</label>
              <div className={`login-input-wrap${recoveryError ? ' has-error' : ''}`}><FieldIcon type="lock" /><input id="reset-code" name="reset-code" type="text" inputMode="numeric" maxLength={64} value={resetCode} onChange={(event) => setResetCode(event.target.value)} autoComplete="one-time-code" autoCapitalize="none" aria-describedby={recoveryError ? 'recovery-error' : undefined} placeholder="Six-digit code" required /></div>
            </div>
            <div className="login-field">
              <label htmlFor="new-password">New password</label>
              <div className={`login-input-wrap login-password-wrap${recoveryError ? ' has-error' : ''}`}><FieldIcon type="lock" /><input id="new-password" name="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" aria-describedby={recoveryError ? 'recovery-error' : undefined} placeholder="At least 6 characters" required minLength="6" /></div>
            </div>
            <div className="login-field">
              <label htmlFor="confirm-password">Confirm new password</label>
              <div className={`login-input-wrap login-password-wrap${recoveryError ? ' has-error' : ''}`}><FieldIcon type="lock" /><input id="confirm-password" name="confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" aria-describedby={recoveryError ? 'recovery-error' : undefined} placeholder="Re-enter your new password" required minLength="6" /></div>
            </div>
          </div> : null}

          {recoveryError ? <p className="login-error" id="recovery-error" role="alert">{recoveryError}</p> : null}
          {recoveryMessage ? <p className="login-recovery-message" role="status">{recoveryMessage}</p> : null}
          {recoveryStep !== 'complete' ? <Button variant="tertiary" className="login-submit" type="submit" isDisabled={isRecovering}>{isRecovering ? recoveryStep === 'request' ? 'Sending...' : 'Updating...' : recoveryStep === 'request' ? 'Send reset code' : 'Reset password'}</Button> : null}
          {recoveryStep === 'reset' ? <Button variant="tertiary" className="login-recovery-link" type="button" isDisabled={isRecovering} onPress={() => { setRecoveryStep('request'); setRecoveryError(''); }}>Request a new code</Button> : null}
          <Button variant="tertiary" className="login-recovery-back" type="button" onPress={closeRecovery}>Back to sign in</Button>
        </form> : <form className="login-form" onSubmit={handleSubmit} aria-busy={isSubmitting}>
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
            <div className={`login-input-wrap login-password-wrap${error ? ' has-error' : ''}`}><FieldIcon type="lock" /><input id="password" name="password" type={isPasswordVisible ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" aria-describedby={error ? 'login-error' : undefined} placeholder="Enter your password" required /><Button variant="tertiary" aria-label={isPasswordVisible ? 'Hide password' : 'Show password'} id="login-password-toggle" className="login-password-toggle" onPress={() => setIsPasswordVisible((visible) => !visible)} type="button"><EyeIcon hidden={isPasswordVisible} /></Button></div>
          </div>
        </div>

        {error ? <p className="login-error" id="login-error" role="alert">{error}</p> : null}
        <Button variant="tertiary" id="login-submit" className="login-submit" type="submit" isDisabled={isSubmitting}>{isSubmitting ? 'Signing in…' : <><span>Sign in</span><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></>}</Button>
        <Button variant="tertiary" className="login-recovery-link" id="forgot-password-link" type="button" onPress={openRecovery}>Forgot password?</Button>
        <p className="login-note"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="m8 12 3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg><span>Secure access for authorized SWMO administrators</span></p>
        </form>}
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
