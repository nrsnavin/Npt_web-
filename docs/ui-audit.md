# UI and interaction audit — 11 September 2026

The review covers shared layout and controls, API action feedback, customer forms, workflow actions, dispatch paperwork, payment receipts, staff offboarding, and stale asynchronous data. It is a source and automated behavior review. Visual browser review is pending: the available cloud browser refused the local preview with `ERR_BLOCKED_BY_CLIENT`. No production app or customer database was used.

## Changes

- One labelled, permission-filtered navigation replaces the duplicate icon rail, sidebar and module tabs. Phone navigation uses a dialog; the workspace tools collapse to a labelled button.
- Flat page canvas, clearer headings and table labels, stronger secondary text, 16px form inputs, and at least 44px shared buttons/inputs. Wide tables retain their own scrolling containers.
- Shared API writes announce work in progress and individual success/error outcomes, including overlapping requests. HTTP 202 says completion is pending. Errors remain beside form inputs where callers already display them. Exports announce preparation or failure.
- Dialogs have accessible names, keyboard focus containment, Escape handling, and focus restoration. Field hints/errors are linked to native controls. Notices and spinners expose live status. A skip link reaches the main content.
- Dispatch paperwork includes invoice date and disables issued invoice edits. Deferred accounting remains visible. Receipts keep a stable operation key during retries, and advance credit is shown explicitly.
- Offboarding explains deactivation, preserves history and lets administrators select a successor. Failures remain inside the open dialog.
- Record loading and board rollback protect against stale responses and concurrent card moves.

## Validation and limits

`npm test` exercises real React hooks, overlapping feedback events, partial completion, and dialog/error accessibility in jsdom. `npm run build` checks the complete route bundle. jsdom has no visual layout engine, so these results do not establish pixel-level appearance, mobile overflow, or full accessibility conformance.

Measured static foreground/background contrast: light primary button 5.98:1; dark primary 6.13:1; light secondary text on canvas 5.30:1; dark secondary text on raised surface 5.37:1; danger button 6.40:1. These are selected base token combinations, not a certification of all rendered states.

Before deployment, visually review desktop and phone layouts in light/dark themes, long populated tables, forms and field validation, save/failed-save/pending-completion feedback, receipt retries, and offboarding. Verify each department's actual grants. The GitHub connection currently refuses writes (403), so the work has not been merged or deployed.
