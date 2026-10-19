import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { auth, pushApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Field, Modal, Notice, PageHeader } from '../components/ui.jsx';
import { formatDate, humanise } from '../utils/format.js';
import { setStartPage, startPage } from '../utils/startPage.js';
import { disablePush, enablePush, pushState } from '../utils/push.js';
import { settings as settingsApi } from '../api/endpoints.js';
import { SetPinDialog, PinInput } from '../components/PinGate.jsx';

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
  on: 'This device is told the moment a task is raised for your team, a query is flagged urgent, or somebody tags you.',
  off: 'Get told on this device the moment a task is raised for your team or somebody tags you — even with the app closed.',
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

/** One line of the check: a tick or a cross, what it is, and what it means. */
function CheckRow({ ok, label, detail }) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden className={ok ? 'text-success-400' : 'text-warn-400'}>{ok ? '✓' : '✗'}</span>
      <span><span className="font-semibold text-steel-100">{label}</span><span className="text-steel-400"> — {detail}</span></span>
    </li>
  );
}

/**
 * Are notifications working? What the server has set up — push, email, WhatsApp — how many of my
 * devices are switched on, where a development server is sending everything, and a test to myself.
 */
function NotificationCheck() {
  const [status, setStatus] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  /* An API older than this screen answers 404 here: say what to do, not the route. */
  const explain = (failure) => (failure?.status === 404 || failure?.response?.status === 404
    ? 'The server is older than this app — update it (git pull, npm install, restart the API), then reload.'
    : failure.message);
  const load = () => pushApi.status().then(setStatus).catch((failure) => setProblem(explain(failure)));
  useEffect(() => { load(); }, []);
  const test = async () => {
    setBusy(true);
    setProblem(null);
    try {
      setResult(await pushApi.test());
      load();
    } catch (failure) {
      setProblem(explain(failure));
    } finally {
      setBusy(false);
    }
  };
  if (!status && !problem) return null;
  return (
    <section className="card mt-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold tracking-tight text-steel-50">Notifications check</h2>
          <p className="mt-1 text-sm text-steel-400">What the server can send, and a test to yourself.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" disabled={busy} onClick={load}>Refresh</button>
          <button type="button" className="btn-secondary" disabled={busy || !status} onClick={test}>{busy ? 'Sending…' : 'Send me a test'}</button>
        </div>
      </div>
      {problem && <p role="alert" className="mt-2 text-sm text-danger-400">{problem}</p>}
      {status && (
        <>
          {status.redirect && (
            <Notice tone="warn">
              Development server: every email goes to {status.redirect.email}
              {status.redirect.phone ? ` and every WhatsApp to ${status.redirect.phone}` : ''}, marked with who it was meant for. Sign-in codes still go to their owner.
            </Notice>
          )}
          <ul className="mt-3 space-y-1.5 text-sm">
            <CheckRow ok={status.push.configured} label="Push" detail={status.push.configured ? `set up · ${status.push.myDevices} of your devices switched on` : 'not set up on the server (WEB_PUSH_* keys)'} />
            <CheckRow ok={status.email.configured} label="Email" detail={status.email.configured ? `sent through ${status.email.host} as ${status.email.from}` : 'not set up on the server (SMTP_*) — emails are only written to its log'} />
            <CheckRow ok={status.whatsapp.configured} label="WhatsApp" detail={status.whatsapp.configured ? `sent through ${status.whatsapp.provider}` : 'not set up on the server — messages are only written to its log'} />
            {status.whatsapp.lastTest && (
              <CheckRow
                ok={['delivered', 'read', 'sent'].includes(status.whatsapp.lastTest.status)}
                label="Last WhatsApp test"
                detail={status.whatsapp.lastTest.status === 'failed'
                  ? `refused by WhatsApp — ${status.whatsapp.lastTest.error || 'no reason given'}${status.whatsapp.lastTest.template ? '' : '. Outside 24 hours of your last message to the business number, WhatsApp needs an approved template (WHATSAPP_TEMPLATE_TASK) — or send any message to the business number first, then test again'}`
                  : status.whatsapp.lastTest.status === 'accepted'
                    ? 'accepted by Meta, no delivery report yet — press Refresh in a few seconds (needs the webhook set up)'
                    : status.whatsapp.lastTest.status}
              />
            )}
            <CheckRow ok label="Server mode" detail={status.mode === 'production' ? 'production — notifications go to the real people' : `${status.mode} — not production`} />
          </ul>
          {result && (
            <div className="mt-3 space-y-1.5 text-sm">
              <p className="font-semibold text-steel-100">Test result</p>
              {result.redirect && <p className="text-xs text-warn-400">Development server: the test went to {result.redirect}’s devices and phone, not yours.</p>}
              {!result.redirect && !result.push.devices && <CheckRow ok={false} label="Push" detail="none of your devices is switched on — press Turn on above, on this device" />}
              {result.redirect && !(result.push.delivered || []).length && <CheckRow ok={false} label="Push" detail={`${result.redirect} has no device switched on — sign in as them and press Turn on`} />}
              {(result.push.delivered || []).map((row, index) => (
                <CheckRow
                  key={`${row.service}-${index}`}
                  ok={row.ok}
                  label={`Push · ${row.service} device`}
                  detail={row.ok ? 'accepted by the push service — it should appear within a few seconds' : row.why}
                />
              ))}
              <CheckRow ok={result.email.sent} label="Email" detail={result.email.sent ? 'sent — check your inbox (and spam)' : result.email.why} />
              <CheckRow
                ok={Boolean(result.whatsapp?.sent)}
                label="WhatsApp"
                detail={result.whatsapp?.sent
                  ? `accepted by Meta${result.whatsapp.template ? ' (template)' : ''} — delivery shows below in a moment`
                  : result.whatsapp?.why || 'not set up on the server'}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Where the app opens for this person: their home, the query list, or Today. Kept on this device. */
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
          Home is the enquiries (Admin, Marketing) or your department’s desk. Today is your day by role. On this device only.
        </p>
      </div>
      <div role="radiogroup" aria-label="Start page" className="tab-track grid-flow-col">
        {[['home', 'Home'], ['queries', 'Queries'], ['today', 'Today']].map(([value, label]) => (
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

/** The device PIN: set, change or remove. The lock after a while away opens with it. */
function DevicePin() {
  const { hasPin, canSetPin, clearPin, policy } = useAuth();
  const [setting, setSetting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [current, setCurrent] = useState('');
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const remove = async (event) => {
    event.preventDefault(); setBusy(true); setProblem(null);
    try { await clearPin(current); setRemoving(false); setCurrent(''); }
    catch (error) { setProblem(error.message); }
    finally { setBusy(false); }
  };
  if (!canSetPin) return null;
  return (
    <section className="card mt-5 flex flex-wrap items-center justify-between gap-4 p-6">
      <div>
        <h2 className="text-base font-bold tracking-tight text-steel-50">Device PIN</h2>
        <p className="mt-1 text-sm text-steel-400">
          {hasPin
            ? `Set. The app locks after ${policy.lockAfterMinutes} minutes away and opens again with your PIN. On this device only.`
            : `Not set. With one, the app locks after ${policy.lockAfterMinutes} minutes away and opens again with the PIN instead of a full sign-in.`}
          {policy.pinRequired ? ' Required for everyone here.' : ''}
        </p>
        {removing && (
          <form onSubmit={remove} className="mt-3 flex flex-wrap items-end gap-2">
            <label className="block space-y-1 text-sm"><span className="font-semibold text-steel-100">Current PIN</span><PinInput value={current} onChange={setCurrent} label="Current PIN" autoFocus /></label>
            <button className="btn-danger" disabled={busy || current.length < 6}>{busy ? 'Removing…' : 'Remove PIN'}</button>
            <button type="button" className="btn-secondary" onClick={() => { setRemoving(false); setProblem(null); }}>Cancel</button>
          </form>
        )}
        {problem && <p role="alert" className="mt-1 text-sm text-danger-400">{problem}</p>}
      </div>
      <div className="flex gap-2">
        <button type="button" className={hasPin ? 'btn-secondary' : 'btn-primary'} onClick={() => setSetting(true)}>{hasPin ? 'Change PIN' : 'Set a PIN'}</button>
        {hasPin && !policy.pinRequired && !removing && <button type="button" className="btn-secondary" onClick={() => setRemoving(true)}>Remove</button>}
      </div>
      <SetPinDialog open={setting} onClose={() => setSetting(false)} />
    </section>
  );
}

/** The accounts signed in on this device, and the way to add or drop one. */
function DeviceAccounts() {
  const { accounts, switchTo, signOutAll } = useAuth();
  const go = async (id) => { await switchTo(id); window.location.assign('/'); };
  if (accounts.length < 2) return null;
  return (
    <section className="card mt-5 p-6">
      <h2 className="text-base font-bold tracking-tight text-steel-50">Accounts on this device</h2>
      <p className="mt-1 text-sm text-steel-400">Switch from the account menu at the top. An account unused for a week is forgotten; five is the most kept.</p>
      <ul className="mt-3 divide-y divide-line/10 rounded-xl border border-line/10">
        {accounts.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span><span className="font-semibold text-steel-100">{row.name}</span> <span className="text-steel-400">· {row.roleLabel || (row.department ? humanise(row.department) : '')}{row.active ? ' · this one' : row.locked ? ' · locked' : !row.signedIn ? ' · signed out' : ''}{row.hasPin ? ' · PIN' : ''}</span></span>
            {!row.active && <button type="button" className="row-action" onClick={() => go(row.id)}>Switch</button>}
          </li>
        ))}
      </ul>
      <button type="button" className="row-action-danger mt-3" onClick={signOutAll}>Sign out of all accounts on this device</button>
    </section>
  );
}

/** Admin's policy for everyone: a PIN required, and the idle minutes before the lock. */
function SecurityPolicy() {
  const { isManagement, policy, applyUser, user } = useAuth();
  const [form, setForm] = useState({ pinRequired: policy.pinRequired, lockAfterMinutes: policy.lockAfterMinutes });
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState(null);
  if (!isManagement) return null;
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setSaid(null);
    try {
      const saved = await settingsApi.setSecurity({ pinRequired: Boolean(form.pinRequired), lockAfterMinutes: Number(form.lockAfterMinutes) });
      applyUser({ ...user, policy: saved });
      setSaid('Saved. Everyone picks it up on their next screen.');
    } catch (error) { setSaid(error.message); }
    finally { setBusy(false); }
  };
  return (
    <section className="card mt-5 p-6">
      <h2 className="text-base font-bold tracking-tight text-steel-50">Security for everyone</h2>
      <p className="mt-1 text-sm text-steel-400">Admin only. A device PIN keeps a session from being used by whoever finds the computer unlocked.</p>
      <form onSubmit={save} className="mt-4 flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 text-sm text-steel-100">
          <input type="checkbox" checked={Boolean(form.pinRequired)} onChange={(event) => setForm({ ...form, pinRequired: event.target.checked })} />
          Everyone must set a device PIN
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-semibold text-steel-100">Lock after (minutes away)</span>
          <input className="input w-28" type="number" min={1} max={240} value={form.lockAfterMinutes} onChange={(event) => setForm({ ...form, lockAfterMinutes: event.target.value })} />
        </label>
        <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save policy'}</button>
      </form>
      {said && <p className="mt-2 text-sm text-steel-300">{said}</p>}
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
      <NotificationCheck />
      <DevicePin />
      <DeviceAccounts />
      <SecurityPolicy />

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
