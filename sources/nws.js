/**
 * sources/nws.js — US National Weather Service active alerts.
 *
 * Endpoint:  https://api.weather.gov/alerts/active?area=<STATE>
 * Docs:      https://www.weather.gov/documentation/services-web-api
 * Auth:      none. NWS asks for an identifying User-Agent; a browser extension's
 *            fetch() sends the browser's UA automatically, which is accepted.
 * CORS:      open (Access-Control-Allow-Origin: *), and we also list the host in
 *            manifest.json host_permissions, so the call works from the service
 *            worker without any proxy.
 * Rate:      no published hard limit, but NWS asks clients to be polite. The
 *            options page enforces a 5-minute minimum poll interval; the default
 *            is 15.
 *
 * Why this is the default demo source: it is a real, live, public *alert* feed
 * with a native four-level severity field, so the extension's badge → toast →
 * modal escalation shows up exactly as designed, with no key and no backend.
 *
 * ── Severity mapping ────────────────────────────────────────────────────────
 * NWS `severity` is one of Extreme / Severe / Moderate / Minor / Unknown, which
 * lands on our scale as:
 *     Extreme  → critical   (tornado warning, flash flood emergency…)
 *     Severe   → serious    (extreme heat warning, winter storm warning…)
 *     Moderate → warning    (advisories, watches)
 *     Minor    → info       (special weather statements, etc.)
 *     Unknown  → info
 *
 * ── The duplicate problem (read this if alerts look repeated) ───────────────
 * NWS issues one alert PER FORECAST ZONE GROUP, so a single "Extreme Heat
 * Warning" over a state shows up as five or six features with different URNs,
 * identical event/severity/times, and different `areaDesc`. Rendering all six
 * as separate cards is noise, so we collapse on (event, severity, ends) and
 * concatenate the areas. The collapsed ID is derived from those same fields so
 * it stays stable poll-to-poll — which is what dismiss/silence and "is this
 * new?" all key on. If NWS extends the warning (new `ends`), it becomes a new
 * alert and re-notifies. That is the behaviour a user would expect.
 */

import { makeAlert } from './types.js';
import { normalizeSeverity } from '../lib/severity.js';

export const id = 'nws';
export const label = 'NWS weather alerts (US)';
export const description =
  'Live National Weather Service alerts for one state. No API key.';
export const hosts = ['https://api.weather.gov/*'];

/**
 * Per-source options rendered by options.js. Each entry becomes a form field
 * and is persisted under `sourceSettings.nws.<key>`. Adapters that need no
 * options can omit `settings` entirely.
 */
export const settings = [
  {
    key: 'area',
    label: 'State / territory',
    type: 'select',
    default: 'AZ',
    help: 'Two-letter USPS code. Alerts are fetched for this area only.',
    options: [
      'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
      'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
      'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
      'VT','VA','WA','WV','WI','WY','PR','GU','VI','AS','MP',
    ].map(code => ({ value: code, label: code })),
  },
];

const SEVERITY_MAP = {
  extreme:  'critical',
  severe:   'serious',
  moderate: 'warning',
  minor:    'info',
  unknown:  'info',
};

/**
 * Fetch and normalise. Exported separately from the network call so the unit
 * tests (tests/nws.test.js) can feed a captured payload straight into
 * `normalizeNws()` without mocking fetch.
 *
 * @param {{area?: string}} opts
 * @returns {Promise<import('./types.js').Alert[]>}
 */
export async function fetchAlerts(opts = {}) {
  const area = (opts.area || 'AZ').toUpperCase();
  const url = `https://api.weather.gov/alerts/active?area=${encodeURIComponent(area)}`;
  const res = await fetch(url, {
    headers: {
      // GeoJSON is the default; asking explicitly documents the dependency on
      // the `features[].properties` shape below.
      Accept: 'application/geo+json',
    },
  });
  if (!res.ok) throw new Error(`NWS API returned HTTP ${res.status}`);
  return normalizeNws(await res.json());
}

/**
 * Turn a raw NWS GeoJSON FeatureCollection into deduplicated Alert objects.
 * Pure — no I/O — so it is unit-testable against a fixture.
 *
 * @param {{features?: Array<{properties: object}>}} payload
 * @param {Date} [now]  injectable clock for tests
 */
export function normalizeNws(payload, now = new Date()) {
  const features = Array.isArray(payload?.features) ? payload.features : [];
  const groups = new Map();

  for (const f of features) {
    const p = f?.properties || {};

    // Only real, current alerts. `status` can also be Exercise/System/Test/
    // Draft; `messageType` Cancel means "disregard the referenced alert".
    if (p.status !== 'Actual' || p.messageType === 'Cancel') continue;

    // `ends` is when the hazard stops; `expires` is when THIS MESSAGE stops
    // being the latest word. Prefer ends, fall back to expires. Skip anything
    // already over — the /active endpoint mostly handles this, but not always
    // right at the boundary.
    const endIso = p.ends || p.expires || null;
    if (endIso && new Date(endIso) < now) continue;

    const severity = SEVERITY_MAP[String(p.severity || '').toLowerCase()] || 'info';
    const event = p.event || 'Weather alert';

    // Dedup key — see file header. `ends` is included so an extension of the
    // same warning surfaces as new.
    const key = `${event}|${severity}|${endIso ?? ''}`;

    if (!groups.has(key)) {
      groups.set(key, {
        // Deterministic ID from the same fields as the key. Kept short and
        // URL-safe because it travels through alert.html's query string.
        id: 'nws:' + slug(key),
        title: event,
        // Headline is the human one-liner ("...issued August 17 at 11:47AM MST
        // until August 21 at 8:00PM MST by NWS Phoenix AZ").
        headline: p.headline || '',
        // Description is the multi-paragraph "* WHAT... * WHERE... * WHEN..."
        // block. Instruction is the "what you should do" paragraph.
        description: (p.description || '').trim(),
        instruction: (p.instruction || '').trim(),
        areas: [],
        senders: new Set(),
        severity: normalizeSeverity(severity),
        startTime: p.onset || p.effective || p.sent || null,
        endTime: endIso,
        // The alert's own page on weather.gov, if we can build one. `p['@id']`
        // is the API URL for the alert; the public site mirrors it under
        // /alerts/{id-suffix}. Fall back to the API URL, which is still useful.
        url: p['@id'] || f.id || null,
      });
    }
    const g = groups.get(key);
    if (p.areaDesc) g.areas.push(p.areaDesc);
    if (p.senderName) g.senders.add(p.senderName);
  }

  return [...groups.values()].map(g => {
    // Areas from several zone groups are themselves ';'-separated lists —
    // flatten, trim, and dedupe so the card reads as one clean list.
    const areaList = [...new Set(
      g.areas.flatMap(a => a.split(';')).map(s => s.trim()).filter(Boolean)
    )];
    const areaLine = areaList.length
      ? `Areas: ${areaList.slice(0, 12).join('; ')}${areaList.length > 12 ? ` (+${areaList.length - 12} more)` : ''}`
      : '';
    const message = [g.headline, g.description, g.instruction, areaLine]
      .filter(Boolean)
      .join('\n\n');
    return makeAlert({
      id: g.id,
      title: g.title,
      message,
      severity: g.severity,
      active: true,
      startTime: g.startTime,
      endTime: g.endTime,
      url: g.url,
    });
  });
}

/** Lower-case, dash-separated, ASCII-only ID fragment. */
function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
