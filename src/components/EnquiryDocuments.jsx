import { useCallback, useEffect, useRef, useState } from 'react';
import { documents as documentsApi, enquiries as enquiriesApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { ConfirmDialog, Field, Modal, Notice, Section, Spinner } from './ui.jsx';
import { formatDate } from '../utils/format.js';

/**
 * Every paper on the enquiry, in one place [server: enquiryDocuments.service `documentsFor`]:
 *
 *   Enquiry            its details (drawn by the app) and the files attached here
 *   Samples            each sample's details with how it went (courier and AWB), the buyer's
 *                      reference photos, the finished-piece photos, the courier copy
 *   Quotation          each quotation once Admin passed its price
 *   Sales order & PO   the SO the SO team uploaded, the buyer's PO
 *   Dispatch & LR      the invoice, dispatch details, each load's LR copy or proof of delivery
 *   Sent to the teams  the reference files marketing sent with a task to Sampling, Quotation…
 *
 * Open or save any of them. The enquiry's marketing person ticks papers and emails them to the
 * buyer from the company mail — the same send as the conversation panel, checked against this
 * enquiry on the server. "+ Attach" still puts a drawing or an approval on the enquiry itself.
 */

const MAX_PICK = 6;
const keyOf = (doc) => `${doc.type}:${doc.id}`;
const isImage = (doc) => String(doc.mimeType || '').startsWith('image/');

function EmailPapers({ enquiry, buyer, papers, onClose, onSent }) {
  const { toast } = useToast();
  const [picked, setPicked] = useState(papers);
  const [subject, setSubject] = useState(`${enquiry.number} — documents`);
  const [body, setBody] = useState(`Dear ${buyer?.name || 'Sir / Madam'},\n\nPlease find the documents attached: ${papers.map((doc) => doc.label).join(', ')}.\n\nRegards`);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const send = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await enquiriesApi.sendMessage({ id: enquiry._id, channel: 'email', subject: subject.trim(), body: body.trim(), attachments: picked.map(({ type, id }) => ({ type, id })) });
      toast('Email sent', `${picked.length} document${picked.length === 1 ? '' : 's'} to ${buyer?.email}`);
      onSent?.();
      onClose();
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title="Email to the buyer" description={`From the company mail to ${buyer?.email || 'the buyer'}`} onClose={onClose}>
      <form onSubmit={send} className="space-y-4" aria-label="Email documents">
        {!buyer?.email && <Notice tone="danger">{buyer?.name || 'This buyer'} has no email address on their record — add it on the customer first.</Notice>}
        <div>
          <p className="mb-1 text-sm font-semibold text-steel-200">Attached ({picked.length})</p>
          <ul className="space-y-1">
            {picked.map((doc) => (
              <li key={keyOf(doc)} className="flex items-center justify-between gap-2 rounded-lg bg-line/[0.04] px-3 py-1.5 text-sm">
                <span className="min-w-0 truncate text-steel-100">📎 {doc.label}</span>
                <button type="button" className="link-muted text-xs" onClick={() => setPicked(picked.filter((entry) => keyOf(entry) !== keyOf(doc)))}>Remove</button>
              </li>
            ))}
          </ul>
        </div>
        <Field label="Subject" required><input className="input" required value={subject} maxLength={200} onChange={(event) => setSubject(event.target.value)} /></Field>
        <Field label="Message" required><textarea className="input min-h-[8rem]" required value={body} maxLength={4000} onChange={(event) => setBody(event.target.value)} /></Field>
        {problem && <Notice tone="danger">{problem}</Notice>}
        <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || !picked.length || !buyer?.email || !subject.trim() || !body.trim()}>{busy ? 'Sending…' : 'Send email'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function EnquiryDocuments({ enquiry, canWrite = false }) {
  const { mayDelete } = useAuth();
  const [state, setState] = useState(null);
  const [problem, setProblem] = useState(null);
  const [picked, setPicked] = useState([]);
  const [emailing, setEmailing] = useState(null);
  const [opening, setOpening] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(null);
  const inputRef = useRef(null);

  const load = useCallback(() => enquiriesApi.papers(enquiry._id).then((reply) => { setState(reply); setProblem(null); }).catch((failure) => setProblem(failure.message)), [enquiry._id]);
  useEffect(() => { load(); }, [load, enquiry.updatedAt]);

  /* Opened in a new tab, or saved — through the API, as the file needs the session's token. */
  const open = async (doc, download = false) => {
    setOpening(keyOf(doc));
    try {
      const blob = await enquiriesApi.paperBlob({ id: enquiry._id, type: doc.type, docId: doc.id });
      const url = URL.createObjectURL(blob);
      if (download) {
        const link = document.createElement('a');
        link.href = url;
        link.download = doc.filename || 'document';
        link.click();
      } else window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setOpening(null);
    }
  };

  const choose = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) setChosen({ file, title: '' });
  };
  const upload = async () => {
    setUploading(true);
    try {
      await documentsApi.add({ collection: 'enquiries', id: enquiry._id, file: chosen.file, title: chosen.title.trim() || undefined });
      setChosen(null);
      load();
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setUploading(false);
    }
  };
  const remove = async () => {
    try {
      await documentsApi.remove({ collection: 'enquiries', id: enquiry._id, documentId: removing.id });
      load();
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setRemoving(null);
    }
  };

  const docs = state?.data || [];
  const groups = state?.meta?.groups || [];
  const mayEmail = Boolean(state?.meta?.mayEmail);
  const toggle = (doc) => setPicked((current) => (current.includes(keyOf(doc)) ? current.filter((key) => key !== keyOf(doc)) : current.length >= MAX_PICK ? current : [...current, keyOf(doc)]));
  const pickedDocs = picked.map((key) => docs.find((doc) => keyOf(doc) === key)).filter(Boolean);

  return (
    <Section
      title={`Documents${docs.length ? ` (${docs.length})` : ''}`}
      actions={(
        <span className="flex flex-wrap gap-2">
          {mayEmail && (
            <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={!pickedDocs.length} onClick={() => setEmailing(pickedDocs)}>
              {pickedDocs.length ? `Email ${pickedDocs.length} to buyer` : 'Tick papers to email'}
            </button>
          )}
          {canWrite && (
            <>
              <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => inputRef.current?.click()}>+ Attach</button>
              <input ref={inputRef} type="file" className="hidden" accept="application/pdf,image/*" onChange={choose} />
            </>
          )}
        </span>
      )}
    >
      {problem && <div className="mb-3"><Notice tone="danger">{problem}</Notice></div>}
      {!state && !problem && <Spinner label="Loading documents" />}
      {state && (
        <div className="space-y-4">
          {groups.map((group) => {
            const rows = docs.filter((doc) => (doc.group || 'Other papers') === group);
            if (!rows.length) return null;
            return (
              <div key={group} aria-label={group}>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-steel-400">{group} <span className="font-semibold normal-case tracking-normal text-steel-500">· {rows.length}</span></p>
                <ul className="divide-y divide-line/[0.06] rounded-lg border border-line/[0.08]">
                  {rows.map((doc) => (
                    <li key={keyOf(doc)} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                      {mayEmail && (
                        <input
                          type="checkbox"
                          aria-label={`Pick ${doc.label} to email`}
                          checked={picked.includes(keyOf(doc))}
                          disabled={!picked.includes(keyOf(doc)) && picked.length >= MAX_PICK}
                          onChange={() => toggle(doc)}
                        />
                      )}
                      <span aria-hidden className="text-steel-500">{isImage(doc) ? '▣' : '▤'}</span>
                      <div className="min-w-0 flex-1">
                        <button type="button" className="truncate text-left text-sm font-semibold text-steel-100 hover:text-accent disabled:opacity-60" disabled={opening === keyOf(doc)} onClick={() => open(doc)}>
                          {doc.label}
                        </button>
                        <p className="truncate text-xs text-steel-500">
                          {[doc.source, doc.uploaded ? null : 'made by the app', doc.by, doc.at && formatDate(doc.at)].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <span className="flex gap-1.5">
                        <button type="button" className="row-action px-2 py-1 text-xs" onClick={() => open(doc, true)}>Download</button>
                        {mayEmail && <button type="button" className="row-action px-2 py-1 text-xs" onClick={() => setEmailing([doc])}>Email</button>}
                        {canWrite && mayDelete && doc.type === 'file' && doc.group === 'Enquiry' && (
                          <button type="button" className="row-action px-2 py-1 text-xs text-danger-400" onClick={() => setRemoving(doc)}>Remove</button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {mayEmail && <p className="text-xs text-steel-500">Tick up to {MAX_PICK} papers and email them to {state.meta.buyer?.email || 'the buyer'} together, or use Email on one.</p>}
        </div>
      )}
      {emailing && <EmailPapers enquiry={enquiry} buyer={state?.meta?.buyer} papers={emailing} onClose={() => setEmailing(null)} onSent={() => setPicked([])} />}
      {chosen && (
        <Modal open title="Attach a document" description={chosen.file.name} onClose={() => setChosen(null)}>
          <div className="space-y-4">
            <Field label="What is it?" hint="“Approved artwork”, “Buyer drawing” — the next reader looks for this">
              <input className="input" autoFocus value={chosen.title} maxLength={120} onChange={(event) => setChosen({ ...chosen, title: event.target.value })} />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setChosen(null)}>Cancel</button>
              <button type="button" className="btn-primary" disabled={uploading} onClick={upload}>{uploading ? 'Attaching…' : 'Attach'}</button>
            </div>
          </div>
        </Modal>
      )}
      {removing && (
        <ConfirmDialog
          open
          title="Remove this document?"
          message={`${removing.label} will be deleted for everyone. This cannot be undone.`}
          confirmLabel="Remove"
          onConfirm={remove}
          onClose={() => setRemoving(null)}
        />
      )}
    </Section>
  );
}
