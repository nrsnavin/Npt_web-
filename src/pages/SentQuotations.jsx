import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { quotations as quotationsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced, useRecordList } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, Notice, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import StagePipeline from '../components/StagePipeline.jsx';
import QuotationPdf from '../components/QuotationPdf.jsx';
import { SortHeader, useSort } from '../components/SortHeader.jsx';
import { formatDate, formatNumber, humanise } from '../utils/format.js';

/**
 * What has actually gone to a buyer, and what each price was worked out from [BLUEPRINT §7, §10].
 *
 * A costing screen and a quotation screen answer two questions about the same money, and neither
 * answers this one: *what is currently out there with customers, and can we still stand behind
 * it?* On the full quotation register that set is buried among drafts — half-written quotes,
 * prices waiting on a signature, sheets somebody opened and abandoned — and those are exactly
 * the rows that do not matter when a buyer rings up about a number they were given.
 *
 * So this board carries one rule: **it has been sent**. Not the `sent` status, which is only
 * where a quote rests between leaving the building and being answered — a quote that was sent
 * and then revised, accepted or refused has been in front of a customer just the same, and a
 * board built on the status would show three when the plant has sent thirty. The server filters
 * on `sentAt`, which is stamped once on the way out and never cleared.
 *
 * And the costing comes with it. "What did we price that off?" is the first question asked of a
 * quote that has gone out — usually while the buyer is still on the phone — and answering it
 * used to mean opening the document and then opening the sheet behind each line. Here each line
 * names its sheet, links to it, and for anybody holding the costing right shows the cost and the
 * margin that price is actually carrying. §8 does the rest: marketing sees the sheet number,
 * because that is what they quote when they ask about it, and whether the line sits under its
 * floor — never the floor itself.
 */

const SENT_STAGES = [
  { value: 'sent', label: 'With the buyer' },
  { value: 'revised', label: 'Re-priced' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Refused' },
  { value: 'approval_pending', label: 'Needs approval' },
];

const rupees = (value) =>
  value === undefined || value === null ? '—' : `₹${Number(value).toFixed(2)}`;

/** The span of rates on a document, which is the only honest single figure for one. */
const rateSpan = (lines = []) => {
  const offered = lines.map((line) => line.unitPrice).filter((value) => value != null);
  if (!offered.length) return '—';
  const low = Math.min(...offered);
  const high = Math.max(...offered);
  return low === high ? rupees(low) : `${rupees(low)} – ${rupees(high)}`;
};

/** Days until the offer lapses — negative once it has. */
const daysLeft = (validUntil) =>
  validUntil ? Math.ceil((new Date(validUntil).getTime() - Date.now()) / 86400000) : null;

/**
 * The costings behind one quotation, line by line.
 *
 * Opened rather than always shown: eight models is eight sheets, and a table that printed all of
 * them on every row would bury the thing somebody came to this screen for. The summary on the
 * row says whether there is anything to open.
 *
 * What each reader gets is decided by the server and simply rendered here. `totalCost` arriving
 * `undefined` is §8 doing its job, not a gap to fill in — so the costing columns appear only for
 * a reader who actually has figures in them, rather than as a row of dashes that reads like the
 * data is missing.
 */
function CostingBreakdown({ quotation, seesCost }) {
  const lines = quotation.lines || [];

  return (
    <div className="rounded-lg border border-line/[0.06] bg-line/[0.02] px-3.5 py-3">
      <p className="eyebrow mb-2">What each price was worked out from</p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="text-left text-steel-500">
              <th className="py-1.5 pr-4 font-semibold">Model</th>
              <th className="py-1.5 pr-4 text-right font-semibold">Quoted</th>
              <th className="py-1.5 pr-4 font-semibold">Costing</th>
              {seesCost && <th className="py-1.5 pr-4 text-right font-semibold">Cost</th>}
              {seesCost && <th className="py-1.5 pr-4 text-right font-semibold">Floor</th>}
              {seesCost && <th className="py-1.5 pr-4 text-right font-semibold">Margin</th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={line._id || index} className="border-t border-line/[0.04]">
                <td className="py-1.5 pr-4 text-steel-200">
                  {line.modelNumber || line.mould?.mouldCode || `Line ${index + 1}`}
                  {line.colour ? <span className="text-steel-500"> · {line.colour}</span> : null}
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-steel-100">
                  {rupees(line.unitPrice)}
                </td>
                <td className="py-1.5 pr-4">
                  {line.pricing ? (
                    <>
                      <Link
                        to={`/pricings/${line.pricing._id}`}
                        className="font-semibold text-accent hover:underline"
                      >
                        {line.pricing.number}
                      </Link>
                      {/*
                        Marketing's one fact about the floor, and the only one §8 allows: whether
                        this price is under it. A block nobody can explain reads as a fault.
                      */}
                      {line.pricing.belowFloor && (
                        <span className="ml-1.5 font-semibold text-danger-400">under its floor</span>
                      )}
                    </>
                  ) : (
                    /* Honest rather than blank. Plenty of repeat jobs are quoted from a known
                       price, and a line with no sheet behind it is a fact about the quote. */
                    <span className="text-steel-500">Quoted from a known price</span>
                  )}
                </td>
                {seesCost && (
                  <td className="py-1.5 pr-4 text-right tabular-nums text-steel-400">
                    {rupees(line.pricing?.totalCost)}
                  </td>
                )}
                {seesCost && (
                  <td className="py-1.5 pr-4 text-right tabular-nums text-steel-400">
                    {rupees(line.pricing?.minimumSellingPrice)}
                  </td>
                )}
                {seesCost && (
                  <td
                    className={`py-1.5 pr-4 text-right tabular-nums ${
                      line.pricing?.belowFloor ? 'text-danger-400' : 'text-steel-100'
                    }`}
                  >
                    {line.pricing?.marginPercent === undefined || line.pricing?.marginPercent === null
                      ? '—'
                      : `${line.pricing.marginPercent}%`}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SentQuotations() {
  const { canWrite, canQuote } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState({});
  const [viewing, setViewing] = useState(null);
  const [params] = useSearchParams();
  /* Renamed at the destructure: `toggle` on this screen already means expanding a row's
     costing, and two functions of that name in one component is how the wrong one gets bound. */
  const { sort, toggle: toggleSort } = useSort();

  const sortBy = (field) => {
    toggleSort(field);
    setPage(1);
  };

  /* The cost base, the floor and the margin are management's [§8]; the server has already
     removed them, and this only decides whether to print the columns at all. */
  const seesCost = canWrite('pricing');
  const mayQuote = canQuote('pricing');
  const term = useDebounced(search);

  const { data, pagination, meta, loading, error, reload } = useRecordList(quotationsApi.list, {
    /* The whole point of the screen, and not a filter the reader can clear. */
    sent: 'true',
    search: term || undefined,
    status: status || undefined,
    customer: params.get('customer') || undefined,
    enquiry: params.get('enquiry') || undefined,
    sort: sort || undefined,
    page,
    limit: 25,
  });

  const selectStage = (value) => {
    setStatus(value === status ? '' : value);
    setPage(1);
  };

  const toggle = (id) => setOpen((current) => ({ ...current, [id]: !current[id] }));

  /* How many of these are still live offers, said once at the top. A quotation past its validity
     is not a mistake — it is the thing to ring the buyer about. */
  const lapsed = data.filter((row) => {
    const left = daysLeft(row.validUntil);
    return left !== null && left < 0 && !['accepted', 'rejected'].includes(row.status);
  }).length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Sent quotations"
        subtitle="Every price that has actually gone to a buyer, with the costing it was worked out from"
        actions={
          <Link to="/quotations" className="btn-secondary">
            All quotations
          </Link>
        }
      />

      <StagePipeline
        stages={SENT_STAGES}
        counts={meta.stageCounts}
        selected={status}
        onSelect={selectStage}
        loading={loading}
        dense
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search number or model…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </div>

      {!loading && lapsed > 0 && (
        <div className="mb-4">
          <Notice tone="warn">
            {lapsed === 1
              ? 'One of these has passed its validity and has not been answered.'
              : `${lapsed} of these have passed their validity and have not been answered.`}{' '}
            The price is no longer one the plant is holding — worth a call before it is honoured.
          </Notice>
        </div>
      )}

      {loading && <TableSkeleton columns={seesCost ? 7 : 6} />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {!loading && !error && (data.length === 0 ? (
        <EmptyState
          title="Nothing has gone out yet"
          description="A quotation appears here the moment it is sent, and stays whatever the buyer answers."
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <SortHeader field="number" label="Quotation" sort={sort} onToggle={sortBy} />
                    <th className="px-3 py-3">Customer</th>
                    <th className="px-3 py-3">Models</th>
                    {/* Off the lines, so there is no single stored figure to rank — see the API. */}
                    <th className="px-3 py-3 text-right">Rate per piece</th>
                    <th className="px-3 py-3">Priced off</th>
                    {/* The ordering this board is really for: how long a price has been with a
                        buyer unanswered is what somebody opens this screen to find out. */}
                    <SortHeader field="sentAt" label="Sent" sort={sort} onToggle={sortBy} />
                    <SortHeader field="validUntil" label="Valid" sort={sort} onToggle={sortBy} />
                    <SortHeader field="status" label="Stage" sort={sort} onToggle={sortBy} />
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {data.map((row) => {
                    const lines = row.lines || [];
                    const sheets = lines.filter((line) => line.pricing);
                    const under = sheets.filter((line) => line.pricing.belowFloor).length;
                    const left = daysLeft(row.validUntil);
                    const waiting = row.sentAt ? -daysLeft(row.sentAt) : null;
                    const expanded = Boolean(open[row._id]);

                    return [
                      <tr key={row._id} className="row-hover">
                        <td className="whitespace-nowrap px-3 py-3.5">
                          <Link
                            to={`/quotations/${row._id}`}
                            className="font-semibold text-steel-100 hover:text-accent"
                          >
                            {row.number}
                          </Link>
                          {/* The revision that went out — the fact somebody holding a printed
                              copy reads back down the phone. The day it went has a column of
                              its own now, so it can be sorted by. */}
                          <p className="text-xs text-steel-400">Rev {row.revision}</p>
                        </td>
                        <td className="px-3 py-3.5 text-steel-200">{row.customer?.name || '—'}</td>
                        <td className="px-3 py-3.5 text-steel-300">
                          {lines.length === 1
                            ? lines[0].modelNumber || '—'
                            : `${lines.length} models`}
                          {lines.length > 1 && (
                            <p className="max-w-[16rem] truncate text-xs text-steel-500">
                              {lines.map((line) => line.modelNumber).filter(Boolean).join(', ')}
                            </p>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-steel-100">
                          {rateSpan(lines)}
                          {lines.length === 1 && lines[0].moq ? (
                            <p className="text-xs text-steel-500">
                              min {formatNumber(lines[0].moq)} pcs
                            </p>
                          ) : null}
                          {row.isExport && (
                            <p className="text-[0.75rem] uppercase tracking-wide text-aqua-400">Export</p>
                          )}
                        </td>

                        {/*
                          The answer to "what did we price that off?", on the row. One sheet is
                          named outright; several are counted, because naming the first of eight
                          and implying the rest is how a row comes to describe a document it does
                          not describe.
                        */}
                        <td className="whitespace-nowrap px-3 py-3.5">
                          {sheets.length === 0 ? (
                            <span className="text-xs text-steel-500">No costing</span>
                          ) : (
                            <button
                              type="button"
                              className="row-action text-left"
                              onClick={() => toggle(row._id)}
                              aria-expanded={expanded}
                            >
                              {sheets.length === 1
                                ? sheets[0].pricing.number
                                : `${sheets.length} costings`}
                              <span className="ml-1 text-steel-500">{expanded ? '▾' : '▸'}</span>
                            </button>
                          )}
                          {under > 0 && (
                            <p className="text-xs font-semibold text-danger-400">
                              {under === 1 ? '1 line under its floor' : `${under} lines under their floor`}
                            </p>
                          )}
                        </td>

                        {/* How long it has been out, which is the question a sent board is
                            asked. The day alone does not answer it — "18 days ago" does. */}
                        <td className="whitespace-nowrap px-3 py-3.5 text-xs">
                          <span className="text-steel-300">{formatDate(row.sentAt)}</span>
                          {waiting !== null && (
                            <p className={waiting >= 14 ? 'font-semibold text-warn-400' : 'text-steel-500'}>
                              {waiting === 0 ? 'today' : waiting === 1 ? '1 day ago' : `${waiting} days ago`}
                            </p>
                          )}
                        </td>

                        <td className="whitespace-nowrap px-3 py-3.5 text-xs">
                          {row.validUntil ? (
                            <>
                              <span className="text-steel-300">{formatDate(row.validUntil)}</span>
                              <p
                                className={
                                  left < 0
                                    ? 'font-semibold text-danger-400'
                                    : left <= 7
                                      ? 'font-semibold text-warn-400'
                                      : 'text-steel-500'
                                }
                              >
                                {left < 0
                                  ? `lapsed ${Math.abs(left)}d ago`
                                  : left === 0
                                    ? 'lapses today'
                                    : `${left}d left`}
                              </p>
                            </>
                          ) : (
                            <span className="text-steel-500">Open-ended</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5">
                          <Badge status={row.status}>{humanise(row.status)}</Badge>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-right">
                          <div className="flex justify-end gap-1.5">
                            {/*
                              What was actually sent. Outside every write guard on purpose — a
                              reader who may see the quotation may see the document it went out as.
                            */}
                            <button
                              type="button"
                              className="btn-secondary px-2.5 py-1 text-xs"
                              onClick={() => setViewing(row)}
                            >
                              PDF
                            </button>
                            {/* The two things anybody does on this screen. Both live on the
                                quotation itself, which carries the revision history the forms
                                are built from — this is a board, not a second place to edit. */}
                            {mayQuote && !['accepted', 'rejected'].includes(row.status) && (
                              <Link
                                to={`/quotations/${row._id}`}
                                className="btn-primary px-2.5 py-1 text-xs"
                              >
                                {row.status === 'sent' ? 'Answer' : 'Open'}
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>,
                      expanded ? (
                        <tr key={`${row._id}-costing`}>
                          <td colSpan={8} className="px-3 pb-3.5">
                            <CostingBreakdown quotation={row} seesCost={seesCost} />
                          </td>
                        </tr>
                      ) : null,
                    ];
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination pagination={pagination} onChange={setPage} />
        </>
      ))}

      {/* Said once, where somebody would otherwise wonder why the breakdown is thin. */}
      {!seesCost && data.length > 0 && (
        <p className="mt-4 text-xs leading-relaxed text-steel-500">
          The cost base, the margin and the minimum price are management’s [§8]. What you see is
          the sheet each price came off, and whether that price sits under its floor.
        </p>
      )}

      <QuotationPdf
        quotation={viewing}
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}
