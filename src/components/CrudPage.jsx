import { useState } from 'react';
import { useForm } from 'react-hook-form';
import DataTable from './DataTable.jsx';
import Toolbar from './Toolbar.jsx';
import { ConfirmDialog, Field, Modal, PageHeader } from './ui.jsx';
import { useListParams, useResource } from '../hooks/useResource.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * List + create/edit/delete screen driven by a declarative spec.
 * Fields are { name, label, type, options?, required?, hint?, span?, defaultValue? }
 * where type is one of text, number, email, date, select, textarea, checkbox.
 */
function AutoForm({ fields, record, onSubmit, onClose, saving, error, submitLabel }) {
  const defaults = Object.fromEntries(
    fields.map((field) => [
      field.name,
      record?.[field.name] ??
        (field.type === 'date' && record?.[field.name]
          ? String(record[field.name]).slice(0, 10)
          : field.defaultValue ?? (field.type === 'checkbox' ? false : ''))
    ])
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ defaultValues: defaults });

  const submit = (values) => {
    const payload = {};
    for (const field of fields) {
      const value = values[field.name];
      if (field.type === 'number') {
        payload[field.name] = value === '' || value === null ? undefined : Number(value);
      } else if (field.type === 'checkbox') {
        payload[field.name] = Boolean(value);
      } else {
        payload[field.name] = value === '' ? undefined : value;
      }
    }
    return onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <Field
            key={field.name}
            label={field.label}
            hint={field.hint}
            error={errors[field.name]}
            className={field.span === 2 ? 'sm:col-span-2' : ''}
          >
            {field.type === 'select' ? (
              <select
                className="input"
                {...register(field.name, field.required && { required: `${field.label} is required` })}
              >
                {!field.required && <option value="">—</option>}
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : field.type === 'textarea' ? (
              <textarea
                rows={3}
                className="input"
                {...register(field.name, field.required && { required: `${field.label} is required` })}
              />
            ) : field.type === 'checkbox' ? (
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" {...register(field.name)} />
            ) : (
              <input
                type={field.type || 'text'}
                step={field.type === 'number' ? 'any' : undefined}
                className={`input ${field.uppercase ? 'uppercase' : ''}`}
                {...register(field.name, field.required && { required: `${field.label} is required` })}
              />
            )}
          </Field>
        ))}
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error.message}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

export default function CrudPage({
  title,
  subtitle,
  resourceKey,
  resource,
  columns,
  fields,
  searchPlaceholder = 'Search…',
  filters = [],
  writeRoles = [],
  entityName = 'record',
  defaultParams = {},
  formSize = 'md',
}) {
  const { can } = useAuth();
  const { params, setPage, setFilter } = useListParams(defaultParams);
  const { rows, pagination, isLoading, error, refetch, create, update, remove } = useResource(
    resourceKey,
    resource,
    params
  );

  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const canWrite = can(...writeRoles);

  const tableColumns = canWrite
    ? [
        ...columns,
        {
          key: '__actions',
          header: '',
          className: 'text-right whitespace-nowrap',
          render: (row) => (
            <div className="flex justify-end gap-3">
              <button type="button" className="text-sm text-brand-600 hover:underline" onClick={() => setEditing(row)}>
                Edit
              </button>
              {can() && (
                <button type="button" className="text-sm text-rose-600 hover:underline" onClick={() => setDeleting(row)}>
                  Delete
                </button>
              )}
            </div>
          ),
        },
      ]
    : columns;

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          canWrite && (
            <button type="button" className="btn-primary" onClick={() => setEditing({})}>
              + New {entityName}
            </button>
          )
        }
      />

      <Toolbar
        search={params.search || ''}
        onSearchChange={(value) => setFilter('search', value)}
        placeholder={searchPlaceholder}
        filters={filters.map((filter) => ({
          ...filter,
          value: params[filter.key] || '',
          onChange: (value) => setFilter(filter.key, value),
        }))}
      />

      <DataTable
        columns={tableColumns}
        rows={rows}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        pagination={pagination}
        onPageChange={setPage}
        emptyTitle={`No ${entityName}s yet`}
        emptyDescription={canWrite ? `Create your first ${entityName} to get started.` : undefined}
      />

      <Modal
        open={Boolean(editing)}
        title={editing?._id ? `Edit ${entityName}` : `New ${entityName}`}
        onClose={() => setEditing(null)}
        size={formSize}
      >
        {editing && (
          <AutoForm
            fields={fields}
            record={editing._id ? editing : null}
            saving={create.isPending || update.isPending}
            error={create.error || update.error}
            submitLabel={editing._id ? 'Save changes' : `Create ${entityName}`}
            onClose={() => setEditing(null)}
            onSubmit={async (values) => {
              if (editing._id) await update.mutateAsync({ id: editing._id, ...values });
              else await create.mutateAsync(values);
              setEditing(null);
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${entityName}`}
        message={`This permanently removes "${deleting?.name || deleting?.number || ''}". This cannot be undone.`}
        confirmLabel="Delete"
        busy={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await remove.mutateAsync(deleting._id);
          setDeleting(null);
        }}
      />
    </div>
  );
}
