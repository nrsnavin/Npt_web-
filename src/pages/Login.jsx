import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Field, Notice } from '../components/ui.jsx';
import { ThemeToggle, Wordmark } from '../components/Layout.jsx';
import { LockScreen } from '../components/PinGate.jsx';

const RESEND_SECONDS = 60;

function Tabs({ mode, onChange }) {
  const tabs = [
    { id: 'password', label: 'Password' },
    { id: 'otp', label: 'One-time code' },
  ];

  return (
    <div role="tablist" aria-label="Sign-in method" className="tab-track mb-6 grid-cols-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`signin-tab-${tab.id}`}
          aria-selected={mode === tab.id}
          aria-controls={`signin-panel-${tab.id}`}
          onClick={() => onChange(tab.id)}
          className="tab"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** Email plus password. */
function PasswordForm({ onError }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { email: location.state?.email || '' } });

  const submit = async (values) => {
    onError(null);
    try {
      await login(values);
      navigate(location.state?.from && !location.state.from.startsWith('/login') ? location.state.from : '/', { replace: true });
    } catch (error) {
      onError(error.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <Field label="Email" error={errors.email} required>
        <input
          type="email"
          autoComplete="email"
          className="input"
          {...register('email', { required: 'Email is required' })}
        />
      </Field>

      <Field label="Password" error={errors.password} required>
        <input
          type="password"
          autoComplete="current-password"
          className="input"
          {...register('password', { required: 'Password is required' })}
        />
      </Field>

      <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>

      <p className="text-center text-sm">
        <Link to="/forgot-password" className="link-action">
          Forgot password?
        </Link>
      </p>
    </form>
  );
}

/**
 * Passwordless sign-in. Step one takes an email address or phone number,
 * step two takes the code that was sent to it.
 */
function OtpForm({ onError }) {
  const { requestOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState('identifier');
  const [identifier, setIdentifier] = useState('');
  const [sent, setSent] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const codeInput = useRef(null);

  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const timer = setTimeout(() => setSecondsLeft((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  useEffect(() => {
    if (step === 'code') codeInput.current?.focus();
  }, [step]);

  const send = async (event) => {
    event?.preventDefault();
    onError(null);
    setBusy(true);
    try {
      const data = await requestOtp(identifier);
      setSent(data);
      setStep('code');
      setSecondsLeft(RESEND_SECONDS);
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event) => {
    event.preventDefault();
    onError(null);
    setBusy(true);
    try {
      await verifyOtp(sent?.identifier || identifier, code);
      navigate(location.state?.from || '/', { replace: true });
    } catch (error) {
      onError(error.message);
      setCode('');
      codeInput.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  if (step === 'identifier') {
    return (
      <form onSubmit={send} className="space-y-4">
        <Field
          label="Email or phone number"
          hint="A one-time code — no password needed"
        required>
          <input
            className="input"
            autoComplete="username"
            placeholder="you@company.com or 98765 43210"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            required
          />
        </Field>

        <button type="submit" className="btn-primary w-full" disabled={busy || !identifier.trim()}>
          {busy ? 'Sending…' : 'Send code'}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      {sent?.onScreen ? (
        /* Email is switched off for now [server: STAFF_EMAIL]: the code is shown here, not sent anywhere. */
        <Notice tone="info">
          <span className="block text-xs">Email is switched off for now, so your sign-in code is shown here instead of sent.</span>
          <span className="mt-1 block font-mono text-2xl font-bold tracking-[0.4em] text-steel-50" aria-label="Your sign-in code">{sent.code}</span>
          <span className="block text-xs">It expires in {sent.expiresInMinutes || 5} minutes.</span>
        </Notice>
      ) : (
        <p className="text-sm leading-relaxed text-steel-300">
          Enter the {sent?.channel === 'sms' ? 'code we texted to' : 'code we emailed to'}{' '}
          <span className="font-semibold text-steel-50">{sent?.maskedIdentifier || identifier}</span>.
        </p>
      )}

      <Field label="Verification code" required>
        <input
          ref={codeInput}
          className="input py-3 text-center font-mono text-xl font-bold tracking-[0.5em] text-steel-50"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          placeholder="000000"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          required
        />
      </Field>

      {sent?.devCode && !sent?.onScreen && (
        <Notice tone="warn">
          <span className="text-xs">
            Development mode — no email or SMS provider is configured. Your code is{' '}
            <span className="font-mono text-sm font-bold tracking-widest text-warn-400">{sent.devCode}</span>.
          </span>
        </Notice>
      )}

      <button type="submit" className="btn-primary w-full" disabled={busy || code.length < 4}>
        {busy ? 'Verifying…' : 'Verify and sign in'}
      </button>

      <div className="flex items-center justify-between gap-3 text-sm">
        <button
          type="button"
          className="link-muted"
          onClick={() => {
            setStep('identifier');
            setCode('');
            setSent(null);
            onError(null);
          }}
        >
          Use a different email or phone
        </button>

        <button
          type="button"
          className="link-action disabled:text-steel-500"
          disabled={secondsLeft > 0 || busy}
          onClick={send}
        >
          {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Resend code'}
        </button>
      </div>
    </form>
  );
}

export default function Login() {
  const { isAuthenticated, loading, user, accounts, switchTo, notice, clearNotice, locked } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  /* Accounts still on this device — signed out of one, the others are a tap away. */
  const onDevice = accounts.filter((row) => !row.active && (row.signedIn || row.locked));
  const continueAs = async (id) => { await switchTo(id); navigate('/', { replace: true }); };
  const [mode, setMode] = useState('password');
  const [error, setError] = useState(null);
  /*
   * "Add another account": the login page while somebody is signed in. Their session stays on
   * the device [auth/accounts.js]; the sign-in that follows becomes the active account.
   */
  const adding = new URLSearchParams(location.search).get('add') === '1';

  if (loading) return null;
  /* The active account is locked behind its PIN: that is the lock screen's business, not a fresh sign-in. */
  if (locked && !adding) return <LockScreen />;
  if (isAuthenticated && !adding) return <Navigate to={location.state?.from || '/'} replace />;

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_minmax(0,32rem)]">
      {/* Brand panel — the story side. Hidden on small screens where it would only cost scroll. */}
      <aside className="relative hidden overflow-hidden border-r border-line/[0.06] bg-ink-850 p-12 lg:flex lg:flex-col">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-flame-500/[0.13] blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-52 -right-32 h-[30rem] w-[30rem] rounded-full bg-aqua-500/[0.10] blur-3xl"
        />

        <div className="relative">
          <Wordmark />
        </div>

        <div className="relative mt-auto max-w-lg">
          <p className="eyebrow mb-5 text-accent">Since 2004</p>
          <h1 className="text-[2.75rem] font-extrabold leading-[1.05] tracking-tighter text-steel-50">
            A hanger expert
            <br />
            you can{' '}
            <span className="bg-gradient-to-r from-flame-400 to-flame-600 bg-clip-text text-transparent">
              hang onto
            </span>
            .
          </h1>
          <p className="mt-5 text-[0.9375rem] leading-relaxed text-steel-300">
            India's largest hanger manufacturer by volume. One console for the sales desk, the
            moulding floor, the stores and the ledger.
          </p>

          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-line/[0.08] pt-7">
            {[
              ['600+', 'Moulds'],
              ['20 yrs', 'Manufacturing'],
              ['GRS', 'Certified recycled'],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="text-xl font-extrabold tracking-tight text-steel-50">{value}</dt>
                <dd className="mt-0.5 text-xs font-medium text-steel-400">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>

      {/* Form panel. */}
      <main className="relative flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-sm animate-fade-up">
          <div className="mb-8 lg:hidden">
            <Wordmark />
          </div>

          <h2 className="text-[1.75rem] font-extrabold tracking-tighter text-steel-50">{adding ? 'Add another account' : 'Sign in'}</h2>
          <p className="mb-7 mt-1.5 text-sm leading-relaxed text-steel-400">
            {adding && user
              ? `You stay signed in as ${user.name}. Sign in to the account to add; you can switch between them from the account menu.`
              : 'Use your password, or have a code sent to your email or phone.'}
          </p>
          {adding && accounts.length >= 5 && (
            <div className="mb-4"><Notice tone="warn">Five accounts is the most this device keeps: the one used longest ago will be forgotten.</Notice></div>
          )}
          {notice && (
            <div className="mb-4 flex items-start justify-between gap-2"><Notice tone="warn">{notice}</Notice><button type="button" className="row-action shrink-0" onClick={clearNotice}>Dismiss</button></div>
          )}
          {onDevice.length > 0 && (
            <div className="mb-6 space-y-1.5" aria-label="Accounts on this device">
              <p className="text-xs font-semibold text-steel-400">Continue as</p>
              {onDevice.map((row) => (
                <button key={row.id} type="button" className="btn-secondary w-full justify-start" onClick={() => continueAs(row.id)}>
                  {row.name}{row.locked ? ' · locked' : ''}
                </button>
              ))}
            </div>
          )}

          <Tabs
            mode={mode}
            onChange={(next) => {
              setMode(next);
              setError(null);
            }}
          />

          <div role="tabpanel" id={`signin-panel-${mode}`} aria-labelledby={`signin-tab-${mode}`}>
            {mode === 'password' ? <PasswordForm onError={setError} /> : <OtpForm onError={setError} />}
          </div>

          {error && (
            <div className="mt-4">
              <Notice tone="danger">{error}</Notice>
            </div>
          )}

          {/* No sign-up: accounts are created by an administrator, who sends a welcome email. */}
          <p className="mt-8 border-t border-line/[0.06] pt-5 text-center text-sm text-steel-400">
            No account yet? Ask your administrator to invite you — you will get an email with a
            link to set your password.
          </p>
        </div>
      </main>
    </div>
  );
}
