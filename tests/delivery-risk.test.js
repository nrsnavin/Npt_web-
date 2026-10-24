/**
 * The delivery risk [server: services/deliveryRisk.service.js] on every screen that shows an
 * order: the enquiry page, the enquiry list, the production and finishing queues, the desk cards,
 * the workflow page, and the at-risk list on the desks and the overview.
 *
 *   node --test tests/delivery-risk.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('one look for the reading: five levels, the badge with its reasons, the full reading, the at-risk list', () => {
  const risk = read('components/DeliveryRisk.jsx');
  for (const level of ['late', 'will_miss', 'at_risk', 'watch', 'on_track']) assert.match(risk, new RegExp(`${level}: \\{ chip:`));
  assert.match(risk, /export const inDanger = \(risk\) => \['late', 'will_miss', 'at_risk', 'watch'\]\.includes\(risk\?\.level\);/);
  assert.match(risk, /title=\{\[risk\.why, \.\.\.\(risk\.reasons \|\| \[\]\)\]\.filter\(Boolean\)\.join\('\\n'\)\}/);
  assert.match(risk, /\$\{risk\.modelsLeft\}\/\$\{risk\.models\} models/, 'an order of several models says how many are left');
  assert.match(risk, /productionApi\.atRisk\(\)/);
  assert.match(read('api/endpoints.js'), /atRisk: \(\) => api\.get\('\/production\/at-risk'\)/);
});

test('the reading is on the enquiry page, the list, both queues, the desk cards and the workflow page', () => {
  assert.match(read('components/DepartmentDesk.jsx'), /<DeliveryReading risk=\{history\?\.risk\}/);
  assert.match(read('pages/Enquiries.jsx'), /<DeliveryBadge risk=\{enquiry\.progress\.risk\}/);
  assert.match(read('components/ProductionQueueList.jsx'), /\{inDanger\(row\.delivery\) && <DeliveryBadge risk=\{row\.delivery\} \/>\}/);
  assert.match(read('components/FinishingQueueList.jsx'), /\{inDanger\(row\.delivery\) && <DeliveryBadge risk=\{row\.delivery\} \/>\}/);
  assert.match(read('components/FinishingDeskList.jsx'), /\{inDanger\(row\.delivery\) && <DeliveryBadge risk=\{row\.delivery\}/);
  assert.match(read('pages/DepartmentDashboard.jsx'), /\{inDanger\(row\.delivery\) && <DeliveryBadge risk=\{row\.delivery\} \/>\}/);
  assert.match(read('pages/ProductionWorkflow.jsx'), /<DeliveryReading risk=\{delivery\} \/>/);
  assert.match(read('pages/ProductionWorkflow.jsx'), /title="The last team’s completion date for the model">Completion<\/th>/);
});

test('the at-risk list is on the Production, marketing and management desks and the overview', () => {
  const dashboard = read('pages/DepartmentDashboard.jsx');
  assert.match(dashboard, /const RISK_DESKS = \['production', 'marketing', 'management'\];/);
  assert.match(dashboard, /\{RISK_DESKS\.includes\(figures\.department\) && <DeliveryRiskPanel \/>\}/);
  assert.match(read('pages/OverviewDashboard.jsx'), /<DeliveryRiskPanel \/>/);
});
