import { useEffect, useState } from 'react';
import { workspace } from '../api/endpoints.js';
import TaskPdfLink from './TaskPdfLink.jsx';
import { formatDate } from '../utils/format.js';

/**
 * The PDFs on department tasks, shown with the records they are about [server: taskPdfs.service]:
 * the PDF sent with a Sample Request on the sample, with a Create Quotation on the quotation, with
 * the PO & SO on the sales order, with the Production request on the production pages — and the
 * PDF a department finished its task with. A file attached to a task is never only on the task.
 */

/** The files for these enquiries and tasks, of these kinds; `{ byEnquiry, byTask }`, empty while loading. */
export function useTaskPdfs({ enquiries = [], tasks = [], kinds = [] }) {
  const [pdfs, setPdfs] = useState({ byEnquiry: {}, byTask: {} });
  const key = [enquiries.filter(Boolean).join(','), tasks.filter(Boolean).join(','), kinds.join(',')].join('|');
  useEffect(() => {
    const [e, t, k] = key.split('|');
    if (!e && !t) return undefined;
    let live = true;
    workspace.taskPdfs({ enquiries: e ? e.split(',') : [], tasks: t ? t.split(',') : [], kinds: k ? k.split(',') : [] })
      .then((value) => live && setPdfs(value || { byEnquiry: {}, byTask: {} }))
      .catch(() => {});
    return () => { live = false; };
  }, [key]);
  return pdfs;
}

/** An id as a record carries it: the id itself, or the populated record's. */
export const idOf = (value) => (value && typeof value === 'object' ? value._id : value) || null;

/** Files without the ones a page already shows (the SO document on a sales order). */
const without = (files, skip = []) => (files || []).filter((file) => !skip.filter(Boolean).includes(file.key));

/** A record page's documents from its tasks: each PDF, what it is, when. Nothing when there are none. */
export function TaskPdfList({ files, skip, title = 'PDFs from the tasks', className = '' }) {
  const shown = without(files, skip);
  if (!shown.length) return null;
  return (
    <section aria-label={title} className={`card space-y-2 p-4 ${className}`}>
      <p className="text-sm font-semibold text-steel-100">{title}</p>
      <ul className="space-y-1.5">
        {shown.map((file) => (
          <li key={file.key} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <TaskPdfLink file={file} className="text-sm" />
            <span className="text-xs text-steel-500">{file.title}{file.at ? ` · ${formatDate(file.at)}` : ''}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A list row's PDFs, small: one link each, the first two. */
export function TaskPdfChips({ files, skip }) {
  const shown = without(files, skip);
  if (!shown.length) return null;
  return (
    <span className="flex flex-col items-start gap-0.5">
      {shown.slice(0, 2).map((file) => <TaskPdfLink key={file.key} file={file} className="max-w-[12rem] truncate" />)}
      {shown.length > 2 && <span className="text-xs text-steel-500">+{shown.length - 2} more</span>}
    </span>
  );
}
