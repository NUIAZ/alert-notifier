/**
 * lib/settings.js: the one place that knows the shape of what we keep in
 * chrome.storage.local, with defaults and a loader that back-fills missing
 * keys. Popup, options page and service worker all import from here so a
 * renamed key can't silently desynchronise them.
 *
 * Two kinds of state live in storage.local, and it helps to keep them apart
 * in your head:
 *
 *   SETTINGS (user-editable, options.html)         RUNTIME (owned by background.js)
 *   ─────────────────────────────────────         ─────────────────────────────────
 *   sourceId          which adapter               currentAlerts   last fetched active set
 *   sourceSettings    { [sourceId]: {...} }       lastIds         IDs from previous poll
 *   pollIntervalMinutes                            dismissedIds    see lib/state.js
 *   enableModal       modal window for critical/   silencedIds     see lib/state.js
 *                     serious?                     lastChecked     ISO time of last poll
 *   enableNotifications  OS toasts at all?         lastError       message, or absent
 *   minSeverity       ignore anything below this
 *
 * storage.local (not storage.sync) on purpose: sync has a 100 KB quota and
 * per-minute write limits, and alert bodies from NWS can be a few KB each.
 * Settings are small enough for sync, but splitting them across two areas
 * isn't worth the extra code path for a demo.
 */

import { DEFAULT_SOURCE_ID, SOURCES, defaultSettingsFor } from '../sources/index.js';

export const SETTINGS_KEYS = [
  'sourceId',
  'sourceSettings',
  'pollIntervalMinutes',
  'enableModal',
  'enableNotifications',
  'minSeverity',
];

export const RUNTIME_KEYS = [
  'currentAlerts',
  'lastIds',
  'dismissedIds',
  'silencedIds',
  'lastChecked',
  'lastError',
];

/** Lower bound on the poll interval. Be polite to public APIs. */
export const MIN_POLL_MINUTES = 5;
export const MAX_POLL_MINUTES = 24 * 60;

/** Fresh-install defaults. */
export function defaultSettings() {
  const sourceSettings = {};
  for (const s of SOURCES) sourceSettings[s.id] = defaultSettingsFor(s);
  return {
    sourceId: DEFAULT_SOURCE_ID,
    sourceSettings,
    pollIntervalMinutes: 15,
    enableModal: true,
    enableNotifications: true,
    minSeverity: 'info',
  };
}

/**
 * Load settings, layering whatever is stored over the defaults, so adding a
 * new setting in a later version, or a new adapter with its own settings, just
 * works for existing installs without a migration step.
 */
export async function loadSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEYS);
  const defaults = defaultSettings();
  const merged = { ...defaults, ...stripUndefined(stored) };
  // Deep-merge the per-source map one level down.
  merged.sourceSettings = { ...defaults.sourceSettings };
  for (const [sid, vals] of Object.entries(stored.sourceSettings || {})) {
    merged.sourceSettings[sid] = { ...(defaults.sourceSettings[sid] || {}), ...vals };
  }
  merged.pollIntervalMinutes = clampPoll(merged.pollIntervalMinutes);
  return merged;
}

/** Persist a partial settings object. */
export async function saveSettings(partial) {
  await chrome.storage.local.set(partial);
}

/** Keep the interval inside [MIN, MAX] and numeric. */
export function clampPoll(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 15;
  return Math.min(MAX_POLL_MINUTES, Math.max(MIN_POLL_MINUTES, Math.round(v)));
}

function stripUndefined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) if (v !== undefined) out[k] = v;
  return out;
}
