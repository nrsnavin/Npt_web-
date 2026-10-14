import { useEffect, useState } from 'react';
import { enquiries as enquiriesApi } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { Modal, Notice } from './ui.jsx';
import { formatDate } from '../utils/format.js';
import { checkFieldsOf, checkPayloadOf, checkProblem } from '../utils/enquiryCheck.js';

/**
 * "Enquiry details · Edit and verify" — what was captured, to be read through, corrected and
 * marked as checked. Until it is, no department is asked for anything on the enquiry
 * [server: Enquiry `checkPending`]. The company and number are the buyer's, so a correction
 * lands on the customer's own record.
 */

/** A labelled box, the field inside it, as the plant's own screen draws them. */
function Box({ label, className = '', children }) {
  return (
    <label className={`block rounded-xl border border-line/[0.12] bg-ink-900 px-3 py-2 focus-within:border-accent ${className}`}>
      <span className="block text-xs text-steel-400">{label}</span>
      {children}
    </label>
  );
}

const fieldClass = 'mt-0.5 w-full border-0 bg-transparent p-0 text-sm font-semibold text-steel-50 placeholder:font-normal placeholder:text-steel-500 focus:outline-none focus:ring-0';

/** The chat screenshot or card the enquiry was read from, full size. */
function SourcePicture({ enquiryId, count, onClose }) {
  const [at, setAt] = useState(0);
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let objectUrl;
    let live = true;
    setUrl(null);
    setFailed(false);
    enquiriesApi.sourceImage(enquiryId, at)
      .then((blob) => {
        if (!live) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [enquiryId, at]);
  return (
    <Modal open title="Captured screenshot" description="The picture this enquiry was read from" size="lg" onClose={onClose}>
      <div className="space-y-3">
        {failed ? (
          <Notice tone="danger">The picture could not be loaded.</Notice>
        ) : url ? (
          <img src={url} alt="The picture the enquiry was read from" className="mx-auto max-h-[70vh] rounded-lg border border-line/[0.1]" />
        ) : (
          <p className="py-10 text-center text-sm text-steel-400">Loading…</p>
        )}
        {count > 1 && (
          <div className="flex justify-center gap-1.5">
            {Array.from({ length: count }, (unused, index) => (
              <button key={index} type="button" className={index === at ? 'btn-primary px-3 py-1 text-xs' : 'btn-secondary px-3 py-1 text-xs'} onClick={() => setAt(index)}>
                {index + 1}
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function EnquiryCheckCard({ enquiry, canWrite, onSaved }) {
  const { toast } = useToast();
  const [opened, setOpened] = useState(() => checkFieldsOf(enquiry));
  const [form, setForm] = useState(opened);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [source, setSource] = useState(null);
  const [viewing, setViewing] = useState(false);
  const pending = Boolean(enquiry.checkPending);

  /* A fresh read of the enquiry — after a save, or another change — starts the form again. */
  useEffect(() => {
    const fields = checkFieldsOf(enquiry);
    setOpened(fields);
    setForm(fields);
  }, [enquiry._id, enquiry.updatedAt]);

  useEffect(() => {
    let live = true;
    enquiriesApi.source(enquiry._id).then((found) => live && setSource(found)).catch(() => live && setSource(null));
    return () => { live = false; };
  }, [enquiry._id]);

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const save = async () => {
    const wrong = checkProblem(form);
    if (wrong) { setProblem(wrong); return; }
    setBusy(true);
    setProblem(null);
    try {
      const saved = await enquiriesApi.check(checkPayloadOf(form, opened, enquiry));
      toast(pending ? `${enquiry.number} checked — departments can be asked now` : 'Enquiry details saved');
      onSaved?.(saved);
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };

  const readOnly = !canWrite;
  return (
    <section className={`rounded-xl border p-3.5 ${pending ? 'border-warn-500/40 bg-warn-500/[0.06]' : 'border-line/[0.1] bg-line/[0.02]'}`} aria-label="Enquiry details">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-steel-100">Enquiry details · Edit and verify</h3>
          <p className="mt-0.5 text-xs text-steel-400">
            {pending
              ? 'Correct the captured details, then save. Sampling, Quotation and department actions will be enabled only after saving.'
              : `Checked${enquiry.checkedBy?.name ? ` by ${enquiry.checkedBy.name}` : ''}${enquiry.checkedAt ? ` on ${formatDate(enquiry.checkedAt)}` : ''}. A correction saved here goes on the customer too.`}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${pending ? 'bg-warn-500/15 text-warn-400' : 'bg-success-500/15 text-success-400'}`}>
          {pending ? 'Check pending' : 'Checked'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Box label="Company">
          <input className={fieldClass} value={form.company} onChange={set('company')} readOnly={readOnly} placeholder="Company name" aria-label="Company" />
        </Box>
        <Box label="Contact person">
          <input className={fieldClass} value={form.contactPerson} onChange={set('contactPerson')} readOnly={readOnly} placeholder="Enter contact name" aria-label="Contact person" />
        </Box>
        <Box label="WhatsApp number">
          <input className={fieldClass} value={form.whatsapp} onChange={set('whatsapp')} readOnly={readOnly} inputMode="tel" placeholder="+91 98xxx xxxxx" aria-label="WhatsApp number" />
        </Box>
        <Box label="Model">
          <input className={fieldClass} value={form.modelNumber} onChange={set('modelNumber')} readOnly={readOnly} placeholder="Model asked for" aria-label="Model" />
        </Box>
        <Box label="Quantity">
          <input className={fieldClass} value={form.quantity} onChange={set('quantity')} readOnly={readOnly} inputMode="numeric" placeholder="Pieces" aria-label="Quantity" />
        </Box>
        <Box label="Material / Colour">
          <input className={fieldClass} value={form.materialColour} onChange={set('materialColour')} readOnly={readOnly} placeholder="Example: PP black" aria-label="Material / Colour" />
        </Box>
        <Box label="Customer requirement" className="col-span-2">
          <textarea rows={2} className={`${fieldClass} resize-y`} value={form.remarks} onChange={set('remarks')} readOnly={readOnly} placeholder="What the buyer asked for" aria-label="Customer requirement" />
        </Box>
      </div>

      {problem && <div className="mt-2"><Notice tone="danger">{problem}</Notice></div>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canWrite && (
          <button type="button" className="btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : pending ? '✓ Save & Mark as Checked' : 'Save changes'}
          </button>
        )}
        {source && (
          <button type="button" className="btn-secondary" onClick={() => setViewing(true)}>View screenshot</button>
        )}
      </div>

      {viewing && source && <SourcePicture enquiryId={enquiry._id} count={source.images} onClose={() => setViewing(false)} />}
    </section>
  );
}
