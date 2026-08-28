import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { integrations as integrationsApi } from '../api/endpoints.js';
import { useRecord } from '../hooks/useRecords.js';
import { Badge, ErrorState, Notice, PageHeader, Section, Spinner } from '../components/ui.jsx';
import { formatNumber } from '../utils/format.js';

/**
 * The outside feeds, and whether they are actually working [BLUEPRINT §41 by analogy].
 *
 * This screen exists for one sentence: *"we're not getting IndiaMART leads any more."* Without
 * it the only honest answer is to read the server log, so the question goes unanswered and the
 * feed is quietly distrusted long before anybody proves it is broken.
 *
 * So the page leads with the two facts that settle it — when it last ran, and what went wrong
 * if anything did — rather than with a tidy summary that looks the same whether the integration
 * is healthy or has been failing since Tuesday.
 */

/** A timestamp as a person reads it, plus how long ago — which is the part that matters here. */
function When({ value }) {
  if (!value) return <span className="text-steel-500">never</span>;

  const at = new Date(value);
  const minutes = Math.round((Date.now() - at.getTime()) / 60000);
  const ago =
    minutes < 1 ? 'just now'
      : minutes < 60 ? `${minutes} min ago`
        : minutes < 60 * 24 ? `${Math.round(minutes / 60)} h ago`
          : `${Math.round(minutes / 1440)} d ago`;

  return (
    <span>
      {at.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
      <span className="ml-2 text-steel-500">{ago}</span>
    </span>
  );
}

function Fact({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-xs uppercase tracking-wide text-steel-500">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-steel-100">{value}</dd>
    </div>
  );
}

/** One number from the last run, captioned with what it means rather than its field name. */
function Tally({ label, value, hint, tone = 'text-steel-50' }) {
  return (
    <div className="card px-4 py-3">
      <p className="eyebrow">{label}</p>
      <p className={`stat-value mt-1 ${tone}`}>{formatNumber(value || 0)}</p>
      {hint && <p className="mt-0.5 text-[0.6875rem] text-steel-500">{hint}</p>}
    </div>
  );
}

export default function Integrations() {
  const fetch = useCallback(() => integrationsApi.indiamart.status(), []);
  const { data, loading, error, reload } = useRecord(fetch, 'indiamart');

  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [runError, setRunError] = useState(null);

  const pullNow = async () => {
    setRunning(true);
    setRunError(null);
    setLastResult(null);
    try {
      const result = await integrationsApi.indiamart.sync();
      setLastResult(result);
      reload();
    } catch (problem) {
      setRunError(problem.message);
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <Spinner label="Checking the feeds" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  /*
   * Healthy is not the same as "ran recently". A feed that has run every fifteen minutes and
   * failed every time is the case this screen is for, so the badge is driven by the failure
   * count rather than by the timestamp.
   */
  const off = !data.configured;
  const failing = data.failureCount > 0;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Integrations"
        subtitle="Feeds that put records into the system without anybody typing them"
      />

      <Section
        title="IndiaMART leads"
        actions={
          <div className="flex items-center gap-2">
            {!off && (
              <button
                type="button"
                className="btn-secondary px-3 py-1 text-xs"
                disabled={running}
                onClick={pullNow}
              >
                {running ? 'Pulling…' : 'Pull now'}
              </button>
            )}
            <Badge tone={off ? 'neutral' : failing ? 'danger' : 'success'}>
              {off ? 'Off' : failing ? 'Failing' : 'Running'}
            </Badge>
          </div>
        }
      >
        {/*
          The not-configured state is what an administrator sees first, so it says what to do
          rather than only that nothing is happening. A screen that reports "Off" and stops is
          one that sends somebody to find a developer.
        */}
        {off ? (
          <Notice tone="info">
            <p className="font-semibold">No key configured, so the feed is off.</p>
            <p className="mt-1">
              Get the CRM key from IndiaMART: <strong>Lead Manager → Import/Export Leads → API</strong>,
              then set <code className="rounded bg-line/[0.08] px-1">INDIAMART_CRM_KEY</code> in the
              server&rsquo;s <code className="rounded bg-line/[0.08] px-1">.env</code> and restart it.
            </p>
            <p className="mt-1 text-steel-400">
              Anyone holding that key can read every enquiry your listing has ever received —
              treat it like a password.
            </p>
          </Notice>
        ) : (
          <>
            {/*
              The error goes above the numbers, not below them. Buried under a healthy-looking
              tally it reads as a footnote about a feed that is plainly working.
            */}
            {data.lastError && (
              <Notice tone={failing ? 'danger' : 'warn'}>
                <p className="font-semibold">
                  {failing
                    ? `Failing — ${data.failureCount} run(s) in a row have not worked.`
                    : 'The last run got through, but not cleanly.'}
                </p>
                <p className="mt-1">{data.lastError}</p>
                {/* Their commonest refusal, and the one that looks like a bug rather than a limit. */}
                {/limit|exceed/i.test(data.lastError) && (
                  <p className="mt-1 text-steel-400">
                    IndiaMART rate-limits this endpoint to about one call every five minutes.
                    Pulling by hand too often produces exactly this.
                  </p>
                )}
              </Notice>
            )}

            <div className="grid gap-3 sm:grid-cols-4">
              <Tally label="Fetched" value={data.lastRun?.fetched} hint="in the last run" />
              <Tally
                label="New leads"
                value={data.lastRun?.created}
                hint="raised and assigned"
                tone="text-success-400"
              />
              <Tally
                label="Added to existing"
                value={data.lastRun?.attachedToExisting}
                hint="buyers we already had"
              />
              <Tally
                label="Seen before"
                value={data.lastRun?.duplicates}
                hint="the overlap doing its job"
              />
            </div>

            {data.lastRun?.skipped ? (
              <p className="mt-3 text-xs text-warn-400">
                {formatNumber(data.lastRun.skipped)} row(s) could not be read and were skipped.
                They stay in IndiaMART; nothing was lost here.
              </p>
            ) : null}

            <dl className="mt-4 space-y-1 border-t border-line/[0.06] pt-4">
              <Fact label="Last run" value={<When value={data.lastRunAt} />} />
              <Fact label="Last success" value={<When value={data.lastSuccessAt} />} />
              {/*
                The watermark, in plain words. It is the one piece of internal state worth
                showing: it explains why a lead from this morning has not appeared yet, and why
                re-running will not fetch it twice.
              */}
              <Fact
                label="Read up to"
                value={<When value={data.lastSyncedAt} />}
              />
              <Fact label="Pulls every" value={`${data.pollMinutes} minutes`} />
              <Fact
                label="Leads from this feed"
                value={
                  <Link to="/leads?source=indiamart" className="text-steel-100 hover:text-accent">
                    {formatNumber(data.leadsFromFeed)}
                  </Link>
                }
              />
              <Fact
                label="Since it was switched on"
                value={`${formatNumber(data.totals?.fetched)} fetched · ${formatNumber(
                  data.totals?.created
                )} became leads`}
              />
            </dl>

            {runError && <Notice tone="danger">{runError}</Notice>}

            {/*
              The result of a manual pull, said as a sentence. "Done" would leave the operator
              no better informed than before they pressed it.
            */}
            {lastResult && !lastResult.failed && (
              <Notice tone="success">
                Pulled {formatNumber(lastResult.fetched)} enquir
                {lastResult.fetched === 1 ? 'y' : 'ies'} — {formatNumber(lastResult.created)} new
                lead{lastResult.created === 1 ? '' : 's'},{' '}
                {formatNumber(lastResult.attachedToExisting)} added to buyers we already had,{' '}
                {formatNumber(lastResult.duplicates)} already seen.
              </Notice>
            )}

            {lastResult?.failed && <Notice tone="danger">{lastResult.error}</Notice>}
          </>
        )}
      </Section>

      <Section title="How it works">
        <ul className="space-y-2 text-sm leading-relaxed text-steel-300">
          <li>
            A buyer enquires on IndiaMART. Within {data.pollMinutes} minutes the enquiry arrives
            here as a lead, owned by the next marketing person in the rotation, with a call
            already set as its next step.
          </li>
          <li>
            A buyer who enquires twice does not become two leads. The second enquiry is added to
            the lead we already have, so nobody rings them twice about the same thing.
          </li>
          <li>
            The same enquiry is never loaded twice, whatever happens to the connection — each one
            carries IndiaMART&rsquo;s own reference, and that is what is checked.
          </li>
          <li>
            Nothing is lost if this is down. The feed remembers where it read up to and carries on
            from there, so a lead that arrives while the server is restarting is picked up next
            time rather than skipped.
          </li>
        </ul>
      </Section>
    </div>
  );
}
