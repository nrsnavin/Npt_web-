import { useState } from 'react';

/**
 * The list on screen, as a spreadsheet [§34].
 *
 * The plant runs on spreadsheets alongside this and will for years. An export is not a
 * concession to that — it is how somebody builds a figure nobody thought to put on a
 * dashboard. Without it they keep a parallel sheet by hand, which is the thing the CRM
 * exists to stop.
 *
 * `params` is whatever the screen is currently filtered by, passed straight through, so the
 * file matches what the person can see. A "download" that quietly widens the filters is
 * worse than no download, because the file looks right.
 */
export default function ExportButton({ download, params, label = 'Export' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await download(params);
    } catch (downloadError) {
      setError(downloadError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className="btn-secondary"
      onClick={run}
      disabled={busy}
      // The failure is rare and never blocks anything, so it goes on the control itself
      // rather than pushing a banner into a screen that is otherwise working.
      title={error || 'Download what is on screen as a CSV'}
    >
      {busy ? 'Preparing…' : error ? 'Export failed' : label}
    </button>
  );
}
