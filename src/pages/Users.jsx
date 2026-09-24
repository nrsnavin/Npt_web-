import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { users as usersApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Badge, ConfirmDialog, Field, FormError, Modal, Notice, PageHeader, Pagination, Spinner,
} from '../components/ui.jsx';
import { formatDate, humanise } from '../utils/format.js';
import { mayHoldBuyers } from '../utils/pipeline.js';
import { SortHeader, useSort } from '../components/SortHeader.jsx';

/** Grants are edited as a map of module key to level, then flattened on save. */
const grantsToMap = (moduleAccess = []) =>
  Object.fromEntries(moduleAccess.map((grant) => [grant.module, grant.level]));

const mapToGrants = (map) =>
  Object.entries(map)
    .filter(([, level]) => level && level !== 'none')
    .map(([module, level]) => ({ module, level }));

/** What every module has unless it says otherwise — the catalogue is the authority. */
const DEFAULT_LEVELS = ['read', 'write'];

const LEVEL_LABELS = {
  read: 'Read',
  /* Pricing's middle level, and the only place this word appears: raise and send the
     quotation, without the cost sheet behind it [§8]. */
  quote: 'Quote',
  write: 'Write',
};

/**
 * The levels each module offers, none first.
 *
 * Read off the catalogue rather than hardcoded, because they are no longer the same everywhere:
 * pricing has three since quotations folded into it, and a row that offered Quote on despatch
 * would be inviting an admin to grant something the server discards.
 */
function AccessPicker({ modules, value, onChange, disabled }) {
  const grouped = useMemo(() => {
    const groups = new Map();
    for (const module of modules) {
      if (!groups.has(module.group)) groups.set(module.group, []);
      groups.get(module.group).push(module);
    }
    return [...groups.entries()];
  }, [modules]);

  return (
    <div className="space-y-5">
      {grouped.map(([group, items]) => (
        <div key={group}>
          <p className="eyebrow mb-2">{group}</p>
          <ul className="space-y-2">
            {items.map((module) => {
              const level = value[module.key] || 'none';
              const options = [
                { value: 'none', label: 'None' },
                ...(module.levels || DEFAULT_LEVELS).map((key) => ({
                  value: key,
                  label: LEVEL_LABELS[key] || humanise(key),
                })),
              ];
              return (
                <li key={module.key} className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-steel-100">
                      {module.label}
                      {!module.available && (
                        <span className="ml-2 text-xs font-bold uppercase tracking-wide text-steel-500">
                          Soon
                        </span>
                      )}
                    </p>
                  </div>

                  <div
                    role="radiogroup"
                    aria-label={`Access to ${module.label}`}
                    /* Sized to what this module offers. A fixed three-column track squeezed
                       pricing's four buttons into three slots, and the labels ran together. */
                    className={`tab-track shrink-0 ${
                      options.length === 4 ? 'grid-cols-4' : 'grid-cols-3'
                    }`}
                  >
                    {options.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={level === option.value}
                        disabled={disabled}
                        onClick={() => onChange({ ...value, [module.key]: option.value })}
                        className={`tab px-2.5 py-1 text-xs disabled:opacity-40 ${
                          option.value === 'none' ? '' : 'tab-granted'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function UserForm({ catalogue, onClose, onSaved }) {
  const [grants, setGrants] = useState({});
  const [error, setError] = useState(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { role: 'member', department: catalogue.departments[0]?.key } });

  const department = watch('department');
  const role = watch('role');

  // Choosing a department proposes its template; the admin can still adjust every row.
  useEffect(() => {
    const template = catalogue.departments.find((entry) => entry.key === department);
    setGrants(grantsToMap(template?.defaultAccess));
  }, [department, catalogue.departments]);

  const submit = async (values) => {
    setError(null);
    try {
      const { data, invitation } = await usersApi.create({
        ...values,
        phone: values.phone || undefined,
        moduleAccess: values.role === 'admin' ? [] : mapToGrants(grants),
      });
      onSaved(data, invitation);
      onClose();
    } catch (submitError) {
      setError(submitError);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" error={errors.name} required>
          <input className="input" {...register('name', { required: 'Name is required' })} />
        </Field>
        <Field label="Email" error={errors.email} required>
          <input
            type="email"
            className="input"
            {...register('email', { required: 'Email is required' })}
          />
        </Field>
        <Field label="Phone" hint="Optional — enables SMS sign-in">
          <input type="tel" className="input" {...register('phone')} />
        </Field>
        <Field label="Department">
          <select className="input" {...register('department', { required: true })}>
            {catalogue.departments.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Role" hint="Admins have write access to everything">
          <select className="input" {...register('role')}>
            <option value="member">Member</option>
            <option value="admin">Administrator</option>
          </select>
        </Field>
      </div>

      {role === 'admin' ? (
        <Notice tone="info">
          Administrators have read and write access to every module, so there is nothing to
          grant here.
        </Notice>
      ) : (
        <div className="rounded-lg border border-line/[0.06] p-4">
          <p className="mb-4 text-sm text-steel-400">
            Starting point from the department. Adjust anything before saving.
          </p>
          <AccessPicker modules={catalogue.modules} value={grants} onChange={setGrants} />
        </div>
      )}

      {/* No password here: the person chooses their own from the welcome email, which also
          tells them the department, role and access set on this form. */}
      <p className="text-xs text-steel-400">
        A welcome email goes to this address with their department, role and module access, and a
        link to set their own password. The link works for 72 hours and can be resent.
      </p>

      <FormError error={error} />

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create and send invitation'}
        </button>
      </div>
    </form>
  );
}

function AccessForm({ user, catalogue, onClose, onSaved }) {
  const [grants, setGrants] = useState(() => grantsToMap(user.moduleAccess));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await usersApi.setAccess({ id: user.id, moduleAccess: mapToGrants(grants) }));
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  const resetToDepartment = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await usersApi.resetAccess(user.id);
      setGrants(grantsToMap(updated.moduleAccess));
      onSaved(updated);
    } catch (resetError) {
      setError(resetError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-steel-400">
          {user.name} · {humanise(user.department)}
        </p>
        <button type="button" className="btn-secondary py-1.5" onClick={resetToDepartment} disabled={busy}>
          Reset to department default
        </button>
      </div>

      <AccessPicker modules={catalogue.modules} value={grants} onChange={setGrants} disabled={busy} />

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn-primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save access'}
        </button>
      </div>
    </div>
  );
}

export default function Users() {
  const { canWrite } = useAuth();
  const [catalogue, setCatalogue] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  /* The three questions an access screen gets asked: who is in this department, who holds this
     role, and who is still active. All three are filters the API already understood and the
     screen simply never offered. */
  const [department, setDepartment] = useState('');
  const [role, setRole] = useState('');
  const [active, setActive] = useState('');

  const [creating, setCreating] = useState(false);
  const [editingAccess, setEditingAccess] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  /* What happened to a welcome email: `{ user, invitation }`, shown once after it is sent. */
  const [invited, setInvited] = useState(null);

  const resend = async (row) => {
    try {
      const { data, invitation } = await usersApi.resendInvitation(row.id);
      replaceRow(data);
      setInvited({ user: data, invitation });
    } catch (resendError) {
      setError(resendError);
    }
  };

  const mayWrite = canWrite('users');
  const { sort, toggle } = useSort();
  /* Paged like every other list: twenty-five at a time, the server counts the rest. */
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  /*
   * Re-fetched on every sort rather than re-ordered here, like every other table in the app.
   * This one loads a hundred rows at a time and could plausibly sort them in the browser — but
   * a screen that sorts client-side on one page and server-side on the others is a screen where
   * the answer depends on which table you are looking at, and the server is also what decides
   * that the password column is not an ordering anybody may ask for.
   */
  const load = async (term = search, order = sort, narrow = { department, role, active }, at = page) => {
    setLoading(true);
    setError(null);
    try {
      const [cat, list] = await Promise.all([
        catalogue ? Promise.resolve(catalogue) : usersApi.catalogue(),
        usersApi.list({
          search: term || undefined,
          department: narrow.department || undefined,
          role: narrow.role || undefined,
          /* Sent as the string the API reads, and only when a choice has been made — an empty
             picker means "either", not "inactive". */
          isActive: narrow.active || undefined,
          sort: order || undefined,
          page: at,
          limit: 25,
        }),
      ]);
      setCatalogue(cat);
      setRows(list.data);
      setPagination(list.pagination);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  };

  /* A new filter or ordering starts again at the first page; turning the page keeps them. */
  useEffect(() => {
    setPage(1);
    load(search, sort, { department, role, active }, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, department, role, active]);

  /* Re-ordering starts again at the top of the new ordering. */
  const sortBy = (field) => {
    toggle(field);
    setPage(1);
  };

  const turnTo = (next) => {
    setPage(next);
    load(search, sort, { department, role, active }, next);
  };

  const replaceRow = (updated) =>
    setRows((current) => current.map((row) => (row.id === updated.id ? updated : row)));

  const departmentLabel = (key) =>
    catalogue?.departments.find((entry) => entry.key === key)?.label || humanise(key);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Users"
        subtitle="Accounts, departments and module access"
        actions={
          mayWrite && (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              + New user
            </button>
          )
        }
      />

      <form
        className="mb-5 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          load(search, sort, { department, role, active }, 1);
        }}
      >
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search name, email or phone…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button type="submit" className="btn-secondary">
          Search
        </button>

        {/* The pickers narrow on change rather than on submit, because unlike a search term
            there is nothing half-typed to wait for. */}
        <select
          className="input max-w-[12rem]"
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
          aria-label="Department"
        >
          <option value="">Every department</option>
          {(catalogue?.departments || []).map((entry) => (
            <option key={entry.key} value={entry.key}>{entry.label}</option>
          ))}
        </select>

        <select
          className="input max-w-[10rem]"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          aria-label="Role"
        >
          <option value="">Any role</option>
          <option value="admin">Admin</option>
          {/* `member`, which is what the model calls it and what the badge below prints. */}
          <option value="member">Member</option>
        </select>

        <select
          className="input max-w-[11rem]"
          value={active}
          onChange={(event) => setActive(event.target.value)}
          aria-label="Account status"
        >
          <option value="">Active and closed</option>
          <option value="true">Active only</option>
          <option value="false">Closed only</option>
        </select>
      </form>

      {loading && <Spinner label="Loading users" />}
      {error && <Notice tone="danger">{error.message}</Notice>}

      {!loading && !error && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="table-head">
                <tr>
                  <SortHeader field="name" label="User" sort={sort} onToggle={sortBy} className="px-4" />
                  <SortHeader field="department" label="Department" sort={sort} onToggle={sortBy} className="px-4" />
                  <SortHeader field="role" label="Role" sort={sort} onToggle={sortBy} className="px-4" />
                  {/* A list of grants, summarised. There is no single value to rank it by; the
                      department and role columns are how that question actually gets asked. */}
                  <th className="px-4 py-3">Module access</th>
                  {/*
                    The reason this screen needed an ordering at all. Oldest first is the
                    dormant-account list, and a dormant account still holding module grants is
                    exactly the housekeeping an access screen exists to make visible.
                  */}
                  <SortHeader field="lastLoginAt" label="Last sign-in" sort={sort} onToggle={sortBy} className="px-4" />
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/[0.04]">
                {rows.map((row) => {
                  /*
                   * Counted by the level actually held, so the middle one is not swallowed.
                   *
                   * Subtracting write from read made every level that is neither into "read",
                   * which meant a marketing person who may raise and send quotations was
                   * summarised as a reader — the one row on this screen that had to be right.
                   */
                  const writable = row.modules.filter((module) => module.canWrite).length;
                  const quoting = row.modules.filter(
                    (module) => module.canQuote && !module.canWrite
                  ).length;
                  const readable = row.modules.filter(
                    (module) => module.canRead && !module.canQuote && !module.canWrite
                  ).length;

                  return (
                    <tr key={row.id} className="row-hover">
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-steel-100">
                          {row.name} {!row.isActive && <Badge tone="neutral">Inactive</Badge>}{' '}
                          {row.isActive && row.invitationPending && <Badge tone="progress">Invitation pending</Badge>}
                        </p>
                        <p className="text-xs text-steel-400">{row.email}</p>
                      </td>
                      <td className="px-4 py-3.5 text-steel-200">
                        {departmentLabel(row.department)}
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge tone={row.role === 'admin' ? 'accent' : 'neutral'}>
                          {row.role === 'admin' ? 'Admin' : 'Member'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5">
                        {row.role === 'admin' ? (
                          <span className="text-xs text-steel-400">All modules</span>
                        ) : (
                          <span className="text-xs tabular-nums text-steel-300">
                            {[
                              `${writable} write`,
                              quoting ? `${quoting} quote` : null,
                              `${readable} read`,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-steel-400">
                        {row.lastLoginAt ? formatDate(row.lastLoginAt) : 'Never'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right">
                        {mayWrite && (
                          <div className="flex justify-end gap-3">
                            {row.isActive && row.invitationPending && (
                              <button type="button" className="row-action" onClick={() => resend(row)}>
                                Resend invite
                              </button>
                            )}
                            {row.role !== 'admin' && (
                              <button
                                type="button"
                                className="row-action"
                                onClick={() => setEditingAccess(row)}
                              >
                                Access
                              </button>
                            )}
                            <button
                              type="button"
                              className="row-action-danger"
                              onClick={() => setDeleting(row)}
                            >
                              Offboard
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-4">
            <Pagination pagination={pagination} onChange={turnTo} />
          </div>
        </div>
      )}

      <Modal
        open={creating && Boolean(catalogue)}
        title="New user"
        description="Create the account, allocate a department and grant module access"
        size="lg"
        onClose={() => setCreating(false)}
      >
        {catalogue && (
          <UserForm
            catalogue={catalogue}
            onClose={() => setCreating(false)}
            onSaved={(created, invitation) => {
              setRows((current) => [created, ...current]);
              setInvited({ user: created, invitation });
            }}
          />
        )}
      </Modal>

      <Modal
        open={Boolean(invited)}
        title={invited?.invitation?.delivered ? 'Invitation sent' : 'The email could not be sent'}
        size="sm"
        onClose={() => setInvited(null)}
      >
        {invited && <InvitationResult {...invited} onClose={() => setInvited(null)} />}
      </Modal>

      <Modal
        open={Boolean(editingAccess)}
        title="Module access"
        description="Read lets someone open a module; write lets them change it"
        size="lg"
        onClose={() => setEditingAccess(null)}
      >
        {editingAccess && catalogue && (
          <AccessForm
            user={editingAccess}
            catalogue={catalogue}
            onClose={() => setEditingAccess(null)}
            onSaved={replaceRow}
          />
        )}
      </Modal>

      {deleting && <OffboardUser user={deleting} onClose={() => setDeleting(null)} onSaved={(updated) => { replaceRow(updated); setDeleting(null); }} />}

    </div>
  );
}

/**
 * What became of a welcome email.
 *
 * When it went, that is all there is to say. When it did not — no mail server configured, or
 * it refused — the account still exists, and the link is here so it can be sent another way
 * (WhatsApp, in person). It is shown to the administrator only, and only for this reason.
 */
function InvitationResult({ user, invitation, onClose }) {
  const [copied, setCopied] = useState(false);
  const until = invitation?.expiresAt ? formatDate(invitation.expiresAt) : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invitation.link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-4">
      {invitation?.delivered ? (
        <p className="text-sm text-steel-300">
          {user.name} has been emailed at <strong>{user.email}</strong> with their access and a
          link to set their password{until ? `, valid until ${until}` : ''}.
        </p>
      ) : (
        <>
          <Notice tone="warn">
            {user.name}’s account is ready, but the welcome email did not go. Send them this link
            another way — it lets them set their password{until ? ` until ${until}` : ''}, once.
          </Notice>
          <input className="input font-mono text-xs" readOnly value={invitation?.link || ''} onFocus={(event) => event.target.select()} />
          <button type="button" className="btn-secondary w-full" onClick={copy}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </>
      )}
      <div className="flex justify-end">
        <button type="button" className="btn-primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function OffboardUser({ user, onClose, onSaved }) {
  const [workload, setWorkload] = useState(null);
  const [colleagues, setColleagues] = useState([]);
  const [transferTo, setTransferTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const load = async () => {
    setError(null);
    try {
      const [held, list] = await Promise.all([usersApi.workload(user.id), usersApi.list({ isActive: true, limit: 100 })]);
      /* A book holding buyers goes to marketing or an administrator — the server refuses anyone
         else, so the picker offers only them. Bench work alone may go to any colleague. */
      const buyers = ['customers', 'leads', 'enquiries', 'quotations', 'orders'].some((key) => held[key] > 0);
      setWorkload(held);
      setColleagues(list.data.filter((row) => row.id !== user.id && row.isActive && (!buyers || mayHoldBuyers(row))));
    } catch (err) { setError(err); }
  };
  useEffect(() => { load(); }, [user.id]);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError(null);
    try { onSaved(await usersApi.remove(user.id, transferTo || undefined)); }
    catch (err) { setError(err); }
    finally { setBusy(false); }
  };
  return <Modal open title={`Offboard ${user.name}`} onClose={busy ? undefined : onClose} size="sm">
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-steel-300">Deactivate sign-in and hand over their work. Existing records and history are retained.</p>
      {!workload && !error && <Spinner label="Checking assigned work" />}
      {workload && <><p className="text-sm">{workload.open} records need a new owner.</p>
        {workload.open > 0 && <Field label="Transfer work to" required><select className="input" required value={transferTo} onChange={(event) => setTransferTo(event.target.value)}><option value="">Choose an active colleague</option>{colleagues.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.email}</option>)}</select></Field>}</>}
      {error && <Notice>{error.message}</Notice>}
      {!workload && error && <button type="button" className="btn-secondary" onClick={load}>Try again</button>}
      <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="btn-danger" disabled={busy || !workload || (workload.open > 0 && !transferTo)}>{busy ? 'Transferring…' : 'Offboard user'}</button></div>
    </form>
  </Modal>;
}
