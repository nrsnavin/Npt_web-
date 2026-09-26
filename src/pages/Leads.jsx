import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { downloads, leads as leadsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced, useRecord, useRecordList } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import BulkBar, { RowCheckbox, useSelection } from '../components/BulkReassign.jsx';
import ExportButton from '../components/ExportButton.jsx';
import LeadForm from '../components/LeadForm.jsx';
import StagePipeline from '../components/StagePipeline.jsx';
import { SortHeader, useSort } from '../components/SortHeader.jsx';
import LeadBoard from '../components/boards/LeadBoard.jsx';
import ViewSwitch from '../components/ViewSwitch.jsx';
import { useViewMode } from '../hooks/useBoard.js';
import { formatCompactCurrency, formatNumber, humanise } from '../utils/format.js';
import { CLOSED_LEAD_STAGES, SOURCES, followUpState, leadStageLabel } from '../utils/pipeline.js';
import useOpenFromLink from '../hooks/useOpenFromLink.js';
import { leadCards as cardsApi } from '../api/endpoints.js';

/** How many photographed cards wait to be confirmed — the way into that screen. */
function CardsWaiting() {
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    let live = true;
    cardsApi.list().then((answer) => live && setWaiting(answer.waiting || 0)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return (
    <Link to="/leads/cards" className="btn-secondary">
      Cards{waiting ? <span className="ml-1.5 rounded-full bg-flame-500 px-1.5 text-[0.7rem] font-bold text-white">{waiting}</span> : ''}
    </Link>
  );
}

const TONE_TEXT = {
  danger: 'text-danger-400',
  warn: 'text-warn-400',
  info: 'text-aqua-300',
  neutral: 'text-steel-400',
};

/** What the list hook fetches while the board is showing — see the note on the enquiry list. */
const idle = async () => ({ data: [], pagination: null });

export default function Leads() {
  const { canWrite, isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  /*
   * Which slice of the book, and why it opens on Open.
   *
   * The API has understood `open=true` on leads since the beginning and this screen never sent
   * it, so the list arrived every morning with converted and written-off leads sitting among
   * the live ones. A book that has been worked for a year is then mostly finished business,
   * and the rows somebody can actually do something about are scattered through it — which is
   * how a register stops being read.
   *
   * "Due now" is the same question the enquiry list answers under the same name: everything
   * still being worked whose follow-up date has arrived. It is the morning queue.
   */
  const [view, setView] = useState('open');
  const [mode, setMode] = useViewMode('leads');
  const [page, setPage] = useState(1);
  const { sort, toggle } = useSort();

  /* Back to page one on every sort. Re-ordering a long register while staying on page seven
     lands the reader in the middle of an ordering they have not seen the top of. */
  const sortBy = (field) => {
    toggle(field);
    setPage(1);
  };
  const [creating, setCreating] = useState(false);
  /* The command bar's "New …" arrives as `?new=1` with the form to open. */
  useOpenFromLink(() => setCreating(true));

  /*
   * The place filter lives in the address rather than in state, because it mostly arrives from
   * somewhere else: clicking a town on the analytics map opens this list already narrowed. A
   * filter in the URL is also a link somebody can send to a colleague, which a piece of
   * component state never is.
   */
  const [params, setParams] = useSearchParams();
  const place = params.get('city')
    ? { field: 'city', value: params.get('city') }
    : params.get('state')
      ? { field: 'state', value: params.get('state') }
      : null;

  /*
   * Whose leads. In the address like the place filter, so a manager can send somebody the view
   * they are talking about rather than describing which dropdown to set.
   */
  const owner = params.get('assignedTo') || '';
  /*
   * Narrowing to where the leads came from. The server has always understood `source`; the
   * screen did not read it, so a link promising "the leads from this feed" landed on the whole
   * book — the integrations page offers exactly that link.
   */
  const source = params.get('source') || '';

  /*
   * The people holding leads, scoped exactly as the list is — so a marketing person is offered
   * only themselves, and the picker below simply is not drawn. No role check on the screen: the
   * answer already carries the rule.
   */
  const fetchOwners = useCallback(() => leadsApi.owners(), []);
  const { data: owners } = useRecord(fetchOwners, 'lead-owners');
  const team = owners || [];

  const term = useDebounced(search);

  /** Everything whose date has arrived counts as due, including what is already late. */
  const endOfToday = () => {
    const date = new Date();
    date.setHours(23, 59, 59, 999);
    return date.toISOString();
  };

  // One object for both the list and the export, so the file is exactly what is on screen.
  const filters = {
    search: term || undefined,
    status: status || undefined,
    open: view === 'open' || view === 'due' ? 'true' : undefined,
    dueBy: view === 'due' ? endOfToday() : undefined,
    assignedTo: owner || undefined,
    source: source || undefined,
    [place?.field || 'city']: place?.value,
  };
  const board = mode === 'board';

  const { data, pagination, meta, loading, error, reload } = useRecordList(
    board ? idle : leadsApi.list,
    { ...filters, sort: sort || undefined, page, limit: 25 }
  );

  const mayWrite = canWrite('enquiries');
  const selection = useSelection(data);

  /**
   * Picking Converted or Disqualified off the funnel also drops the open-only view.
   *
   * Otherwise the two filters contradict each other: the tile says there are five converted
   * leads and the table under it shows none, because `open=true` has quietly excluded exactly
   * the rows that were just asked for. The enquiry list settles this the same way.
   */
  const selectStage = (value) => {
    const next = value === status ? '' : value;
    setStatus(next);
    if (CLOSED_LEAD_STAGES.includes(next) && view !== 'all') setView('all');
    setPage(1);
  };

  // Back to page one, or the narrowed result is read from page four of a list that is now two
  // pages long.
  const clearPlace = () => {
    const next = new URLSearchParams(params);
    next.delete('city');
    next.delete('state');
    setParams(next, { replace: true });
    setPage(1);
  };

  const clearSource = () => {
    const next = new URLSearchParams(params);
    next.delete('source');
    setParams(next, { replace: true });
    setPage(1);
  };

  const selectOwner = (value) => {
    const next = new URLSearchParams(params);
    if (value) next.set('assignedTo', value);
    else next.delete('assignedTo');
    setParams(next, { replace: true });
    setPage(1);
  };

  return (
    <div className={
      /*
        * A board wants every column it can get. The table's measure is set for reading rows —
        * a line of text stops being comfortable somewhere around here — but a funnel squeezed
        * into it puts two thirds of itself off the right-hand edge, and the shape of the book
        * is the thing a board exists to show. It still scrolls when it has to; it just does not
        * start out having to.
        */
      board ? 'mx-auto w-full' : 'mx-auto max-w-6xl'
    }>
      <PageHeader
        title="Leads"
        subtitle="Parties we are not working yet. Qualify one and convert it into a customer."
        actions={
          <div className="flex items-center gap-2">
            <ViewSwitch mode={mode} onChange={setMode} />
            <Link to="/leads/analytics" className="btn-secondary">
              Analytics
            </Link>
            <CardsWaiting />
            <ExportButton download={downloads.leads} params={filters} />
            {mayWrite && (
              <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                + New lead
              </button>
            )}
          </div>
        }
      />

      {/*
        * The stage filter, which is also the shape of the book in miniature. The counts come
        * back with the rows rather than from their own request, so they narrow when the town
        * or the colleague does and can never disagree with the list beneath them.
        */}
      {/* Not on the board, where every column carries its own count and its own bar. */}
      {!board && (
        <StagePipeline
          counts={meta.stageCounts}
          selected={status}
          onSelect={selectStage}
          loading={loading}
        />
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search company, contact or number…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        {/*
          * The same three views the enquiry list offers, in the same words and the same place.
          * A lead and an enquiry are one pipeline at two stages, and a reader who learns "Due
          * now" on one screen should not have to learn it again on the other.
          */}
        <div role="tablist" aria-label="View" className="tab-track grid-flow-col">
          {[
            { value: 'open', label: 'Open' },
            { value: 'due', label: 'Due now' },
            { value: 'all', label: 'All' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={view === option.value}
              onClick={() => {
                setView(option.value);
                setPage(1);
              }}
              className="tab py-1.5"
            >
              {option.label}
            </button>
          ))}
        </div>

        {/*
          * Drawn only when there is a choice to make. A marketing person is offered one name —
          * their own — and a dropdown with a single option is a control that can only waste a
          * click, so it is simply not there.
          */}
        {team.length > 1 && (
          <select
            className="input max-w-[14rem]"
            aria-label="Filter by marketing person"
            value={owner}
            onChange={(event) => selectOwner(event.target.value)}
          >
            <option value="">Everyone&apos;s leads</option>
            {team.map((person) => (
              <option key={person._id} value={person._id}>
                {person.name} ({person.leads})
              </option>
            ))}
          </select>
        )}
        {status && (
          <button type="button" className="btn-secondary" onClick={() => selectStage(status)}>
            Clear stage filter
          </button>
        )}
        {/*
          * A filter set from a map has to be visible in the list's own controls too. Somebody
          * who scrolled past the map and finds nine rows where there were forty must be able
          * to see why without scrolling back up to look for a highlighted dot.
          */}
        {place && (
          <button type="button" className="btn-secondary" onClick={clearPlace}>
            Clear {place.value} ✕
          </button>
        )}
        {/* Same argument as the place chip: a list that is narrowed has to say so. */}
        {source && (
          <button type="button" className="btn-secondary" onClick={clearSource}>
            Clear {humanise(source)} ✕
          </button>
        )}
      </div>

      {board && <LeadBoard filters={filters} canMove={mayWrite} />}

      {!board && loading && <TableSkeleton columns={7} />}
      {!board && error && <ErrorState error={error} onRetry={reload} />}

      {/* Which emptiness this is. "No leads here" under the Due now view reads as the book
          being empty when in fact nothing is due, which is the good outcome. */}
      {!board && !loading && !error && (data.length === 0 ? (
        <EmptyState
          title={view === 'due' ? 'Nothing due' : 'No leads here'}
          description={
            view === 'due'
              ? 'Every lead being worked has a follow-up date still ahead of it.'
              : view === 'open'
                ? 'Nothing is being worked right now. Try All to see what has been converted or written off.'
                : 'Every enquiry that is not from an existing customer starts as a lead.'
          }
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    {isAdmin && (
                      <th className="w-10 px-4 py-3">
                        <RowCheckbox
                          checked={selection.allSelected}
                          onChange={selection.toggleAll}
                          label="Select every lead on this page"
                        />
                      </th>
                    )}
                    {/* The firm, which is what the column leads with. */}
                    <SortHeader field="company" label="Lead" sort={sort} onToggle={sortBy} className="px-4" />
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Interest</th>
                    <SortHeader field="estimatedValue" label="Estimate" sort={sort} onToggle={sortBy} align="right" className="px-4" />
                    {/* The date, not the sentence beside it — "who is due next" is the question
                        this column gets asked, and the wording is nobody's sort order. */}
                    <SortHeader field="nextFollowUpDate" label="Next action" sort={sort} onToggle={sortBy} className="px-4" />
                    {/* The owner is a populated reference: the collection holds an id, so ordering
                        by it would group the table by whoever was created first, which reads as
                        random to anybody looking at names. */}
                    <th className="px-4 py-3">Owner</th>
                    <SortHeader field="status" label="Stage" sort={sort} onToggle={sortBy} className="px-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {data.map((lead) => {
                    const due = followUpState(lead.nextFollowUpDate);
                    return (
                      <tr key={lead._id} className="row-hover">
                        {isAdmin && (
                          <td className="px-4 py-3.5">
                            <RowCheckbox
                              checked={selection.selected.has(lead._id)}
                              onChange={() => selection.toggle(lead._id)}
                              label={`Select ${lead.company}`}
                            />
                          </td>
                        )}
                        <td className="px-4 py-3.5">
                          <Link to={`/leads/${lead._id}`} className="font-semibold text-steel-100 hover:text-accent">
                            {lead.company}
                          </Link>
                          <p className="text-xs text-steel-400">
                            {lead.number}
                            {lead.city && ` · ${lead.city}`}
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-steel-200">{lead.contactName || '—'}</p>
                          {lead.mobile && <p className="text-xs text-steel-400">{lead.mobile}</p>}
                        </td>
                        <td className="max-w-xs px-4 py-3.5 text-steel-300">
                          {/* What they are interested in. No quantity: a lead has not said
                              what they want yet, so a figure here was a guess about a guess. */}
                          <p className="truncate">{lead.productInterest || '—'}</p>
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-steel-100">
                          {lead.estimatedValue ? formatCompactCurrency(lead.estimatedValue) : '—'}
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-steel-300">{lead.nextAction || '—'}</p>
                          {due && <p className={`text-xs ${TONE_TEXT[due.tone]}`}>{due.text}</p>}
                        </td>
                        {/*
                          * Whose lead it is. Unassigned is called out rather than left blank —
                          * a lead nobody owns is the thing §3 exists to prevent, and an empty
                          * cell reads as "not filled in yet" instead of as a problem.
                          */}
                        <td className="whitespace-nowrap px-4 py-3.5">
                          {lead.assignedTo?.name ? (
                            <button
                              type="button"
                              onClick={() => selectOwner(lead.assignedTo._id)}
                              className="text-left text-steel-300 hover:text-accent"
                              title={`Show only ${lead.assignedTo.name}'s leads`}
                            >
                              {lead.assignedTo.name}
                            </button>
                          ) : (
                            <span className="text-warn-400">Unassigned</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge status={lead.status}>{leadStageLabel(lead.status)}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination pagination={pagination} onChange={setPage} />
          {isAdmin && <BulkBar collection="leads" selection={selection} noun="leads" onDone={reload} />}
        </>
      ))}

      <Modal
        open={creating}
        title="New lead"
        description="Capture whoever got in touch — the detail can follow"
        size="lg"
        onClose={() => setCreating(false)}
      >
        <LeadForm onClose={() => setCreating(false)} onSaved={reload} />
      </Modal>
    </div>
  );
}
