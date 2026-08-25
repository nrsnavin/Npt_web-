import { ErrorState, EmptyState, TableSkeleton } from './ui.jsx';

/**
 * Table with built-in loading, error, empty and pagination handling.
 * `columns` entries are { key, header, render?, className? }.
 */
export default function DataTable({
  columns,
  rows = [],
  loading,
  error,
  onRetry,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyAction,
  onRowClick,
  pagination,
  onPageChange,
}) {
  if (loading) return <TableSkeleton columns={Math.min(columns.length, 6)} />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (!rows.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div className="card animate-fade-up overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="table-head">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={`whitespace-nowrap px-4 py-3 ${column.className || ''}`}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line/[0.04]">
            {rows.map((row) => (
              <tr
                key={row._id || row.id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`row-hover ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-4 py-3.5 align-middle text-steel-200 ${column.className || ''}`}
                  >
                    {column.render ? column.render(row) : row[column.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between gap-4 border-t border-line/[0.06] px-4 py-3 text-[0.8125rem] text-steel-400">
          <span>
            Page <span className="font-semibold text-steel-200">{pagination.page}</span> of{' '}
            {pagination.pages} · {pagination.total} records
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary px-3 py-1.5"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn-secondary px-3 py-1.5"
              disabled={pagination.page >= pagination.pages}
              onClick={() => onPageChange(pagination.page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
