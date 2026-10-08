import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import { workspaceFor } from '../config/departments.js';
import { Section } from './ui.jsx';

/**
 * A department's workspace, on its dashboard: the screens it works from, the enquiries sitting
 * at its stages, and — lower down — what it is there to do and the tasks other departments send
 * it. The words and links come from `config/departments.js`, which is the file to edit; the
 * stages and tasks come from the server.
 */

/** The screens this department works from, and the enquiries at its stages. */
export function WorkspaceLinks({ department, label, atStages = [] }) {
  const { canRead, isAdmin } = useAuth();
  const workspace = workspaceFor(department);
  const pages = (workspace?.pages || []).filter((page) => !page.module || isAdmin || canRead(page.module));
  if (!pages.length && !atStages.length) return null;

  return (
    <Section title={`${label} works from`}>
      {workspace?.purpose && <p className="-mt-2 mb-4 text-sm text-steel-300">{workspace.purpose}</p>}

      {atStages.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {atStages.map((stage) => (
            <Link
              key={stage.key}
              to={`/enquiries?stage=${stage.key}`}
              className="card flex min-w-[9rem] items-center gap-3 px-3 py-2 hover:border-accent/60"
            >
              <span className="text-2xl font-bold tabular-nums text-steel-50">{stage.count}</span>
              <span className="text-xs leading-tight text-steel-400">
                enquiries at<br />
                <span className="font-semibold text-steel-200">{stage.number}. {stage.label}</span>
              </span>
            </Link>
          ))}
        </div>
      )}

      {pages.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((page) => (
            <Link
              key={`${page.to}-${page.label}`}
              to={page.to}
              className="rounded-lg border border-line/[0.08] px-3 py-2.5 hover:border-accent/60 hover:bg-line/[0.03]"
            >
              <span className="block text-sm font-semibold text-steel-100">{page.label} →</span>
              {page.hint && <span className="mt-0.5 block text-xs text-steel-400">{page.hint}</span>}
            </Link>
          ))}
        </div>
      )}
    </Section>
  );
}

/** What the department does, the tasks it can be sent, and what is still to be decided. */
export function WorkspaceBrief({ department, label }) {
  const catalogue = useHandoffCatalogue();
  const workspace = workspaceFor(department);
  /* "My Payment Follow-up" goes to whoever holds the enquiry, which is marketing. */
  const receives = (catalogue?.buttons || []).filter((button) =>
    button.department === department || (button.department === 'owner' && department === 'marketing'));
  const jobs = workspace?.jobs || [];
  const open = workspace?.toConfirm || [];
  if (!jobs.length && !receives.length && !open.length) return null;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {jobs.length > 0 && (
        <Section title={`What ${label} does`}>
          <ul className="space-y-1.5 text-sm text-steel-200">
            {jobs.map((job) => (
              <li key={job} className="flex gap-2">
                <span aria-hidden className="text-accent">•</span>
                <span>{job}</span>
              </li>
            ))}
          </ul>
          {open.length > 0 && (
            <div className="mt-4 rounded-lg border border-warn-500/30 bg-warn-500/[0.06] px-3 py-2 text-xs text-warn-400">
              <p className="font-semibold">Still to decide</p>
              <ul className="mt-1 list-disc pl-4">
                {open.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}
        </Section>
      )}

      {receives.length > 0 && (
        <Section title={`Tasks other departments send ${label}`}>
          <ul className="divide-y divide-line/[0.06] text-sm">
            {receives.map((button) => (
              <li key={button.key} className="py-2 first:pt-0 last:pb-0">
                <p className="font-semibold text-steel-100">{button.label}</p>
                {button.hint && <p className="text-xs text-steel-400">{button.hint}</p>}
                {button.records?.length > 0 && (
                  <p className="mt-0.5 text-xs text-steel-500">
                    Records when done: {button.records.map((field) => field.label).join(', ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
