import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { customers as customersApi, enquiries as enquiriesApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import DepartmentTaskDialog from './DepartmentTaskDialog.jsx';
import { SendDialog } from './DepartmentDesk.jsx';
import { FollowUpDialog } from './TodaysActions.jsx';
import { Modal, Notice } from './ui.jsx';
import { MouldSelect } from './pickers.jsx';
import { departmentLabel } from '../utils/pipeline.js';
import { formatDate, formatDateTime } from '../utils/format.js';
import { TEAM, dueState, panelButtons, panelTiles, whatsappLink } from '../utils/customerPanel.js';

/**
 * The customer side panel [the plant's party master]: a row clicked, the buyer opens from the
 * right with what can be done for them without leaving the list.
 *
 *   who they are and how to reach them   the contact card, call and WhatsApp
 *   who holds them                       Admin hands the buyer and their open enquiries on
 *   Raise for                            no enquiry (a team task, the default) or one of theirs
 *   Customer workflow                    the twelve departments and every step's button —
 *                                        each opens that department's form, filled from the buyer
 *   Open tasks                           what is already with a department, so it is not raised twice
 *   Status and follow-up                 the enquiry's marketing status, the buyer's follow-up
 */

function Card({ title, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-line/[0.1] bg-line/[0.02] p-3.5 ${className}`}>
      {title && <h3 className="mb-2 text-sm font-bold text-steel-100">{title}</h3>}
      {children}
    </section>
  );
}

const dueClass = { late: 'text-danger-400', today: 'text-warn-400', ahead: 'text-steel-400' };

/** Asked when a step needs an enquiry and the panel is raising for none. */
function NeedsEnquiry({ button, enquiries, customer, onUse, onClose }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  /* An enquiry is for a model: the tool off the register, or the buyer's own name for it. */
  const [mould, setMould] = useState('');
  const [model, setModel] = useState('');
  const named = Boolean(mould || model.trim());
  const create = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const made = await enquiriesApi.create({
        customer: customer._id,
        nextAction: button.label,
        ...(mould ? { mould } : { requirement: { modelNumber: model.trim() } }),
      });
      onUse(made, true);
    } catch (failure) {
      setProblem(failure.message);
      setBusy(false);
    }
  };
  return (
    <Modal open title={`${button.label} needs an enquiry`} description="A quotation, a negotiation, a sales order and photos sent are raised on an enquiry." size="sm" onClose={onClose}>
      <div className="space-y-2">
        {enquiries.map((enquiry) => (
          <button key={enquiry._id} type="button" className="btn-secondary w-full justify-between" onClick={() => onUse(enquiry, false)}>
            <span>Use {enquiry.number}</span>
            <span className="text-xs font-normal text-steel-400">{enquiry.model || enquiry.marketingStatusLabel}</span>
          </button>
        ))}
        <div className="space-y-2 rounded-lg border border-line/[0.1] p-3">
          <p className="text-xs font-semibold text-steel-300">Or a new enquiry — for which model?</p>
          <MouldSelect value={mould} onChange={(value) => setMould(value || '')} includeBlank="Pick from the mould register…" aria-label="Model for the new enquiry" />
          {!mould && (
            <input className="input" value={model} onChange={(event) => setModel(event.target.value)} placeholder="…or type the model the buyer asked for" aria-label="Model the buyer asked for" />
          )}
          <button type="button" className="btn-primary w-full" onClick={create} disabled={busy || !named}>
            {busy ? 'Creating…' : `Create the enquiry for ${customer.name}`}
          </button>
        </div>
        {problem && <Notice tone="danger">{problem}</Notice>}
      </div>
    </Modal>
  );
}

export default function CustomerPanel({ customerId, onClose, onChanged }) {
  const catalogue = useHandoffCatalogue();
  const { canWrite } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [problem, setProblem] = useState(null);
  const [target, setTarget] = useState(TEAM);
  const [sending, setSending] = useState(null);
  const [asking, setAsking] = useState(null);
  const [following, setFollowing] = useState(null);
  const [delegateTo, setDelegateTo] = useState('');
  const [delegating, setDelegating] = useState(false);

  const load = useCallback(() => {
    customersApi.panel(customerId).then(setData).catch((failure) => setProblem(failure.message));
  }, [customerId]);
  useEffect(() => { setData(null); setTarget(TEAM); load(); }, [load]);

  useEffect(() => {
    const escape = (event) => {
      /* A dialog opened from the panel closes first. */
      if (event.key === 'Escape' && !document.querySelector('[role=dialog][aria-modal=true]')) onClose();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);

  const refresh = () => { load(); onChanged?.(); };
  const customer = data?.customer;
  const enquiries = data?.enquiries || [];
  const onEnquiry = target !== TEAM ? enquiries.find((row) => row._id === target) : null;
  const tiles = panelTiles(catalogue, onEnquiry ? target : TEAM, onEnquiry?.stage);
  const buttons = panelButtons(catalogue, onEnquiry ? target : TEAM);
  const mayRaise = canWrite('enquiries') || canWrite('customers');

  /* What a click does: the form on the enquiry or for the team, or first ask for an enquiry. */
  const press = (button, needsEnquiry) => {
    if (!button || !mayRaise) return;
    if (needsEnquiry) { setAsking(button); return; }
    setSending({ button, enquiry: onEnquiry ? { _id: onEnquiry._id, number: onEnquiry.number, customer: { name: customer.name } } : null });
  };

  const useEnquiry = (enquiry, created) => {
    const button = asking;
    setAsking(null);
    /* The API already says the enquiry was created. */
    if (created) refresh();
    setTarget(enquiry._id);
    setSending({ button, enquiry: { _id: enquiry._id, number: enquiry.number, customer: { name: customer.name } } });
  };

  const delegate = async () => {
    if (!delegateTo) return;
    setDelegating(true);
    setProblem(null);
    try {
      const done = await customersApi.delegate({ id: customer._id, to: delegateTo });
      toast(`${customer.name}${done.enquiries?.length ? ` and ${done.enquiries.length} open ${done.enquiries.length === 1 ? 'enquiry' : 'enquiries'}` : ''} handed to ${done.to.name}`);
      setDelegateTo('');
      refresh();
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setDelegating(false);
    }
  };

  const wa = whatsappLink(customer?.whatsapp || customer?.mobile);
  const primary = customer?.contacts?.find((contact) => contact.isPrimary) || customer?.contacts?.[0];
  const followUp = customer?.followUp;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close the customer panel" className="absolute inset-0 animate-fade-in cursor-default bg-scrim/40" onClick={onClose} />
      <aside
        role="complementary"
        aria-label={customer ? `${customer.name} — actions` : 'Customer'}
        className="relative flex h-full w-full max-w-[480px] animate-slide-in-right flex-col border-l border-line/[0.08] bg-ink-900 shadow-modal"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line/[0.06] px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-steel-50">{customer?.name || 'Loading…'}</h2>
            <p className="text-xs text-steel-400">
              {customer?.code ? `${customer.code} · ` : ''}Assigned to {customer?.assignedTo?.name || '—'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line/[0.12] text-steel-300 hover:text-steel-50">×</button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {problem && <Notice tone="danger">{problem}</Notice>}
          {!data && !problem && <p className="py-8 text-center text-sm text-steel-400">Loading…</p>}

          {customer && (
            <>
              {/* How to reach them. */}
              <Card>
                <div className="flex flex-wrap items-center gap-2">
                  {customer.mobile && <a className="btn-secondary px-3 py-1.5 text-xs" href={`tel:${customer.mobile}`}>Call {customer.mobile}</a>}
                  {wa && <a className="btn-secondary px-3 py-1.5 text-xs" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>}
                  {customer.email && <a className="btn-secondary px-3 py-1.5 text-xs" href={`mailto:${customer.email}`}>Email</a>}
                  <Link className="ml-auto text-xs font-semibold text-accent hover:underline" to={`/customers/${customer._id}`}>Customer page ↗</Link>
                </div>
                {(primary || customer.address) && (
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                    {primary && (<><dt className="text-steel-400">Contact</dt><dd className="text-steel-200">{[primary.name, primary.designation, primary.mobile].filter(Boolean).join(' · ')}</dd></>)}
                    {customer.address && (<><dt className="text-steel-400">Address</dt><dd className="text-steel-200">{customer.address}</dd></>)}
                  </dl>
                )}
              </Card>

              {/* Admin hands the buyer on. */}
              {data.delegate && (
                <Card title="Delegate customer to marketing">
                  <div className="flex gap-2">
                    <select className="input min-w-0 flex-1" value={delegateTo} onChange={(event) => setDelegateTo(event.target.value)} aria-label="Delegate to">
                      <option value="">Select person</option>
                      {data.delegate.map((person) => (
                        <option key={person._id} value={person._id}>{person.name}{person.group === 'admin' ? ' (Admin)' : ''}{person.self ? ' — me' : ''}</option>
                      ))}
                    </select>
                    <button type="button" className="btn-primary shrink-0 px-3 text-sm" onClick={delegate} disabled={!delegateTo || delegating}>
                      {delegating ? 'Moving…' : 'Delegate'}
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-steel-400">The customer and every enquiry of theirs still being worked move to the selected person.</p>
                </Card>
              )}

              {/* The twelve departments and every step, for the team or on an enquiry. */}
              <Card>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-steel-100">Customer workflow · Select next action</h3>
                </div>
                <label className="mb-3 block">
                  <span className="mb-1 block text-xs font-semibold text-steel-300">Raise for</span>
                  <select className="input" value={target} onChange={(event) => setTarget(event.target.value)} aria-label="Raise for">
                    <option value={TEAM}>No enquiry — a team task for {customer.name}</option>
                    {enquiries.map((enquiry) => (
                      <option key={enquiry._id} value={enquiry._id}>
                        On {enquiry.number}{enquiry.model ? ` · ${enquiry.model}` : ''} · {enquiry.marketingStatusLabel}
                      </option>
                    ))}
                  </select>
                </label>
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
                            onClick={() => press(tile.button, tile.needsEnquiry)}
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
                          onClick={() => press(button, button.needsEnquiry)}
                          title={button.needsEnquiry ? `${button.hint} — needs an enquiry` : button.hint}
                          className="rounded-lg border border-accent/35 px-2.5 py-1.5 text-xs font-semibold text-steel-100 transition-colors hover:border-accent hover:bg-accent/[0.08] disabled:opacity-40"
                        >
                          {button.label}
                          {button.needsEnquiry && <span className="ml-1 font-normal text-steel-400">+ enquiry</span>}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-steel-400">
                      {onEnquiry
                        ? `Tasks go on ${onEnquiry.number} and move its stage, as on the enquiry screen.`
                        : 'Each button opens that department’s form, filled from the buyer. Steps marked “+ enquiry” go on one of their enquiries, or a new one.'}
                    </p>
                  </>
                )}
              </Card>

              {/* Where they stand. */}
              <Card title="Current marketing status">
                {onEnquiry ? (
                  <p className="text-sm text-steel-100">
                    <span className="font-semibold">{onEnquiry.marketingStatusLabel}</span>
                    <span className="text-steel-400"> · {onEnquiry.number}{onEnquiry.assignedTo?.name ? ` · ${onEnquiry.assignedTo.name}` : ''}</span>
                    {onEnquiry.nextFollowUpDate && (
                      <span className={`block text-xs ${dueClass[dueState(onEnquiry.nextFollowUpDate)]}`}>Enquiry follow-up {formatDate(onEnquiry.nextFollowUpDate)}</span>
                    )}
                  </p>
                ) : enquiries.length ? (
                  <ul className="space-y-1 text-sm">
                    {enquiries.slice(0, 4).map((enquiry) => (
                      <li key={enquiry._id} className="flex items-baseline justify-between gap-2">
                        <Link to={`/enquiries/${enquiry._id}`} className="font-semibold text-steel-100 hover:text-accent">{enquiry.number}</Link>
                        <span className="text-xs text-steel-300">{enquiry.marketingStatusLabel}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-steel-400">No open enquiry.</p>
                )}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line/[0.08] pt-2">
                  <p className={`text-xs ${followUp ? dueClass[dueState(followUp.due)] : 'text-steel-400'}`}>
                    {followUp ? `Customer follow-up ${formatDateTime(followUp.due)}${followUp.note ? ` · ${followUp.note}` : ''}` : 'No customer follow-up set.'}
                  </p>
                  {canWrite('customers') && (
                    <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setFollowing(followUp ? 'log' : 'set')}>
                      {followUp ? 'Log a call / close' : 'Set follow-up'}
                    </button>
                  )}
                </div>
              </Card>

              {/* What is already with a department. */}
              <Card title={`Open tasks · ${data.tasks.length}`}>
                {data.tasks.length ? (
                  <ul className="space-y-1.5">
                    {data.tasks.map((task) => (
                      <li key={task._id} className="rounded-lg border border-line/[0.08] px-2.5 py-1.5 text-xs">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold text-steel-100">{task.title}</span>
                          {task.dueDate && <span className={`shrink-0 ${dueClass[dueState(task.dueDate)]}`}>{formatDate(task.dueDate)}</span>}
                        </div>
                        <p className="text-steel-400">
                          {departmentLabel(task.department)}{task.user?.name ? ` · ${task.user.name}` : ''}
                          {task.status ? ` · ${task.status}` : ''}
                          {task.enquiry ? ` · ${task.enquiry.number}` : ' · no enquiry'}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-steel-400">Nothing open with a department.</p>
                )}
              </Card>
            </>
          )}
        </div>
      </aside>

      {sending && catalogue && (
        sending.button.department ? (
          <DepartmentTaskDialog
            enquiry={sending.enquiry}
            customer={sending.enquiry ? undefined : customer._id}
            catalogue={catalogue}
            kind={sending.button.key}
            onClose={() => setSending(null)}
            onSent={refresh}
          />
        ) : (
          <SendDialog button={sending.button} enquiry={sending.enquiry} onClose={() => setSending(null)} onSent={refresh} />
        )
      )}
      {asking && (
        <NeedsEnquiry button={asking} enquiries={enquiries} customer={customer} onUse={useEnquiry} onClose={() => setAsking(null)} />
      )}
      {following && (
        <FollowUpDialog customer={{ _id: customer._id, name: customer.name }} mode={following} onClose={() => setFollowing(null)} onChanged={refresh} />
      )}
    </div>,
    document.body
  );
}
