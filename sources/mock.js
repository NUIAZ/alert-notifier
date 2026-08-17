/**
 * sources/mock.js — deterministic sample alerts, no network.
 *
 * Purpose: a guaranteed demo. Live feeds are quiet on good days, and a
 * portfolio piece that shows "All clear" on first run has not demonstrated
 * anything. Mock mode produces one alert at every severity so the badge colour,
 * card ordering, OS notification, and the modal window can all be seen in one
 * click of "Test notifications" on the options page. It is also what the unit
 * tests and the screenshots in the README use.
 *
 * The times are relative to "now" so the "Started" / "Expected end" labels on
 * cards always read sensibly no matter when you install.
 *
 * NOTE the deliberately inactive item at the end: it verifies the active-only
 * filter in background.js — it must never appear in the popup.
 */

import { makeAlert } from './types.js';

export const id = 'mock';
export const label = 'Sample data (offline)';
export const description =
  'Five fixed alerts, one per severity, generated locally. Use this to see every treatment without waiting for a real event.';
export const hosts = [];
export const settings = [];

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/**
 * @param {object} _opts  unused — the mock takes no settings
 * @param {Date} [now]    injectable clock for tests
 */
export async function fetchAlerts(_opts = {}, now = new Date()) {
  const t = now.getTime();
  const iso = ms => new Date(ms).toISOString();

  return [
    makeAlert({
      id: 'mock-critical-001',
      title: 'Data centre power loss',
      message:
        'Utility power to the primary data centre was lost at 09:12 and the generator failed to take the load. ' +
        'All hosted services are unavailable. Facilities and the on-call engineer are on site.',
      severity: 'critical',
      startTime: iso(t - 2 * HOUR),
      endTime: null,
    }),
    makeAlert({
      id: 'mock-serious-001',
      title: 'Email delivery delayed',
      message:
        'Outbound mail is queuing on the relay and delivery is delayed by 30–60 minutes. ' +
        'Inbound mail is unaffected. A fix is being rolled out now.',
      severity: 'serious',
      startTime: iso(t - 45 * MIN),
      endTime: iso(t + 2 * HOUR),
    }),
    makeAlert({
      id: 'mock-warning-001',
      title: 'Scheduled maintenance: HR portal',
      message:
        'The HR portal will be offline for a scheduled upgrade this evening. ' +
        'Please finish any timesheet or leave requests before the window starts.',
      severity: 'warning',
      startTime: iso(t + 4 * HOUR),
      endTime: iso(t + 8 * HOUR),
    }),
    makeAlert({
      id: 'mock-info-001',
      title: 'New version of the collaboration tool',
      message:
        'Version 5.2 is available from the software centre. Update at your convenience; ' +
        'no action is required before next Monday.',
      severity: 'info',
      startTime: iso(t),
      endTime: null,
    }),
    makeAlert({
      id: 'mock-info-002',
      title: 'Printer maintenance, floor 3',
      message:
        'The floor 3 printer near the break room is being serviced. Use floor 2 or 4 in the meantime.',
      severity: 'info',
      startTime: iso(t - 15 * MIN),
      endTime: iso(t + 1 * HOUR),
    }),
    makeAlert({
      // Inactive on purpose — proves the active filter. Must never render.
      id: 'mock-inactive-001',
      title: 'Resolved: database connection errors',
      message: 'This has been resolved.',
      severity: 'serious',
      active: false,
      startTime: iso(t - 24 * HOUR),
      endTime: iso(t - 20 * HOUR),
    }),
  ];
}
