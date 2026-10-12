import { useState } from 'react';
import { Modal, Notice } from './ui.jsx';

/**
 * Deleting a register record — a mould, a bought-in item — Admin's, and asked first.
 *
 * The server refuses a record something still uses (an enquiry, a quotation, a run) and says
 * where [server: services/recordUsage.service.js]; this turns that refusal into the way out it
 * names: retire the record instead, which takes it off every picker and keeps the history.
 */
export default function DeleteRecordButton({ name, onDelete, onRetire, retireLabel = 'Retire it instead', onDone, className = 'row-action text-danger-400' }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState(null);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setRefusal(null);
  };
  /* `onDone('deleted' | 'retired')`: a detail page leaves after a delete, and stays after a retire. */
  const run = async (action, outcome) => {
    setBusy(true);
    try {
      await action();
      setOpen(false);
      setRefusal(null);
      onDone?.(outcome);
    } catch (failure) {
      setRefusal({ message: failure.message, inUse: failure.status === 409 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>Delete</button>
      <Modal open={open} title={`Delete ${name}?`} onClose={close} size="sm">
        {refusal ? (
          <Notice tone={refusal.inUse ? 'warn' : 'danger'}>{refusal.message}</Notice>
        ) : (
          <p className="text-sm leading-relaxed text-steel-300">
            {name} is removed from the register, with its photo. This cannot be undone.
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={close} disabled={busy}>Cancel</button>
          {refusal?.inUse && onRetire ? (
            <button type="button" className="btn-primary" onClick={() => run(onRetire, 'retired')} disabled={busy}>
              {busy ? 'Working…' : retireLabel}
            </button>
          ) : (
            !refusal && (
              <button type="button" className="btn-danger" onClick={() => run(onDelete, 'deleted')} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            )
          )}
        </div>
      </Modal>
    </>
  );
}
