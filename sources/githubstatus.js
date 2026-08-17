/**
 * sources/githubstatus.js: unresolved incidents on githubstatus.com.
 *
 * Endpoint:  https://www.githubstatus.com/api/v2/incidents/unresolved.json
 * Docs:      https://www.githubstatus.com/api  (Atlassian Statuspage v2; the
 *            same JSON shape is served by hundreds of other status pages, e.g.
 *            status.openai.com, status.cloudflare.com, so this adapter is a
 *            template for any of them: change the host and the label.)
 * Auth:      none.  CORS: open.
 *
 * Why include it: this is thematically what the original internal extension
 * did: watch a service-status feed and interrupt people for the bad ones. The
 * catch for a demo is that GitHub is usually healthy, so the popup will often
 * say "All clear". That is exactly why NWS is the default source and this is
 * the second adapter: it proves the adapter seam is real, in ~40 lines.
 *
 * ── Severity mapping ────────────────────────────────────────────────────────
 * Statuspage `impact` is none / minor / major / critical:
 *     critical → critical
 *     major    → serious
 *     minor    → warning
 *     none     → info
 * (`maintenance` incidents come from a different endpoint and are not fetched.)
 */

import { makeAlert } from './types.js';
import { normalizeSeverity } from '../lib/severity.js';

export const id = 'githubstatus';
export const label = 'GitHub Status incidents';
export const description =
  'Unresolved incidents from githubstatus.com (Statuspage v2 API). Often empty. GitHub is usually up.';
export const hosts = ['https://www.githubstatus.com/*'];
export const settings = []; // nothing to configure

const IMPACT_MAP = {
  critical: 'critical',
  major:    'serious',
  minor:    'warning',
  none:     'info',
};

/**
 * @returns {Promise<import('./types.js').Alert[]>}
 */
export async function fetchAlerts() {
  const res = await fetch('https://www.githubstatus.com/api/v2/incidents/unresolved.json', {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`GitHub Status API returned HTTP ${res.status}`);
  return normalizeStatuspage(await res.json());
}

/**
 * Pure normaliser, unit-tested in tests/githubstatus.test.js.
 *
 * @param {{incidents?: Array<object>}} payload
 */
export function normalizeStatuspage(payload) {
  const incidents = Array.isArray(payload?.incidents) ? payload.incidents : [];
  return incidents.map(i => {
    // incident_updates is newest-first; [0].body is the latest human update
    // ("API Requests is experiencing degraded availability. We are continuing
    // to investigate."). Older updates are appended so the card tells the story.
    const updates = Array.isArray(i.incident_updates) ? i.incident_updates : [];
    const latest = updates[0]?.body || '';
    const history = updates.slice(1, 4).map(u => `• ${u.body}`).join('\n');
    const components = (i.components || []).map(c => c.name).filter(Boolean);
    const message = [
      latest,
      history,
      components.length ? `Affected: ${components.join(', ')}` : '',
      i.status ? `Status: ${i.status}` : '',
    ].filter(Boolean).join('\n\n');

    return makeAlert({
      id: `ghs:${i.id}`,
      title: i.name || 'GitHub incident',
      message,
      severity: normalizeSeverity(IMPACT_MAP[String(i.impact || '').toLowerCase()] || 'info'),
      // The endpoint is /unresolved, so everything here is active; the flag is
      // still derived from the data so pointing this adapter at
      // /incidents.json (history included) would keep working.
      active: !i.resolved_at && i.status !== 'resolved' && i.status !== 'postmortem',
      startTime: i.started_at || i.created_at || null,
      endTime: null, // incidents never publish an ETA
      url: i.shortlink || null,
    });
  });
}
