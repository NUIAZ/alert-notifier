/**
 * background.js: the Manifest V3 service worker. Everything that must happen
 * while no extension page is open lives here: the poll timer, the fetch, the
 * badge, OS notifications, and opening the modal window.
 *
 * ── How MV3 service workers behave (and why the code is shaped like this) ───
 * The worker is NOT long-lived. The browser starts it for an event, gives it
 * ~30 s of idle time, and kills it. Consequences that shape every function
 * below:
 *
 *   • No setInterval/setTimeout for polling: the worker would be dead before
 *     the timer fired. chrome.alarms is the sanctioned way: the browser owns the
 *     schedule and wakes the worker for each tick.
 *   • No module-level state that matters. `let lastAlerts = []` at the top of
 *     this file resets every time the worker restarts, so ALL state goes through
 *     chrome.storage.local (see lib/settings.js for the key map).
 *   • Event listeners must be registered synchronously at the top level, not
 *     inside an async function or after an await; otherwise the browser has no
 *     listener to wake the worker for. That's why they're all at the bottom of
 *     this file, unconditionally.
 *   • Notification click → chrome.action.openPopup() is NOT reliable here (it
 *     needs a user gesture in the extension's own context and throws in Chrome).
 *     We open the alert window for that alert instead, which is allowed.
 *
 * ── The poll, in one paragraph ──────────────────────────────────────────────
 * Every `pollIntervalMinutes` (alarm) or on demand (message from popup/options)
 * `checkForAlerts()` loads settings, asks the selected source adapter for
 * alerts, keeps the active ones at/above the minimum severity, works out which
 * are visible (not dismissed) and which are new (not in the previous poll's ID
 * snapshot, not silenced), updates the badge, fires a notification for each new
 * one (plus a modal window if it is critical/serious and the user has modals
 * on), then stores the new snapshot and prunes stale dismiss/silence IDs. All
 * of the "which/new/prune" logic is pure and lives in lib/state.js.
 */

import { getSource } from './sources/index.js';
import { loadSettings, defaultSettings } from './lib/settings.js';
import {
  activeOnly, visibleAlerts, newAlerts, pruneIds, addId, removeId,
} from './lib/state.js';
import {
  SEVERITY_COLORS, SEVERITY_LABELS, INTERRUPTIVE_SEVERITIES,
  highestSeverity, normalizeSeverity, atLeast,
} from './lib/severity.js';

const ALARM_NAME = 'alert-notifier:poll';
const NOTIFICATION_PREFIX = 'alert:';

/* ────────────────────────────────────────────────────────────────────────────
 * Scheduling
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * (Re)create the polling alarm from the saved interval. Idempotent; safe to
 * call on install, on startup, and whenever the interval setting changes.
 * `delayInMinutes` is set equal to the period so a settings change doesn't
 * cause an immediate extra fetch (checkNow exists for that).
 */
async function setupAlarm() {
  const { pollIntervalMinutes } = await loadSettings();
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: pollIntervalMinutes,
    periodInMinutes: pollIntervalMinutes,
  });
  console.log(`[alert-notifier] polling every ${pollIntervalMinutes} min`);
}

/* ────────────────────────────────────────────────────────────────────────────
 * The poll
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * One full poll cycle. Never throws: any failure (network, bad JSON, adapter
 * bug) is caught, recorded as `lastError` for the popup to display, and the
 * previously stored alerts are left in place so the badge doesn't flicker to
 * empty on a transient error.
 */
async function checkForAlerts() {
  const startedAt = new Date().toISOString();
  try {
    const settings = await loadSettings();
    const source = getSource(settings.sourceId);
    const sourceOpts = settings.sourceSettings?.[source.id] || {};

    console.log(`[alert-notifier] polling ${source.id}`, sourceOpts);
    const fetched = await source.fetchAlerts(sourceOpts);

    // 1. Keep active alerts at or above the configured minimum severity.
    const active = activeOnly(fetched)
      .map(a => ({ ...a, severity: normalizeSeverity(a.severity) }))
      .filter(a => atLeast(a.severity, settings.minSeverity));

    // 2. Read the bookkeeping from the previous poll.
    const runtime = await chrome.storage.local.get(['dismissedIds', 'silencedIds', 'lastIds']);
    const dismissedIds = runtime.dismissedIds || [];
    const silencedIds = runtime.silencedIds || [];
    const lastIds = runtime.lastIds || [];

    // 3. Decide what to show and what to shout about.
    const visible = visibleAlerts(active, dismissedIds);
    const fresh = newAlerts(visible, lastIds, silencedIds);

    // 4. Persist the new snapshot FIRST, so a crash mid-notification doesn't
    //    cause the same alerts to re-notify on the next tick.
    await chrome.storage.local.set({
      currentAlerts: active,
      lastIds: active.map(a => a.id),
      lastChecked: startedAt,
      lastError: null,
      dismissedIds: pruneIds(dismissedIds, active),
      silencedIds: pruneIds(silencedIds, active),
    });

    // 5. Badge reflects what the user would see if they opened the popup.
    updateBadge(visible);

    // 6. Interrupt for the new ones.
    for (const alert of fresh) {
      if (settings.enableNotifications) showNotification(alert);
      if (settings.enableModal && INTERRUPTIVE_SEVERITIES.has(alert.severity)) {
        openAlertWindow(alert);
      }
    }
    console.log(`[alert-notifier] ${active.length} active, ${visible.length} visible, ${fresh.length} new`);
  } catch (err) {
    console.error('[alert-notifier] poll failed:', err);
    await chrome.storage.local.set({
      lastChecked: startedAt,
      lastError: err?.message || String(err),
    });
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Badge, notifications, modal
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Badge = count of visible alerts, coloured by the worst one. Empty text clears
 * the badge entirely (a "0" badge reads as an error to most people).
 * @param {Array} visible
 */
function updateBadge(visible) {
  if (!visible.length) {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({ title: 'Alert Notifier: all clear' });
    return;
  }
  const worst = highestSeverity(visible);
  chrome.action.setBadgeText({ text: String(visible.length) });
  chrome.action.setBadgeBackgroundColor({ color: SEVERITY_COLORS[worst] });
  // Amber has poor contrast with white text; make the digits dark on it.
  // setBadgeTextColor is Chrome 110+/Edge 110+; guard for older builds.
  if (chrome.action.setBadgeTextColor) {
    chrome.action.setBadgeTextColor({ color: worst === 'warning' ? '#000000' : '#FFFFFF' });
  }
  chrome.action.setTitle({
    title: `Alert Notifier: ${visible.length} active (${SEVERITY_LABELS[worst].toLowerCase()})`,
  });
}

/**
 * OS-level notification. `requireInteraction` keeps critical/serious toasts on
 * screen until clicked or closed; lower severities auto-hide. The icon is the
 * 128px logo (same mark as the toolbar) so the toast is recognisable at a
 * glance among other apps' notifications. Body text is clipped. Windows/macOS truncate hard anyway, and the full text is one click
 * away in the popup. Notification IDs are namespaced so onClicked can tell ours
 * from anything else and map back to the alert.
 */
function showNotification(alert) {
  const body = (alert.message || '').replace(/\s+/g, ' ').trim();
  chrome.notifications.create(NOTIFICATION_PREFIX + alert.id, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `[${SEVERITY_LABELS[alert.severity]}] ${alert.title}`,
    message: body.length > 180 ? body.slice(0, 177) + '…' : body || 'Click to view details',
    priority: alert.severity === 'critical' ? 2 : 1,
    requireInteraction: INTERRUPTIVE_SEVERITIES.has(alert.severity),
  });
}

/**
 * The modal: a small always-on-top-ish popup window (type 'popup' has no tabs
 * or address bar). It gets the alert by ID and reads the rest from storage;
 * passing the whole alert through the URL was the original design, but NWS
 * bodies can be several KB and some platforms cap URL length. The window is
 * sized for a phone-shaped card and centred by the browser.
 */
function openAlertWindow(alert) {
  const url = chrome.runtime.getURL(`alert.html?id=${encodeURIComponent(alert.id)}`);
  chrome.windows.create({ url, type: 'popup', width: 520, height: 600, focused: true });
}

/* ────────────────────────────────────────────────────────────────────────────
 * User actions (from popup.js / alert.js / options.js via runtime messages)
 * ──────────────────────────────────────────────────────────────────────────── */

async function dismissAlert(alertId) {
  const { dismissedIds = [], currentAlerts = [] } = await chrome.storage.local.get(['dismissedIds', 'currentAlerts']);
  const next = addId(dismissedIds, alertId);
  await chrome.storage.local.set({ dismissedIds: next });
  updateBadge(visibleAlerts(currentAlerts, next));
  // Also take down its toast if it's still showing.
  chrome.notifications.clear(NOTIFICATION_PREFIX + alertId);
}

async function setSilenced(alertId, silenced) {
  const { silencedIds = [] } = await chrome.storage.local.get(['silencedIds']);
  await chrome.storage.local.set({
    silencedIds: silenced ? addId(silencedIds, alertId) : removeId(silencedIds, alertId),
  });
}

/**
 * "Test notifications" on the options page: forget the snapshot and the
 * dismiss/silence lists, then poll; so every currently-active alert counts as
 * new and fires again. Handy for demos and for checking your OS notification
 * settings actually let toasts through.
 */
async function resetAndCheck() {
  await chrome.storage.local.set({ lastIds: [], dismissedIds: [], silencedIds: [] });
  await checkForAlerts();
}

/* ────────────────────────────────────────────────────────────────────────────
 * Event wiring: top level, synchronous, unconditional (see file header)
 * ──────────────────────────────────────────────────────────────────────────── */

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  console.log(`[alert-notifier] onInstalled (${reason})`);
  // Seed defaults only for keys that don't exist yet, so an update never
  // clobbers a user's choices. loadSettings() back-fills anything newer.
  const existing = await chrome.storage.local.get(null);
  const seed = {};
  for (const [k, v] of Object.entries(defaultSettings())) if (existing[k] === undefined) seed[k] = v;
  for (const k of ['dismissedIds', 'silencedIds', 'lastIds']) if (existing[k] === undefined) seed[k] = [];
  if (Object.keys(seed).length) await chrome.storage.local.set(seed);
  await setupAlarm();
  await checkForAlerts();
});

// Browser start (the alarm survives restarts, but a poll on launch is nicer
// than waiting up to a full interval for the first badge).
chrome.runtime.onStartup.addListener(async () => {
  await setupAlarm();
  await checkForAlerts();
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME) checkForAlerts();
});

// Interval or source changed in Options → reschedule / re-poll. Comparing old
// and new avoids a poll storm when unrelated keys (currentAlerts!) change.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.pollIntervalMinutes) setupAlarm();
  if (changes.sourceId || changes.sourceSettings || changes.minSeverity) checkForAlerts();
});

// Clicking a toast opens that alert's window (see header on why not openPopup).
chrome.notifications.onClicked.addListener(async notificationId => {
  if (!notificationId.startsWith(NOTIFICATION_PREFIX)) return;
  const id = notificationId.slice(NOTIFICATION_PREFIX.length);
  const { currentAlerts = [] } = await chrome.storage.local.get(['currentAlerts']);
  const alert = currentAlerts.find(a => a.id === id);
  if (alert) openAlertWindow(alert);
  chrome.notifications.clear(notificationId);
});

/**
 * Message bus for the extension pages. Each handler returns a Promise; we
 * resolve it into sendResponse and return `true` to keep the channel open for
 * the async reply: forgetting that `return true` is the classic MV3 bug where
 * the popup sees `undefined`.
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handlers = {
    checkNow:      () => checkForAlerts(),
    resetAndCheck: () => resetAndCheck(),
    dismiss:       () => dismissAlert(msg.alertId),
    setSilenced:   () => setSilenced(msg.alertId, !!msg.silenced),
    getState:      () => chrome.storage.local.get([
      'currentAlerts', 'dismissedIds', 'silencedIds', 'lastChecked', 'lastError', 'sourceId',
    ]),
  };
  const handler = handlers[msg?.action];
  if (!handler) return false;
  handler()
    .then(result => sendResponse({ ok: true, ...(result || {}) }))
    .catch(err => sendResponse({ ok: false, error: err?.message || String(err) }));
  return true;
});
