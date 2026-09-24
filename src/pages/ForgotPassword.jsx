import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { auth } from '../api/endpoints.js';
import { Field, Notice } from '../components/ui.jsx';
import { ThemeToggle, Wordmark } from '../components/Layout.jsx';

/** The frame the two password pages share: a narrow card with the wordmark, nothing else. */
export function PasswordPage({ title, subtitle, children }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-8">
          <Wordmark />
        </div>
        <h2 className="text-[1.75rem] font-extrabold tracking-tighter text-steel-50">{title}</h2>
        {subtitle && <p className="mb-7 mt-1.5 text-sm leading-relaxed text-steel-400">{subtitle}</p>}
        {children}
        <p className="mt-8 border-t border-line/[0.06] pt-5 text-center text-sm">
          <Link to="/login" className="link-action">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}

/**
 * Asking for a reset link.
 *
 * The answer is the same whether or not the address has an account — the server says so, and
 * this page repeats it rather than guessing — so it cannot be used to find out who works here.
 */
export default function ForgotPassword() {
  const [sent, setSent] = useState(null);
  const [error, setError] = useState(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm();

  const submit = async ({ email }) => {
    setError(null);
    try {
      const response = await auth.forgotPassword(email.trim());
      setSent(response.message);
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  return (
    <PasswordPage
      title="Forgot password"
      subtitle="Enter the email you sign in with. We will send a link to choose a new password."
    >
      {sent ? (
        <Notice tone="success">{sent}</Notice>
      ) : (
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <Field label="Email" error={errors.email} required>
            <input
              type="email"
              autoComplete="email"
              className="input"
              {...register('email', { required: 'Email is required' })}
            />
          </Field>
          {error && <Notice tone="danger">{error}</Notice>}
          <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </PasswordPage>
  );
}
