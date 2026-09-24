import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Field, Notice, Spinner } from '../components/ui.jsx';
import { PasswordPage } from './ForgotPassword.jsx';

/**
 * Choosing a password from an emailed link — the welcome invitation or a reset.
 *
 * The link is checked before the form is shown, so a dead one says so at once instead of after
 * somebody has typed a password twice. Setting it signs them in and ends every other session.
 */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const { resetPassword } = useAuth();
  const [link, setLink] = useState(null);
  const [dead, setDead] = useState(null);
  const [error, setError] = useState(null);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm();

  useEffect(() => {
    if (!token) {
      setDead('This page needs the link from your email.');
      return;
    }
    auth.checkResetLink(token).then(setLink).catch((failure) => setDead(failure.message));
  }, [token]);

  const submit = async ({ password }) => {
    setError(null);
    try {
      await resetPassword(token, password);
      navigate('/', { replace: true });
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  if (dead) {
    return (
      <PasswordPage title="Link not valid">
        <Notice tone="danger">{dead}</Notice>
        <p className="mt-4 text-sm text-steel-400">
          <Link to="/forgot-password" className="link-action">Send a new link</Link>, or ask your
          administrator to resend your invitation.
        </p>
      </PasswordPage>
    );
  }

  if (!link) return <Spinner label="Checking your link" />;

  const welcome = link.purpose === 'invite';

  return (
    <PasswordPage
      title={welcome ? `Welcome, ${link.name.split(' ')[0]}` : 'Choose a new password'}
      subtitle={
        welcome
          ? `Set a password for ${link.email}. You will use it with this email to sign in.`
          : `For ${link.email}. Every other device signed in as you will be signed out.`
      }
    >
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <Field label="New password" hint="At least 8 characters" error={errors.password} required>
          <input
            type="password"
            autoComplete="new-password"
            className="input"
            {...register('password', {
              required: 'Choose a password',
              minLength: { value: 8, message: 'At least 8 characters' },
            })}
          />
        </Field>
        <Field label="New password again" error={errors.confirm} required>
          <input
            type="password"
            autoComplete="new-password"
            className="input"
            {...register('confirm', {
              required: 'Enter the password again',
              validate: (value) => value === getValues('password') || 'The two do not match',
            })}
          />
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : welcome ? 'Set password and sign in' : 'Save and sign in'}
        </button>
      </form>
    </PasswordPage>
  );
}
