import { useState } from 'react';
import { files as filesApi, orders as ordersApi } from '../api/endpoints.js';
import { formatDate } from '../utils/format.js';

/**
 * A line's hook, clip and print, and its print reference [server: orderParts.service] — on the
 * sales order and on the Production workflow page, so the plant makes and prints from what the
 * order says.
 */

const PART_LABEL = { hook: 'Hook', clip: 'Clip', print: 'Print' };

/** Hook · Clip · Print, each by name; the mould's default marked as such, two at one price said. */
export function PartsList({ parts, className = '' }) {
  const named = Object.entries(PART_LABEL).filter(([kind]) => parts?.[kind]);
  if (!named.length) return <p className={`text-xs text-steel-500 ${className}`}>No hook, clip or print</p>;
  return (
    <dl className={`grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs ${className}`}>
      {named.map(([kind, label]) => {
        const part = parts[kind];
        return (
          <div key={kind} className="contents">
            <dt className="text-steel-500">{label}</dt>
            <dd className="min-w-0 break-words text-steel-200">
              {part.name}
              {part.from === 'mould' && (
                <span className="ml-1 text-steel-500" title="From the mould’s default cost, matched to the register at the same price">
                  {part.choices > 1 ? '· mould default, pick one on the line' : '· mould default'}
                </span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** A stored file, opened in a new tab — the file route needs the session, so it is fetched first. */
export function FileLink({ file, label, className = '' }) {
  if (!file?.key) return null;
  const open = async () => {
    const url = URL.createObjectURL(await filesApi.blob(file.key));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  return (
    <button type="button" className={`text-xs font-semibold text-accent hover:underline ${className}`} onClick={open}>
      {label || file.filename || 'Open the file'}
    </button>
  );
}

/** The print reference as it reads: the words, the artwork, who gave it. `reference` is the server's shape on either screen. */
export function PrintReferenceView({ reference }) {
  if (!reference) return null;
  const file = reference.file || (reference.attachment?.key ? reference.attachment : null);
  const by = reference.by?.name || reference.by;
  return (
    <div className="rounded-lg border border-accent/20 bg-accent/[0.05] px-2 py-1.5 text-xs">
      <p className="font-semibold text-accent">Print reference</p>
      {reference.text && <p className="whitespace-pre-line text-steel-200">{reference.text}</p>}
      {file && <FileLink file={file} label={`Artwork: ${file.filename || 'open'}`} />}
      {(by || reference.at) && <p className="text-steel-500">{[by, reference.at && formatDate(reference.at)].filter(Boolean).join(' · ')}</p>}
    </div>
  );
}

/** The print reference on an order line, with Add / Edit for whoever may give it. */
export function PrintReference({ order, line, mayEdit, onSaved }) {
  const reference = line.printReference?.text || line.printReference?.attachment ? line.printReference : null;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(reference?.text || '');
  const [file, setFile] = useState(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const save = async () => {
    setBusy(true);
    setProblem('');
    try {
      onSaved(await ordersApi.setPrintReference({ id: order._id, lineId: line._id, text, file, removeFile }));
      setOpen(false);
      setFile(null);
      setRemoveFile(false);
    } catch (failure) {
      setProblem(failure?.response?.data?.message || failure.message || 'Not saved');
    } finally {
      setBusy(false);
    }
  };

  if (open) {
    return (
      <div className="mt-2 space-y-2 rounded-lg border border-line/[0.1] p-2">
        <label className="block text-xs text-steel-400">
          Print reference
          <textarea
            className="input mt-1 min-h-[3.5rem] text-sm"
            maxLength={500}
            placeholder="Artwork number, colours (Pantone), where the logo goes"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <label className="block text-xs text-steel-400">
          Artwork (photo or PDF, optional)
          <input type="file" accept="image/*,application/pdf" className="mt-1 block w-full text-xs" onChange={(event) => setFile(event.target.files?.[0] || null)} />
        </label>
        {reference?.attachment && !file && (
          <label className="flex items-center gap-2 text-xs text-steel-300">
            <input type="checkbox" checked={removeFile} onChange={(event) => setRemoveFile(event.target.checked)} />
            Take off the attached artwork ({reference.attachment.filename || 'file'})
          </label>
        )}
        {problem && <p className="text-xs text-danger-400">{problem}</p>}
        <div className="flex gap-2">
          <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={busy || (!text.trim() && !file && !reference)} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-2 space-y-1">
      <PrintReferenceView reference={reference} />
      {mayEdit && (
        <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={() => { setText(reference?.text || ''); setOpen(true); }}>
          {reference ? 'Edit print reference' : '+ Add print reference'}
        </button>
      )}
    </div>
  );
}
