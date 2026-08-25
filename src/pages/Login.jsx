import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Field } from '../components/ui.jsx';

const RESEND_SECONDS = 60;

function Tabs({ mode, onChange }) {
  const tabs = [
    { id: 'password', label: 'Password' },
    { id: 'otp', label: 'One-time code' },
  ];

  return (
    <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
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
  } = useForm();

  const submit = async (values) => {
    onError(null);
    try {
      await login(values);
      navigate(location.state?.from || '/', { replace: true });
    } catch (error) {
      onError(error.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <Field label="Email" error={errors.email}>
        <input
          type="email"
          autoComplete="email"
          className="input"
          {...register('email', { required: 'Email is required' })}
        />
      </Field>

      <Field label="Password" error={errors.password}>
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
          hint="We'll text or email you a code — no password needed"
        >
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
      <p className="text-sm text-slate-600">
        Enter the {sent?.channel === 'sms' ? 'code we texted to' : 'code we emailed to'}{' '}
        <span className="font-medium text-slate-800">{sent?.maskedIdentifier || identifier}</span>.
      </p>

      <Field label="Verification code">
        <input
          ref={codeInput}
          className="input text-center text-lg tracking-[0.4em]"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          placeholder="······"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          required
        />
      </Field>

      {sent?.devCode && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Development mode — no email or SMS provider is configured. Your code is{' '}
          <span className="font-mono font-semibold">{sent.devCode}</span>.
        </p>
      )}

      <button type="submit" className="btn-primary w-full" disabled={busy || code.length < 4}>
        {busy ? 'Verifying…' : 'Verify and sign in'}
      </button>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          className="text-slate-500 hover:text-slate-700"
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
          className="text-brand-600 hover:underline disabled:text-slate-400 disabled:no-underline"
          disabled={secondsLeft > 0 || busy}
          onClick={send}
        >
          {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Resend code'}
        </button>
      </div>
    </form>
  );
}

function RegisterForm({ onError }) {
  const { register: signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm();

  const submit = async (values) => {
    onError(null);
    try {
      await signUp({ ...values, phone: values.phone || undefined });
      navigate(location.state?.from || '/', { replace: true });
    } catch (error) {
      onError(error.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <Field label="Full name" error={errors.name}>
        <input
          className="input"
          {...register('name', { required: 'Name is required', minLength: { value: 2, message: 'Too short' } })}
        />
      </Field>

      <Field label="Email" error={errors.email}>
        <input
          type="email"
          autoComplete="email"
          className="input"
          {...register('email', { required: 'Email is required' })}
        />
      </Field>

      <Field label="Phone" error={errors.phone} hint="Optional — lets you sign in by SMS code">
        <input type="tel" autoComplete="tel" className="input" {...register('phone')} />
      </Field>

      <Field label="Password" error={errors.password} hint="At least 8 characters">
        <input
          type="password"
          autoComplete="new-password"
          className="input"
          {...register('password', {
            required: 'Password is required',
            minLength: { value: 8, message: 'At least 8 characters' },
          })}
        />
      </Field>

      <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}

export default function Login() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState('password');
  const [error, setError] = useState(null);

  if (loading) return null;
  if (isAuthenticated) return <Navigate to={location.state?.from || '/'} replace />;

  const registering = mode === 'register';

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-white">NPT Hangers</h1>
          <p className="mt-1 text-sm text-slate-400">CRM &amp; ERP for the plant floor and the sales desk</p>
        </div>

        <div className="card p-6">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">
            {registering ? 'Create an account' : 'Sign in'}
          </h2>
          <p className="mb-5 text-sm text-slate-500">
            {registering
              ? 'The first account created becomes the administrator.'
              : 'Use your password, or have a code sent to your email or phone.'}
          </p>

          {!registering && (
            <Tabs
              mode={mode}
              onChange={(next) => {
                setMode(next);
                setError(null);
              }}
            />
          )}

          {mode === 'password' && <PasswordForm onError={setError} />}
          {mode === 'otp' && <OtpForm onError={setError} />}
          {registering && <RegisterForm onError={setError} />}

          {error && (
            <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}

          <button
            type="button"
            className="mt-4 w-full text-sm text-brand-600 hover:underline"
            onClick={() => {
              setMode(registering ? 'password' : 'register');
              setError(null);
            }}
          >
            {registering ? 'Already registered? Sign in' : 'Need an account? Register'}
          </button>
        </div>
      </div>
    </div>
  );
}
