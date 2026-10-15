import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { validPin } from '../auth/pinCrypto.js';
import { Modal, Notice } from './ui.jsx';
import { departmentLabel } from '../utils/pipeline.js';

const initialsOf = (name = '', email = '') => {
  const words = String(name).split(/\s+/).filter(Boolean);
  return (words.length ? words.slice(0, 2).map((word) => word[0]) : [email[0] || '?']).join('').toUpperCase();
};

/** One digits box: numeric keyboard on a phone, submits itself on Enter. */
export function PinInput({ value, onChange, onSubmit, label = 'PIN', autoFocus = false, disabled = false }) {
  const box = useRef(null);
  useEffect(() => { if (autoFocus) box.current?.focus(); }, [autoFocus]);
  return (
    <input
      ref={box}
      aria-label={label}
      className="input text-center text-2xl tracking-[0.5em]"
      type="password"
      inputMode="numeric"
      autoComplete="off"
      pattern="[0-9]*"
      maxLength={8}
      disabled={disabled}
      value={value}
      placeholder="••••"
      onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 8))}
      onKeyDown={(event) => { if (event.key === 'Enter' && onSubmit) { event.preventDefault(); onSubmit(); } }}
    />
  );
}

/**
 * The lock screen: the active account, by name, waiting for its PIN. The page behind it is
 * not drawn — the session token is gone from the browser until the PIN opens it, so there is
 * nothing to show. "Switch account" and "Sign in again" are the ways out without the PIN.
 */
export function LockScreen({ overlay = false }) {
  const { lockedAccount, unlock, pinTriesLeft, accounts, switchTo, logout } = useAuth();
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const others = accounts.filter((row) => row.id !== lockedAccount?.id);
  /* A seal still opens after the token behind it has lapsed; say so rather than fail on the next call. */
  const lapsed = lockedAccount?.expiresAt && new Date(lockedAccount.expiresAt).getTime() < Date.now();
  const roleOf = (row) => row?.roleLabel || (row?.department ? departmentLabel(row.department) : '');
  const switchAnd = async (id) => { await switchTo(id); navigate('/', { replace: true }); };

  const submit = async () => {
    if (!validPin(pin) || busy) return;
    setBusy(true);
    setProblem(null);
    const result = await unlock(pin);
    setBusy(false);
    setPin('');
    if (result.ok) return;
    if (result.signedOut) {
      setProblem('Too many wrong PINs. Sign in again.');
      if (!result.next) navigate('/login', { replace: true });
      return;
    }
    setProblem(`Wrong PIN. ${result.triesLeft} ${result.triesLeft === 1 ? 'try' : 'tries'} left before this account is signed out.`);
  };

  const signInAgain = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className={`grid min-h-screen place-items-center px-4 ${overlay ? 'fixed inset-0 z-[100] bg-ink-900/95 backdrop-blur-md' : 'bg-ink-900'}`} role="dialog" aria-modal="true" aria-label="Locked">
      <div className="card w-full max-w-sm p-6 text-center">
        <span aria-hidden className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-flame-50 text-xl font-bold text-accent ring-1 ring-inset ring-flame-500/20">
          {initialsOf(lockedAccount?.name, lockedAccount?.email || '')}
        </span>
        <h1 className="mt-4 text-xl font-extrabold tracking-tight text-steel-50">{lockedAccount?.name || 'Locked'}</h1>
        {lapsed ? (
          <>
            <p className="mt-1 text-sm text-steel-400">This sign-in is older than a week and has lapsed. Sign in again to carry on.</p>
            <button type="button" className="btn-primary mt-5 w-full" onClick={signInAgain}>Sign in again</button>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-steel-400">Locked after a while away. Enter your PIN to carry on where you were.</p>
            <form className="mt-5 space-y-3" onSubmit={(event) => { event.preventDefault(); submit(); }}>
              <PinInput value={pin} onChange={setPin} onSubmit={submit} autoFocus disabled={busy} label="Your PIN" />
              {problem && <Notice tone="danger">{problem}</Notice>}
              <button type="submit" className="btn-primary w-full" disabled={busy || !validPin(pin)}>{busy ? 'Opening…' : 'Unlock'}</button>
            </form>
            <p className="mt-3 text-xs text-steel-400">{pinTriesLeft} {pinTriesLeft === 1 ? 'try' : 'tries'} left · Ctrl+L locks</p>
          </>
        )}
        <div className="mt-5 space-y-2 border-t border-line/10 pt-4">
          {others.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-steel-400">Switch account</p>
              {others.map((row) => (
                <button key={row.id} type="button" className="btn-secondary w-full justify-start" onClick={() => switchAnd(row.id)}>
                  {row.name}{roleOf(row) ? ` · ${roleOf(row)}` : ''}{row.locked ? ' · locked' : !row.signedIn ? ' · signed out' : ''}
                </button>
              ))}
            </div>
          )}
          {!lapsed && <button type="button" className="row-action w-full" onClick={signInAgain}>Forgot the PIN? Sign in again</button>}
        </div>
      </div>
    </div>
  );
}

/**
 * Setting or changing the PIN. As a gate when the plant requires one and this account has none,
 * which cannot be dismissed; from the profile otherwise, which can.
 */
export function SetPinDialog({ open, onClose, required = false }) {
  const { setPin, hasPin, user } = useAuth();
  const [current, setCurrent] = useState('');
  const [first, setFirst] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const changing = hasPin && !required;

  const submit = async (event) => {
    event?.preventDefault();
    setProblem(null);
    if (!validPin(first)) return setProblem('A PIN is four to eight digits.');
    if (first !== again) return setProblem('The two PINs do not match.');
    setBusy(true);
    try {
      await setPin(first, { current });
      setFirst(''); setAgain(''); setCurrent('');
      onClose?.();
    } catch (error) {
      setProblem(error.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <Modal open={open} title={changing ? 'Change your PIN' : 'Set a device PIN'} onClose={required ? undefined : onClose} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-steel-300">
          {required
            ? `${user?.name?.split(' ')[0] || 'You'}, this plant asks everyone for a PIN. The app locks after a while away and opens again with it. Four to eight digits, on this device only.`
            : 'The app locks after a while away and opens again with this PIN. Four to eight digits, on this device only. Nobody can recover it — a forgotten PIN means signing in again.'}
        </p>
        {changing && (
          <label className="block space-y-1 text-sm">
            <span className="font-semibold text-steel-100">Current PIN</span>
            <PinInput value={current} onChange={setCurrent} label="Current PIN" autoFocus />
          </label>
        )}
        <label className="block space-y-1 text-sm">
          <span className="font-semibold text-steel-100">New PIN</span>
          <PinInput value={first} onChange={setFirst} label="New PIN" autoFocus={!changing} />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-semibold text-steel-100">New PIN again</span>
          <PinInput value={again} onChange={setAgain} label="New PIN again" onSubmit={submit} />
        </label>
        {problem && <Notice tone="danger">{problem}</Notice>}
        <div className="flex justify-end gap-2">
          {!required && <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>}
          <button type="submit" className="btn-primary" disabled={busy || !validPin(first) || !validPin(again)}>{busy ? 'Saving…' : changing ? 'Change PIN' : 'Set PIN'}</button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * In front of the signed-in app: the lock screen while the active account is locked, and the
 * PIN-setting gate while the plant requires a PIN this account has not set.
 */
export default function PinGate({ children }) {
  const { locked, mustSetPin } = useAuth();
  /*
   * Locked: the lock screen over the page, which stays mounted but inert and unseen — a form
   * half filled is still there after the PIN, and an upload under way finishes. The token is
   * out of storage meanwhile [api/client.js `hideToken`].
   */
  return (
    <>
      <div inert={locked ? '' : undefined} aria-hidden={locked || undefined} className={locked ? 'invisible' : undefined}>{children}</div>
      {locked && <LockScreen overlay />}
      {!locked && mustSetPin && <SetPinDialog open required />}
    </>
  );
}
