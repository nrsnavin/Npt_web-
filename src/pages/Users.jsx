import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { users as usersApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, ConfirmDialog, Field, Modal, Notice, PageHeader, Spinner } from '../components/ui.jsx';
import { formatDate, humanise } from '../utils/format.js';

/** Grants are edited as a map of module key to level, then flattened on save. */
const grantsToMap = (moduleAccess = []) =>
  Object.fromEntries(moduleAccess.map((grant) => [grant.module, grant.level]));

const mapToGrants = (map) =>
  Object.entries(map)
    .filter(([, level]) => level === 'read' || level === 'write')
    .map(([module, level]) => ({ module, level }));

/**
 * Three-state control per module: none, read or write. A segmented control makes the
 * current level obvious at a glance across a long list, which a checkbox pair does not.
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

  const options = [
    { value: 'none', label: 'None' },
    { value: 'read', label: 'Read' },
    { value: 'write', label: 'Write' },
  ];

  return (
    <div className="space-y-5">
      {grouped.map(([group, items]) => (
        <div key={group}>
          <p className="eyebrow mb-2">{group}</p>
          <ul className="space-y-2">
            {items.map((module) => {
              const level = value[module.key] || 'none';
              return (
                <li key={module.key} className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-steel-100">
                      {module.label}
                      {!module.available && (
                        <span className="ml-2 text-[0.6875rem] font-bold uppercase tracking-wide text-steel-500">
                          Soon
                        </span>
                      )}
                    </p>
                  </div>

                  <div
                    role="radiogroup"
                    aria-label={`Access to ${module.label}`}
                    className="tab-track shrink-0 grid-cols-3"
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
      onSaved(
        await usersApi.create({
          ...values,
          phone: values.phone || undefined,
          moduleAccess: values.role === 'admin' ? [] : mapToGrants(grants),
        })
      );
      onClose();
    } catch (submitError) {
      setError(submitError);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" error={errors.name}>
          <input className="input" {...register('name', { required: 'Name is required' })} />
        </Field>
        <Field label="Email" error={errors.email}>
          <input
            type="email"
            className="input"
            {...register('email', { required: 'Email is required' })}
          />
        </Field>
        <Field label="Phone" hint="Optional — enables SMS sign-in">
          <input type="tel" className="input" {...register('phone')} />
        </Field>
        <Field
          label="Temporary password"
          hint="At least 8 characters"
          error={errors.password}
        >
          <input
            type="text"
            className="input"
            {...register('password', {
              required: 'Password is required',
              minLength: { value: 8, message: 'At least 8 characters' },
            })}
          />
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

      {error && (
        <Notice tone="danger">
          <p>{error.message}</p>
          {error.details?.map((detail) => (
            <p key={detail.field} className="text-xs">
              {detail.field}: {detail.message}
            </p>
          ))}
        </Notice>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create user'}
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

  const [creating, setCreating] = useState(false);
  const [editingAccess, setEditingAccess] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const mayWrite = canWrite('users');

  const load = async (term = search) => {
    setLoading(true);
    setError(null);
    try {
      const [cat, list] = await Promise.all([
        catalogue ? Promise.resolve(catalogue) : usersApi.catalogue(),
        usersApi.list({ search: term || undefined, limit: 100 }),
      ]);
      setCatalogue(cat);
      setRows(list.data);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        className="mb-5 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          load();
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
      </form>

      {loading && <Spinner label="Loading users" />}
      {error && <Notice tone="danger">{error.message}</Notice>}

      {!loading && !error && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Module access</th>
                  <th className="px-4 py-3">Last sign-in</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/[0.04]">
                {rows.map((row) => {
                  const writable = row.modules.filter((module) => module.canWrite).length;
                  const readable = row.modules.filter((module) => module.canRead).length;

                  return (
                    <tr key={row.id} className="row-hover">
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-steel-100">{row.name}</p>
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
                            {writable} write · {readable - writable} read
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-steel-400">
                        {row.lastLoginAt ? formatDate(row.lastLoginAt) : 'Never'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right">
                        {mayWrite && (
                          <div className="flex justify-end gap-3">
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
                              Delete
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
            onSaved={(created) => setRows((current) => [created, ...current])}
          />
        )}
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

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete user"
        message={`This permanently removes ${deleting?.name}'s account. This cannot be undone.`}
        confirmLabel="Delete"
        busy={busy}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await usersApi.remove(deleting.id);
            setRows((current) => current.filter((row) => row.id !== deleting.id));
            setDeleting(null);
          } catch (deleteError) {
            setError(deleteError);
            setDeleting(null);
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
