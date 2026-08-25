import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Field } from '../components/ui.jsx';

export default function Login() {
  const { login, register: signUp, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('login');
  const [serverError, setServerError] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm();

  if (loading) return null;
  if (isAuthenticated) return <Navigate to={location.state?.from || '/'} replace />;

  const onSubmit = async (values) => {
    setServerError(null);
    try {
      if (mode === 'login') {
        await login({ email: values.email, password: values.password });
      } else {
        await signUp(values);
      }
      navigate(location.state?.from || '/', { replace: true });
    } catch (error) {
      setServerError(error.message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-white">NPT Hangers</h1>
          <p className="mt-1 text-sm text-slate-400">CRM &amp; ERP for the plant floor and the sales desk</p>
        </div>

        <div className="card p-6">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">
            {mode === 'login' ? 'Sign in' : 'Create an account'}
          </h2>
          <p className="mb-5 text-sm text-slate-500">
            {mode === 'login'
              ? 'Use your work email to continue.'
              : 'The first account created becomes the administrator.'}
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {mode === 'register' && (
              <Field label="Full name" error={errors.name}>
                <input
                  className="input"
                  {...register('name', { required: 'Name is required', minLength: { value: 2, message: 'Too short' } })}
                />
              </Field>
            )}

            <Field label="Email" error={errors.email}>
              <input
                type="email"
                autoComplete="email"
                className="input"
                {...register('email', { required: 'Email is required' })}
              />
            </Field>

            <Field
              label="Password"
              error={errors.password}
              hint={mode === 'register' ? 'At least 8 characters' : undefined}
            >
              <input
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="input"
                {...register('password', {
                  required: 'Password is required',
                  ...(mode === 'register' && {
                    minLength: { value: 8, message: 'At least 8 characters' },
                  }),
                })}
              />
            </Field>

            {serverError && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{serverError}</p>
            )}

            <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <button
            type="button"
            className="mt-4 w-full text-sm text-brand-600 hover:underline"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setServerError(null);
            }}
          >
            {mode === 'login' ? 'Need an account? Register' : 'Already registered? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
