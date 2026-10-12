import { useCallback, useEffect, useRef, useState } from 'react';
import { workspace } from '../api/endpoints.js';
import TaskPdfLink from './TaskPdfLink.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatDate } from '../utils/format.js';

/**
 * The papers a department keeps on its task [server: config/departmentTaskForms.js `documents`]:
 * Dispatch's invoice and dispatch details, Reception's dispatch details. Uploading one moves
 * nothing — marketing attaches it when writing to the buyer from the enquiry. Shown on a closed
 * task too: the invoice often follows the goods.
 */
const LIMIT = 1024 * 1024;

export default function TaskDocuments({ todo, kinds = [] }) {
  const [files, setFiles] = useState(null);
  const [busy, setBusy] = useState(null);
  const [problem, setProblem] = useState(null);
  const picker = useRef(null);
  const choosing = useRef(null);
  const { toast } = useToast();

  const load = useCallback(() => workspace.todos.documents(todo._id).then(setFiles).catch(() => setFiles([])), [todo._id]);
  useEffect(() => { if (kinds.length) load(); }, [load, kinds.length]);
  if (!kinds.length) return null;

  const pick = (kind) => {
    choosing.current = kind;
    setProblem(null);
    picker.current?.click();
  };
  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const kind = choosing.current;
    if (!file || !kind) return;
    if (file.size > LIMIT) return setProblem('That file is too large — the limit is 1 MB');
    setBusy(kind.type);
    try {
      await workspace.todos.addDocument({ id: todo._id, docType: kind.type, file });
      toast(`${kind.label} uploaded`, 'Marketing can attach it when writing to the buyer.');
      await load();
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(null);
    }
    return null;
  };

  return (
    <div className="space-y-2 rounded-lg border border-line/[0.08] p-2.5" aria-label="Documents on this task">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-steel-400">Documents</span>
        {kinds.map((kind) => (
          <button key={kind.type} type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={Boolean(busy)} onClick={() => pick(kind)}>
            {busy === kind.type ? 'Uploading…' : `Upload ${kind.label}`}
          </button>
        ))}
        <input ref={picker} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" aria-label="Choose the document" onChange={upload} />
      </div>
      {problem && <p className="text-xs text-danger-400">{problem}</p>}
      {files?.length > 0 && (
        <ul className="space-y-1">
          {files.map((file) => (
            <li key={file._id} className="flex flex-wrap items-center gap-x-2 text-xs text-steel-400">
              <span className="font-semibold text-steel-200">{file.title || file.docType}</span>
              <TaskPdfLink file={file} />
              <span>· {file.uploadedBy?.name || 'someone'} · {formatDate(file.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
