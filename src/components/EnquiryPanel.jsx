import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { enquiries as enquiriesApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import DepartmentTaskDialog from './DepartmentTaskDialog.jsx';
import { SendDialog } from './DepartmentDesk.jsx';
import EnquiryCheckCard from './EnquiryCheckCard.jsx';
import EnquiryContactPanel from './EnquiryContactPanel.jsx';
import { Notice } from './ui.jsx';
import { departmentLabel } from '../utils/pipeline.js';
import { panelButtons, panelTiles } from '../utils/customerPanel.js';

/**
 * The enquiry side panel [the dashboard's New Enquiries]: a card clicked, the enquiry opens from
 * the right with everything its marketing person does first, without leaving the dashboard.
 *
 *   Delegate enquiry to marketing      Admin hands it to someone else
 *   Enquiry details · Edit and verify  correct what was captured, then Save & Mark as Checked
 *   Customer workflow                  the twelve departments and every step's button — locked
 *                                      until the enquiry is checked
 *   Status, WhatsApp, email, timeline  the same as on the enquiry page
 */

function Card({ title, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-line/[0.1] bg-line/[0.02] p-3.5 ${className}`}>
      {title && <h3 className="mb-2 text-sm font-bold text-steel-100">{title}</h3>}
      {children}
    </section>
  );
}

/** Admin hands the enquiry — and its buyer, as on the enquiry page — to another person. */
function Delegate({ enquiry, onDone }) {
  const { toast } = useToast();
  const [targets, setTargets] = useState(null);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const owner = String(enquiry.assignedTo?._id || enquiry.assignedTo || '');
  useEffect(() => {
    let live = true;
    enquiriesApi.delegateTargets(enquiry._id)
      .then((reply) => live && setTargets(reply.mayDelegate ? reply.data || [] : []))
      .catch(() => live && setTargets([]));
    return () => { live = false; };
  }, [enquiry._id, owner]);
  if (!targets?.length) return null;

  const delegate = async () => {
    if (!to) return;
    setBusy(true);
    setProblem(null);
    try {
      await enquiriesApi.delegate({ id: enquiry._id, to });
      toast(`${enquiry.number} handed to ${targets.find((person) => person._id === to)?.name || 'them'}`);
      setTo('');
      onDone?.();
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Delegate enquiry to marketing" className="border-accent/30 bg-accent/[0.05]">
      <div className="flex gap-2">
        <select className="input min-w-0 flex-1" value={to} onChange={(event) => setTo(event.target.value)} aria-label="Delegate to">
          <option value="">Select person</option>
          {targets.map((person) => (
            <option key={person._id} value={person._id}>{person.name}{person.group === 'admin' ? ' (Admin)' : ''}{person.self ? ' — me' : ''}</option>
          ))}
        </select>
        <button type="button" className="btn-secondary shrink-0 px-3 text-sm" onClick={delegate} disabled={!to || busy}>
          {busy ? 'Moving…' : 'Delegate'}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-steel-400">The enquiry, with its open tasks, samples and orders, moves to the selected person. The customer stays with whoever holds it — hand the customer over from the party master.</p>
      {problem && <div className="mt-2"><Notice tone="danger">{problem}</Notice></div>}
    </Card>
  );
}

export default function EnquiryPanel({ enquiryId, onClose, onChanged }) {
  const catalogue = useHandoffCatalogue();
  const { user, canWrite } = useAuth();
  const [enquiry, setEnquiry] = useState(null);
  const [problem, setProblem] = useState(null);
  const [sending, setSending] = useState(null);

  const load = useCallback(() => {
    enquiriesApi.get(enquiryId).then(setEnquiry).catch((failure) => setProblem(failure.message));
  }, [enquiryId]);
  useEffect(() => { setEnquiry(null); setProblem(null); load(); }, [load]);

  useEffect(() => {
    const escape = (event) => {
      /* A dialog opened from the panel closes first. */
      if (event.key === 'Escape' && !document.querySelector('[role=dialog][aria-modal=true]')) onClose();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);

  const refresh = () => { load(); onChanged?.(); };
  const mayWrite = canWrite('enquiries');
  const pending = Boolean(enquiry?.checkPending);
  const closed = enquiry && ['won', 'lost'].includes(enquiry.status);
  const mayRaise = mayWrite && !pending && !closed;
  const tiles = enquiry ? panelTiles(catalogue, enquiry._id, enquiry.stage) : [];
  const buttons = enquiry ? panelButtons(catalogue, enquiry._id) : [];
  const buyerName = enquiry?.customer?.name || enquiry?.prospect?.name || enquiry?.number;
  const isOwner = String(enquiry?.assignedTo?._id || '') === String(user?.id || user?._id || '');

  const press = (button) => {
    if (!button || !mayRaise) return;
    setSending({ button, enquiry: { _id: enquiry._id, number: enquiry.number, customer: { name: buyerName } } });
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close the enquiry panel" className="absolute inset-0 animate-fade-in cursor-default bg-scrim/40" onClick={onClose} />
      <aside
        role="complementary"
        aria-label={enquiry ? `${buyerName} — enquiry` : 'Enquiry'}
        className="relative flex h-full w-full max-w-[520px] animate-slide-in-right flex-col border-l border-line/[0.08] bg-ink-900 shadow-modal"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line/[0.06] px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-steel-50">{enquiry ? buyerName : 'Loading…'}</h2>
            {enquiry && (
              <p className="text-xs text-steel-400">
                {enquiry.number} · Assigned to {enquiry.assignedTo?.name || '—'}
                {' · '}<Link to={`/enquiries/${enquiry._id}`} className="font-semibold text-accent hover:underline">Full enquiry ↗</Link>
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line/[0.12] text-steel-300 hover:text-steel-50">×</button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {problem && <Notice tone="danger">{problem}</Notice>}
          {!enquiry && !problem && <p className="py-8 text-center text-sm text-steel-400">Loading…</p>}

          {enquiry && (
            <>
              <Delegate enquiry={enquiry} onDone={refresh} />

              <EnquiryCheckCard enquiry={enquiry} canWrite={mayWrite} onSaved={refresh} />

              {/* The twelve departments and every step — only once the details are checked. */}
              <Card className={pending ? 'opacity-60' : ''}>
                <h3 className="mb-2 text-sm font-bold text-steel-100">Customer Workflow · Select next action</h3>
                {!catalogue ? (
                  <p className="text-xs text-steel-400">Loading the departments…</p>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-1.5">
                      {tiles.map((tile) => {
                        const look = `flex min-h-[3rem] flex-col items-center justify-center rounded-lg border px-1 py-1.5 text-center text-xs leading-tight ${
                          tile.here ? 'border-success-500/60 bg-success-500/10 font-bold text-success-400' : 'border-line/[0.1] text-steel-300'
                        }`;
                        return tile.button && mayRaise ? (
                          <button
                            key={tile.key}
                            type="button"
                            className={`${look} transition-colors hover:border-success-500/60 hover:text-success-400`}
                            title={`Raise a ${departmentLabel(tile.department)} task`}
                            onClick={() => press(tile.button)}
                            aria-current={tile.here ? 'step' : undefined}
                          >
                            {tile.number}. {tile.label}
                          </button>
                        ) : (
                          <div key={tile.key} className={look} aria-current={tile.here ? 'step' : undefined}>{tile.number}. {tile.label}</div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {buttons.map((button) => (
                        <button
                          key={button.key}
                          type="button"
                          disabled={!mayRaise}
                          onClick={() => press(button)}
                          title={pending ? 'Save & Mark as Checked first' : button.hint}
                          className="rounded-lg border border-accent/35 px-2.5 py-1.5 text-xs font-semibold text-steel-100 transition-colors hover:border-accent hover:bg-accent/[0.08] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                        >
                          {button.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-steel-400">
                      {pending
                        ? 'Locked until the enquiry details above are saved and marked as checked.'
                        : closed ? 'This enquiry is closed.' : `Tasks go on ${enquiry.number} and move its stage, as on the enquiry page.`}
                    </p>
                  </>
                )}
              </Card>

              {/* Marketing status, WhatsApp and email to the buyer, and the activity timeline. */}
              <EnquiryContactPanel
                enquiry={enquiry}
                isOwner={isOwner}
                canWrite={mayWrite}
                onSent={refresh}
                refreshKey={enquiry.updatedAt}
                timelineOpen
              />
            </>
          )}
        </div>
      </aside>

      {sending && catalogue && (
        sending.button.department ? (
          <DepartmentTaskDialog
            enquiry={sending.enquiry}
            catalogue={catalogue}
            kind={sending.button.key}
            onClose={() => setSending(null)}
            onSent={refresh}
          />
        ) : (
          <SendDialog button={sending.button} enquiry={sending.enquiry} onClose={() => setSending(null)} onSent={refresh} />
        )
      )}
    </div>,
    document.body
  );
}
