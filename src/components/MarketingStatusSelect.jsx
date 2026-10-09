import { useState } from 'react';
import { enquiries as enquiriesApi } from '../api/endpoints.js';
import { MARKETING_STATUSES, marketingStatusLabel } from '../utils/pipeline.js';

/**
 * The enquiry's "Current Marketing Status" as a dropdown — on the enquiry's side panel and on
 * each row of the enquiry list. Saves on choosing; the server decides who may [server:
 * pipeline.controller `setEnquiryMarketingStatus`], and says so here when it refuses.
 */
export default function MarketingStatusSelect({ enquiry, canWrite, onChanged, compact = false }) {
  const current = enquiry.currentMarketingStatus || enquiry.marketingStatus || 'enquiry_received';
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [said, setSaid] = useState(null);

  /* Follow the record when it is reloaded from elsewhere. */
  const [seen, setSeen] = useState(current);
  if (seen !== current) {
    setSeen(current);
    setValue(current);
  }

  if (!canWrite) {
    return <span className="text-sm font-semibold text-steel-200">{marketingStatusLabel(current)}</span>;
  }

  const choose = async (next) => {
    const previous = value;
    setValue(next);
    setBusy(true);
    setError(null);
    setSaid(null);
    try {
      const reply = await enquiriesApi.setMarketingStatus({ id: enquiry._id, status: next });
      const starts = MARKETING_STATUSES.find((entry) => entry.value === next)?.starts;
      if (reply?.meta?.movedTo && starts) setSaid(`${starts} — done.`);
      onChanged?.(reply?.data);
    } catch (saveError) {
      setValue(previous);
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={compact ? 'min-w-[11rem]' : ''}>
      <select
        aria-label={`Marketing status of ${enquiry.number}`}
        className={`input ${compact ? 'py-1 text-xs' : ''}`}
        value={value}
        disabled={busy}
        onChange={(event) => choose(event.target.value)}
      >
        {MARKETING_STATUSES.map((entry) => (
          <option key={entry.value} value={entry.value}>{entry.label}</option>
        ))}
      </select>
      {!compact && <MarketingStatusHint value={value} />}
      {said && <p className="mt-1 text-xs text-success-400">{said}</p>}
      {error && <p className="mt-1 text-xs text-danger-400">{error}</p>}
    </div>
  );
}

/** What the chosen status also does, when it does something. */
function MarketingStatusHint({ value }) {
  const starts = MARKETING_STATUSES.find((entry) => entry.value === value)?.starts;
  if (!starts) return null;
  return <p className="mt-1 text-xs text-steel-500">{starts}.</p>;
}
