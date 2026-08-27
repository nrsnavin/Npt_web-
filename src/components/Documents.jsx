import { useCallback, useRef, useState } from 'react';
import { documents as documentsApi, files } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import { ConfirmDialog, Field, Modal, Notice, Section, Spinner } from './ui.jsx';
import { formatDate } from '../utils/format.js';

/**
 * Files on a record [§27] — the buyer's drawing, the print artwork, the signed approval.
 *
 * Before this, everything except a sample photo lived in somebody's email, which is the
 * filing cabinet this system exists to replace. Access is the record's own: a drawing is
 * exactly as confidential as the customer it hangs off, and the server enforces that on
 * every route here.
 *
 * Downloads go through the API client rather than a plain link, because a stored file needs
 * the session's token and an `<a href>` carries none.
 */

const KB = 1024;
const readableSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < KB) return `${bytes} B`;
  if (bytes < KB * KB) return `${Math.round(bytes / KB)} KB`;
  return `${(bytes / KB / KB).toFixed(1)} MB`;
};

const isPdf = (mimeType) => String(mimeType).includes('pdf');

function DocumentRow({ document: file, canRemove, onRemove }) {
  const [busy, setBusy] = useState(false);

  const open = async () => {
    setBusy(true);
    try {
      const blob = await files.blob(file.key);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      // Held long enough for the new tab to have read it; revoking at once shows a blank tab.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex items-center gap-3 rounded-lg border border-line/[0.06] px-3.5 py-3">
      <span aria-hidden className="text-lg text-steel-500">{isPdf(file.mimeType) ? '▤' : '▣'}</span>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={open}
          disabled={busy}
          className="truncate text-left text-sm font-semibold text-steel-100 hover:text-accent disabled:opacity-60"
        >
          {file.title || file.filename}
        </button>
        <p className="truncate text-xs text-steel-500">
          {[
            file.title && file.filename,
            readableSize(file.size),
            file.uploadedBy?.name,
            formatDate(file.createdAt),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      {canRemove && (
        <button
          type="button"
          className="shrink-0 text-xs font-semibold text-steel-500 hover:text-danger-400"
          onClick={() => onRemove(file)}
        >
          Remove
        </button>
      )}
    </li>
  );
}

export default function Documents({ collection, id, canWrite = true, title = 'Documents' }) {
  const { user, isAdmin } = useAuth();
  const [error, setError] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const [removing, setRemoving] = useState(false);
  const inputRef = useRef(null);

  const fetch = useCallback(
    (recordId) => documentsApi.list({ collection, id: recordId }),
    [collection]
  );
  const { data, loading, error: loadError, reload } = useRecord(fetch, id);

  /*
   * Picking the file opens the dialog rather than uploading straight away, so the title can
   * be asked for before the bytes go. "IMG_4821.pdf" tells the next reader nothing, and the
   * next reader is usually somebody hunting for the approved drawing among six that all came
   * off the same phone.
   */
  const choose = (event) => {
    const file = event.target.files?.[0];
    // Cleared straight away, so choosing the same file twice still fires a change.
    event.target.value = '';
    if (!file) return;
    setError(null);
    setChosen({ file, title: '' });
  };

  const upload = async () => {
    setUploading(true);
    setError(null);
    try {
      await documentsApi.add({
        collection,
        id,
        file: chosen.file,
        title: chosen.title.trim() || undefined,
      });
      setChosen(null);
      reload();
    } catch (uploadError) {
      setError(uploadError);
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    setError(null);
    try {
      await documentsApi.remove({ collection, id, documentId: pendingRemoval._id });
      setPendingRemoval(null);
      reload();
    } catch (removeError) {
      setError(removeError);
      setPendingRemoval(null);
    } finally {
      setRemoving(false);
    }
  };

  if (loadError) return null;

  return (
    <Section
      title={title}
      actions={
        canWrite && (
          <>
            <button
              type="button"
              className="btn-secondary px-3 py-1.5 text-xs"
              onClick={() => inputRef.current?.click()}
            >
              + Attach
            </button>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept="application/pdf,image/*"
              onChange={choose}
            />
          </>
        )
      }
    >
      {error && (
        <div className="mb-3">
          <Notice tone="danger">{error.message}</Notice>
        </div>
      )}

      {loading ? (
        <Spinner label="Loading documents" />
      ) : data?.length ? (
        <ul className="space-y-2">
          {data.map((file) => (
            <DocumentRow
              key={file._id}
              document={file}
              /* Only whoever attached it, or an administrator — the server says the same. The
                 person who put it there is the one who knows it is still the right version. */
              canRemove={canWrite && (isAdmin || String(file.uploadedBy?._id) === String(user?.id))}
              onRemove={setPendingRemoval}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-steel-500">
          No documents yet. Drawings, artwork and signed approvals belong here rather than in
          somebody's inbox.
        </p>
      )}

      <Modal
        open={Boolean(chosen)}
        title="Attach a document"
        description="Give it a name the next person will recognise"
        onClose={() => setChosen(null)}
      >
        <div className="space-y-4">
          <p className="truncate text-sm text-steel-300">
            {chosen?.file.name}{' '}
            <span className="text-steel-500">({readableSize(chosen?.file.size)})</span>
          </p>

          <Field label="What is it?" hint="Buyer drawing, print artwork, signed approval…">
            <input
              className="input"
              autoFocus
              value={chosen?.title ?? ''}
              onChange={(event) => setChosen((current) => ({ ...current, title: event.target.value }))}
              onKeyDown={(event) => event.key === 'Enter' && upload()}
            />
          </Field>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setChosen(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={uploading} onClick={upload}>
              {uploading ? 'Uploading…' : 'Attach'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingRemoval)}
        title="Remove this document?"
        message={`${pendingRemoval?.title || pendingRemoval?.filename} will be deleted for everyone. This cannot be undone.`}
        confirmLabel="Remove"
        busy={removing}
        onConfirm={remove}
        onClose={() => setPendingRemoval(null)}
      />
    </Section>
  );
}
