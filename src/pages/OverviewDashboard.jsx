import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { buyerCards as buyerCardsApi, customers as customersApi, departments as departmentsApi, overview } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import AttentionPanel from '../components/AttentionPanel.jsx';
import DepartmentTasksBoard from '../components/DepartmentTasksBoard.jsx';
import TodaysActions, { FollowUpDialog } from '../components/TodaysActions.jsx';
import EnquiryForm from '../components/EnquiryForm.jsx';
import { CustomerForm } from './Customers.jsx';
import Enquiries from './Enquiries.jsx';
import { DashboardSkeleton, ErrorState, Modal, Notice } from '../components/ui.jsx';
import { departmentLabel } from '../utils/pipeline.js';
import { formatDate, formatDateTime } from '../utils/format.js';

/**
 * The overview dashboard [the plant's own layout] — Admin's company-wide, a marketing person's
 * own book [server: overview.service.js]:
 *
 *   Company activity overview   + Add Party · + New Enquiry
 *   who is signed in            name, access, the role badge
 *   four figures                my customers · due today · active enquiries · quotations
 *   New Enquiries               the drafts to finish (a WhatsApp chat or card, highlighted, first)
 *                               and the enquiries still at Enquiry received, to edit and verify
 *   Department Tasks            the requests followed, with their status reply
 *   Customer / Party Master     every customer, with where its newest enquiry stands — and
 *                               beside it Today's actions: the follow-ups due, worked from there
 */

const PARTY_CHIPS = [
  { key: 'all', label: 'All assigned' },
  { key: 'new_enquiry', label: 'New Enquiry' },
  { key: 'due_today', label: 'Due today' },
  { key: 'idle', label: 'No activity 7+ days' },
  { key: 'quotation', label: 'Quotation' },
  { key: 'payment', label: 'Payment' },
  { key: 'sampling', label: 'Sampling' },
  { key: 'production', label: 'Production' },
];

/** The status dot's colour, by where the party stands. */
const dotFor = (row) => {
  if (!row.enquiry) return 'bg-warn-500';
  if (row.isNew) return 'bg-aqua-500';
  if (['production', 'mould', 'assembling', 'qc', 'dispatch', 'lr_copy'].includes(row.statusKey)) return 'bg-flame-500';
  return 'bg-success-500';
};

function FigureTile({ label, value, hint, to }) {
  const body = (
    <>
      <p className="text-sm font-semibold text-steel-300">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums text-aqua-600">{value}</p>
      <p className="mt-1 text-xs text-steel-500">{hint}</p>
    </>
  );
  return to ? (
    <Link to={to} className="card block p-4 transition hover:border-flame-500/40 hover:shadow-md">{body}</Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}

function PartyMaster({ isAdmin, onAdd, onFollowUpChanged, refreshKey = 0 }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [problem, setProblem] = useState(null);
  const [following, setFollowing] = useState(null);
  const fetch = useCallback(() => overview.parties({ filter, page, search: search.trim() || undefined }), [filter, page, search]);
  const { data, loading, error, reload } = useRecord(fetch, `parties-${filter}-${page}-${search}-${refreshKey}`);

  const edit = async (row) => {
    setProblem(null);
    try {
      /* The detail call answers `{ customer, timeline }`: the form wants the customer itself, or it
         sees no id, takes it for a new party and opens empty. */
      const found = await customersApi.get(row._id);
      setEditing(found?.customer || found);
    } catch (failure) {
      setProblem(failure.message);
    }
  };

  return (
    <section className="card space-y-4 p-4 sm:p-5" aria-label="Customer / Party Master">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-steel-50">Customer / Party Master</h2>
          <p className="text-sm text-steel-400">
            Showing {data?.total ?? '…'} customers · {isAdmin ? 'Admin can add, edit and delegate any party' : 'Your assigned parties'}
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={onAdd}>+ Add Party</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PARTY_CHIPS.map((chip) => (
          <button
            key={chip.key}
            type="button"
            aria-pressed={filter === chip.key}
            onClick={() => { setFilter(chip.key); setPage(1); }}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              filter === chip.key ? 'fill-primary border-transparent' : 'border-line/[0.12] text-steel-300 hover:border-line/25'
            }`}
          >
            {chip.label}
            {data?.counts?.[chip.key] !== undefined && <span className="ml-1 tabular-nums opacity-75">{data.counts[chip.key]}</span>}
          </button>
        ))}
        <input aria-label="Search party"
          type="search"
          className="input ml-auto w-full sm:w-60"
          placeholder="Search party…"
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
        />
      </div>

      {problem && <Notice tone="danger">{problem}</Notice>}
      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading && !data ? (
        <p className="py-6 text-center text-sm text-steel-400">Loading parties…</p>
      ) : data?.rows?.length ? (
        <ul className="divide-y divide-line/10 rounded-xl border border-line/10">
          {data.rows.map((row) => (
            <li key={row._id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-semibold text-steel-50">{row.name}</p>
                  {row.isNew && <span className="rounded-full bg-aqua-500/15 px-2 py-0.5 text-[0.75rem] font-semibold text-aqua-600">New Enquiry</span>}
                </div>
                <p className="truncate text-xs text-steel-400">{row.line}{isAdmin && row.owner ? ` · ${row.owner}` : ''}</p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-steel-300">
                  <span aria-hidden className={`h-2 w-2 rounded-full ${dotFor(row)}`} />
                  {row.status}
                  {row.customerFollowUp && (
                    <span className={`ml-1 rounded-full px-2 py-0.5 font-semibold ${new Date(row.customerFollowUp.due) < new Date() ? 'bg-danger-500/15 text-danger-400' : 'bg-aqua-500/15 text-aqua-600'}`}>
                      Follow-up {formatDateTime(row.customerFollowUp.due)}{row.customerFollowUp.note ? ` · ${row.customerFollowUp.note}` : ''}
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary shrink-0 px-3 py-1.5 text-xs"
                onClick={() => setFollowing({ customer: { _id: row._id, name: row.name }, mode: row.customerFollowUp ? 'log' : 'set' })}
              >
                {row.customerFollowUp ? 'Log / close' : 'Follow-up'}
              </button>
              <button type="button" className="btn-secondary shrink-0 px-3 py-1.5 text-xs" onClick={() => edit(row)}>Edit</button>
              <button
                type="button"
                aria-label={`Open ${row.name}`}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-lg leading-none text-steel-400 hover:bg-line/[0.05] hover:text-steel-100"
                onClick={() => navigate(row.enquiry ? `/enquiries/${row.enquiry}` : `/customers/${row._id}`)}
              >
                ›
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-line/15 px-4 py-8 text-center text-sm text-steel-400">No party matches this filter.</p>
      )}

      {data?.pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="text-steel-400">Page {data.page} of {data.pages}</span>
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}

      <Modal open={Boolean(editing)} title="Edit customer" size="lg" onClose={() => setEditing(null)}>
        {editing && <CustomerForm customer={editing} onClose={() => setEditing(null)} onSaved={reload} />}
      </Modal>
      {following && (
        <FollowUpDialog
          customer={following.customer}
          mode={following.mode}
          onClose={() => setFollowing(null)}
          onChanged={() => { reload(); onFollowUpChanged?.(); }}
        />
      )}
    </section>
  );
}

export default function OverviewDashboard() {
  const { user, isManagement: isAdmin, departments = [], canRead } = useAuth();
  const fetch = useCallback(() => overview.summary(), []);
  const { data, loading, error, reload } = useRecord(fetch, 'overview');
  /* "Needs your action" — the questions and the departments' moves on my enquiries. */
  const fetchDesk = useCallback(() => departmentsApi.dashboard('mine'), []);
  const desk = useRecord(fetchDesk, 'department-mine');
  /*
   * Draft enquiries — a chat screenshot or a visiting card sent on WhatsApp, waiting to be finished
   * [pages/BuyerCards.jsx]. With the new enquiries rather than on a screen of their own, so a lead
   * that came in on the phone is seen the same morning as one typed in. Theirs for marketing,
   * every one for Admin — the server scopes the list.
   */
  const fetchDrafts = useCallback(() => buyerCardsApi.list().catch(() => ({ data: [] })), []);
  const drafts = useRecord(fetchDrafts, 'overview-drafts');
  const [adding, setAdding] = useState(null);
  const [partiesKey, setPartiesKey] = useState(0);
  const [actionsKey, setActionsKey] = useState(0);
  /* A follow-up worked from the card shows on its row without the list losing its filter or page. */
  const [partiesRefresh, setPartiesRefresh] = useState(0);

  if (loading && !data) return <DashboardSkeleton label="Loading the overview" tiles={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { figures, newEnquiries } = data;
  const draftRows = drafts.data?.data || [];
  const role = isAdmin ? 'Admin' : departmentLabel(user?.department) || 'Marketing';
  const access = isAdmin
    ? 'Masters, customers, enquiries, quotations, approvals, users and permissions'
    : 'Your customers, enquiries, quotations and follow-ups';
  /* The person's other desks — the department screens behind this overview. */
  const desks = departments.filter((entry) => entry !== 'management');
  const refresh = () => {
    reload();
    desk.reload();
    drafts.reload();
    setPartiesKey((value) => value + 1);
    setActionsKey((value) => value + 1);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-steel-50">Company activity overview</h1>
          <p className="text-sm text-steel-400">All customers, enquiries and pending actions in one place.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {desks.map((entry) => (
            <Link key={entry} to={`/departments/${entry}`} className="btn-secondary">{departmentLabel(entry)} desk</Link>
          ))}
          {canRead('customers') && <button type="button" className="btn-secondary" onClick={() => setAdding('party')}>+ Add Party</button>}
          <button type="button" className="btn-primary" onClick={() => setAdding('enquiry')}>+ New Enquiry</button>
        </div>
      </div>

      <section className="card flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5" aria-label="Signed in">
        <div className="min-w-0">
          <p className="text-base font-bold text-steel-50">
            {user?.name} <span className="font-semibold text-steel-400">· {isAdmin ? 'Full access' : 'Own accounts'}</span>
          </p>
          <p className="text-sm text-steel-400">{user?.email}{user?.email ? ' · ' : ''}{access}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-flame-500/10 px-3 py-1 text-sm font-semibold text-accent">
          <span aria-hidden className="h-2 w-2 rounded-full bg-flame-500" />
          {role}
        </span>
      </section>

      {/* The company's figures — Admin's view. A marketing person's own figures were taken off their
          dashboard: the new enquiries, the tasks and the party master below are what they work from. */}
      {isAdmin && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <FigureTile label="Customers" value={figures.customers} hint="All accounts" to={canRead('customers') ? '/customers' : undefined} />
          <FigureTile label="Due today" value={figures.dueToday} hint="Open today’s follow-ups" to="/enquiries?view=due" />
          <FigureTile label="Active enquiries" value={figures.activeEnquiries} hint="View active enquiry status" to="/enquiries?view=open" />
          <FigureTile label="Quotations" value={figures.quotations} hint="Preparing, sent & negotiation" to={canRead('pricing') ? '/quotations' : undefined} />
        </div>
      )}

      {desk.data && <AttentionPanel attention={desk.data.attention} onChanged={refresh} />}

      <section className="card space-y-3 p-4 sm:p-5" aria-label="New Enquiries">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-steel-50">New Enquiries ({newEnquiries.total + draftRows.length})</h2>
            <p className="text-sm text-steel-400">
              Enquiry received: {newEnquiries.total}
              {draftRows.length > 0 && <> · <span className="font-semibold text-warn-400">Drafts to finish: {draftRows.length}</span></>}
            </p>
          </div>
          <Link to="/enquiries?marketingStatus=enquiry_received" className="text-sm font-semibold text-accent hover:underline">View all →</Link>
        </div>
        {newEnquiries.rows.length || draftRows.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {/* Drafts first, and marked: a lead from the phone is not an enquiry until somebody finishes it. */}
            {draftRows.map((card) => (
              <div key={card._id} data-draft className="rounded-xl border-2 border-warn-500/50 bg-warn-500/[0.08] p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-semibold text-steel-50">{card.reading?.company || card.reading?.contactName || 'A draft to fill in'}</p>
                  <span className="shrink-0 rounded-full bg-warn-500/20 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-warn-400">Draft</span>
                </div>
                <p className="text-xs text-steel-400">
                  {card.kind === 'chat' ? 'WhatsApp chat' : 'Visiting card'} · {card.sender?.name || 'Someone'} · {formatDate(card.createdAt)}
                  {card.status === 'reading' ? ' · being read…' : ''}
                </p>
                <Link to={`/enquiries/drafts?card=${card._id}`} className="mt-2 inline-block text-sm font-semibold text-accent hover:underline">
                  Finish the draft →
                </Link>
              </div>
            ))}
            {newEnquiries.rows.map((row) => (
              <div key={row._id} className="rounded-xl border border-line/10 p-3">
                <p className="truncate font-semibold text-steel-50">{row.customer?.name || row.prospect?.name || row.number}</p>
                <p className="text-xs text-steel-400">
                  Enquiry received · {row.assignedTo?.name || 'Unassigned'}
                  {row.requirement?.modelNumber ? ` · ${row.requirement.modelNumber}` : ''}
                </p>
                <Link to={`/enquiries/${row._id}`} className="mt-2 inline-block text-sm font-semibold text-accent hover:underline">
                  Edit / Verify enquiry →
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-steel-400">No new enquiry or draft waiting.</p>
        )}
      </section>

      {/* Every open enquiry — Admin's all of them, a marketing person's their own — with the list's own filters. */}
      {canRead('enquiries') && (
        <section className="card space-y-3 p-4 sm:p-5" aria-label="Open enquiries">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-steel-50">Open enquiries</h2>
              <p className="text-sm text-steel-400">{isAdmin ? 'Every enquiry still open, whoever holds it.' : 'Your enquiries still open, wherever their work is.'}</p>
            </div>
            <Link to="/enquiries?view=open" className="text-sm font-semibold text-accent hover:underline">Open the full list →</Link>
          </div>
          <Enquiries embedded />
        </section>
      )}

      <DepartmentTasksBoard />

      {canRead('customers') && (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <PartyMaster
            key={partiesKey}
            isAdmin={isAdmin}
            onAdd={() => setAdding('party')}
            refreshKey={partiesRefresh}
            onFollowUpChanged={() => setActionsKey((value) => value + 1)}
          />
          <TodaysActions refreshKey={actionsKey} onChanged={() => setPartiesRefresh((value) => value + 1)} />
        </div>
      )}

      <Modal open={adding === 'party'} title="New customer" description="Check for an existing record before creating a second one" size="lg" onClose={() => setAdding(null)}>
        {adding === 'party' && <CustomerForm onClose={() => setAdding(null)} onSaved={refresh} />}
      </Modal>
      <Modal open={adding === 'enquiry'} title="New enquiry" description="Every model the buyer asked about, each with its own tool and specification" size="lg" onClose={() => setAdding(null)}>
        {adding === 'enquiry' && <EnquiryForm onClose={() => setAdding(null)} onSaved={refresh} />}
      </Modal>
    </div>
  );
}
