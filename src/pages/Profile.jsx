import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { auth } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Field, Modal, Notice, PageHeader } from '../components/ui.jsx';
import { formatDate, humanise } from '../utils/format.js';
import { setStartPage, startPage } from '../utils/startPage.js';
import { disablePush, enablePush, pushState } from '../utils/push.js';

const SIGN_IN_METHODS = {
  password: 'Email and password',
  email_otp: 'Code sent by email',
  sms_otp: 'Code sent by SMS',
};

/** One labelled value in the details card. */
function Detail({ label, value, children }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1.5 text-sm font-medium text-steel-100">{children ?? value ?? '—'}</dd>
    </div>
  );
}

/**
 * Groups the feature catalogue as the server declared it, keeping the order it
 * arrived in so the API stays the single source of truth for both access and layout.
 */
function useGroupedModules(modules = []) {
  return useMemo(() => {
    const groups = new Map();
    for (const module of modules) {
      if (!groups.has(module.group)) groups.set(module.group, []);
      groups.get(module.group).push(module);
    }
    return [...groups.entries()].map(([group, items]) => ({ group, items }));
  }, [modules]);
}

/** One module row: what it is, and whether this user may read or change it. */
export function ModuleRow({ module }) {
  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p
          className={`text-sm font-semibold ${
            module.canRead ? 'text-steel-100' : 'text-steel-400'
          }`}
        >
          {module.label}
          {!module.available && (
            <span className="ml-2 align-middle text-xs font-bold uppercase tracking-wide text-steel-500">
              Coming soon
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-steel-400">{module.description}</p>
      </div>

      <span className="shrink-0 pt-0.5">
        {module.canWrite ? (
          <Badge tone="success">Read &amp; write</Badge>
        ) : module.canRead ? (
          <Badge tone="info">Read only</Badge>
        ) : (
          <Badge tone="neutral">No access</Badge>
        )}
      </span>
    </li>
  );
}

function EditProfile({ user, onClose, onSaved }) {
  const [error, setError] = useState(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: { name: user.name || '', phone: user.phone || '' },
  });

  const submit = async (values) => {
    setError(null);
    try {
      onSaved(await auth.updateProfile(values));
      onClose();
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <Field label="Full name" error={errors.name} required>
        <input
          className="input"
          {...register('name', {
            required: 'Name is required',
            minLength: { value: 2, message: 'Too short' },
          })}
        />
      </Field>

      <Field label="Phone" hint="Used for signing in by SMS code" error={errors.phone}>
        <input type="tel" className="input" {...register('phone')} />
      </Field>

      <p className="text-xs text-steel-500">
        Your email, department and module access are set by an administrator and cannot be
        changed here.
      </p>

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

/**
 * Setting a new password.
 *
 * Accounts are created with a temporary password an administrator types and reads out, and
 * there was no screen that changed it — the server has always had the door, nothing called it.
 * An account made by OTP has no password yet, so it is not asked for one it does not have.
 */
function ChangePassword({ user, onClose }) {
  const { changePassword } = useAuth();
  const [error, setError] = useState(null);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { currentPassword: '', newPassword: '', confirm: '' } });

  const submit = async ({ currentPassword, newPassword }) => {
    setError(null);
    try {
      await changePassword({ ...(user.hasPassword ? { currentPassword } : {}), newPassword });
      onClose();
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      {user.hasPassword && (
        <Field label="Current password" error={errors.currentPassword} required>
          <input
            type="password"
            autoComplete="current-password"
            className="input"
            {...register('currentPassword', { required: 'Enter your current password' })}
          />
        </Field>
      )}
      <Field label="New password" hint="At least 8 characters" error={errors.newPassword} required>
        <input
          type="password"
          autoComplete="new-password"
          className="input"
          {...register('newPassword', {
            required: 'Enter a new password',
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
            required: 'Enter the new password again',
            validate: (value) => value === getValues('newPassword') || 'The two do not match',
          })}
        />
      </Field>

      <p className="text-xs text-steel-500">
        Every other phone or computer signed in as you will be signed out. This one stays signed in.
      </p>

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Change password'}
        </button>
      </div>
    </form>
  );
}

const PUSH_SAYS = {
  unsupported: 'This browser cannot take notifications here. On a phone, install the app first (Add to Home Screen), then turn them on.',
  unconfigured: 'Notifications are not switched on for the plant yet — ask an administrator.',
  denied: 'This device has blocked notifications for the app. Allow them in the browser settings.',
  on: 'This device is told when somebody tags you.',
  off: 'Get told on this device when somebody tags you, even with the app closed.',
};

/** Pushes to this device — a tag reaches the phone in the pocket. */
function DeviceNotifications() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    pushState().then(setState).catch(() => setState('unsupported'));
  }, []);

  const flip = async () => {
    setBusy(true);
    setProblem(null);
    try {
      if (state === 'on') await disablePush();
      else await enablePush();
      setState(await pushState());
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };

  if (!state) return null;
  const canFlip = state === 'on' || state === 'off';

  return (
    <section className="card mt-5 flex flex-wrap items-center justify-between gap-4 p-6">
      <div>
        <h2 className="text-base font-bold tracking-tight text-steel-50">Notifications on this device</h2>
        <p className="mt-1 text-sm text-steel-400">{PUSH_SAYS[state]}</p>
        {problem && <p role="alert" className="mt-1 text-sm text-danger-400">{problem}</p>}
      </div>
      {canFlip && (
        <button type="button" className={state === 'on' ? 'btn-secondary' : 'btn-primary'} disabled={busy} onClick={flip}>
          {busy ? 'Working…' : state === 'on' ? 'Turn off' : 'Turn on'}
        </button>
      )}
    </section>
  );
}

/** Where the app opens for this person: the query list, or Today. Kept on this device. */
function StartPageChoice() {
  const [page, setPage] = useState(startPage);
  const choose = (next) => {
    setStartPage(next);
    setPage(next);
  };
  return (
    <section className="card mt-5 flex flex-wrap items-center justify-between gap-4 p-6">
      <div>
        <h2 className="text-base font-bold tracking-tight text-steel-50">Open the app on</h2>
        <p className="mt-1 text-sm text-steel-400">
          Today is your day by role — what is waiting on you and your team. On this device only.
        </p>
      </div>
      <div role="radiogroup" aria-label="Start page" className="tab-track grid-flow-col">
        {[['queries', 'Queries'], ['today', 'Today']].map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={page === value}
            onClick={() => choose(value)}
            className={`tab ${page === value ? 'tab-active' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

export default function Profile() {
  const { user, applyUser, logout } = useAuth();
  const [editing, setEditing] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const grouped = useGroupedModules(user?.modules);

  if (!user) return null;

  const modules = user.modules || [];
  const writable = modules.filter((module) => module.canWrite).length;
  // Read-only excludes the writable ones, so the two numbers never double-count.
  const readOnly = modules.filter((module) => module.canRead && !module.canWrite).length;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="My profile"
        subtitle="Your details and what you can access in the app"
        actions={
          <button type="button" className="btn-primary" onClick={() => setEditing(true)}>
            Edit profile
          </button>
        }
      />

      <section className="card p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-flame-500/15 text-xl font-bold text-flame-400 ring-1 ring-inset ring-flame-500/25">
            {user.name?.charAt(0).toUpperCase()}
          </div>

          <div className="min-w-0">
            <h2 className="text-xl font-extrabold tracking-tight text-steel-50">{user.name}</h2>
            <p className="mt-0.5 text-sm text-steel-400">{user.email}</p>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Badge tone="accent">{humanise(user.role)}</Badge>
            {user.isActive ? <Badge status="active" /> : <Badge status="inactive" />}
          </div>
        </div>

        <dl className="mt-7 grid gap-6 border-t border-line/[0.06] pt-6 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Name" value={user.name} />
          <Detail label="Role" value={humanise(user.role)} />
          <Detail label="Department" value={humanise(user.department)} />

          <Detail label="Email">
            <span className="flex flex-wrap items-center gap-2">
              {user.email}
              {user.emailVerified && <Badge tone="success">Verified</Badge>}
            </span>
          </Detail>

          <Detail label="Phone">
            {user.phone ? (
              <span className="flex flex-wrap items-center gap-2">
                {user.phone}
                {user.phoneVerified && <Badge tone="success">Verified</Badge>}
              </span>
            ) : (
              <span className="text-steel-400">Not set</span>
            )}
          </Detail>

          <Detail
            label="Last sign-in"
            value={
              user.lastLoginAt
                ? `${formatDate(user.lastLoginAt)}${
                    SIGN_IN_METHODS[user.lastLoginMethod]
                      ? ` · ${SIGN_IN_METHODS[user.lastLoginMethod]}`
                      : ''
                  }`
                : undefined
            }
          />
        </dl>
      </section>

      <section className="card mt-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold tracking-tight text-steel-50">Module access</h2>
            <p className="mt-1 text-sm text-steel-400">
              {user.role === 'admin'
                ? 'As an administrator you have read and write access to every module.'
                : 'Granted per module by an administrator. Your department sets the starting point.'}
            </p>
          </div>
          <Badge tone="info">
            {writable} write · {readOnly} read-only · {modules.length - writable - readOnly} none
          </Badge>
        </div>

        <div className="mt-5 space-y-6">
          {grouped.map(({ group, items }) => (
            <div key={group}>
              <p className="eyebrow">{group}</p>
              <ul className="mt-1 divide-y divide-line/[0.04]">
                {items.map((module) => (
                  <ModuleRow key={module.key} module={module} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <StartPageChoice />
      <DeviceNotifications />

      <section className="card mt-5 flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <h2 className="text-base font-bold tracking-tight text-steel-50">Password</h2>
          <p className="mt-1 text-sm text-steel-400">
            {user.hasPassword
              ? 'Change the password you sign in with. Other devices are signed out.'
              : 'You sign in with a code. Set a password to sign in with your email as well.'}
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => setChangingPassword(true)}>
          {user.hasPassword ? 'Change password' : 'Set a password'}
        </button>
      </section>

      <section className="card mt-5 flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <h2 className="text-base font-bold tracking-tight text-steel-50">Sign out</h2>
          <p className="mt-1 text-sm text-steel-400">
            Ends this session on this device. You will need to sign in again.
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={logout}>
          Sign out
        </button>
      </section>

      <Modal
        open={editing}
        title="Edit profile"
        description="Name and phone"
        onClose={() => setEditing(false)}
        size="sm"
      >
        <EditProfile user={user} onClose={() => setEditing(false)} onSaved={applyUser} />
      </Modal>

      <Modal
        open={changingPassword}
        title={user.hasPassword ? 'Change password' : 'Set a password'}
        onClose={() => setChangingPassword(false)}
        size="sm"
      >
        <ChangePassword user={user} onClose={() => setChangingPassword(false)} />
      </Modal>
    </div>
  );
}
