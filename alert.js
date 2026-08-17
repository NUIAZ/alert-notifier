/**
 * alert.js — fills the modal window (alert.html) for one alert.
 *
 * Flow: background.js opened us with ?id=<alertId>. We read `currentAlerts`
 * from storage, find that ID, and render. If it isn't there any more (the
 * alert cleared between the poll and the window opening — rare, but the poll
 * is async) we show a friendly "already resolved" message rather than a blank.
 *
 * "Acknowledge" closes the window. If "Don't show this alert again" is ticked
 * we also tell the worker to silence the ID, which stops future toasts and
 * modals for it while still leaving it visible in the popup list.
 */

import { SEVERITY_LABELS } from './lib/severity.js';
import { SEVERITY_ICONS } from './lib/icons.js';
import { paragraphsHtml, longTime, relativeTime } from './lib/format.js';

const params = new URLSearchParams(location.search);
const alertId = params.get('id');

const $ = id => document.getElementById(id);
const els = {
  body: document.body,
  icon: $('alertIcon'),
  severity: $('severityLabel'),
  title: $('alertTitle'),
  message: $('alertMessage'),
  start: $('alertStart'),
  end: $('alertEnd'),
  link: $('alertLink'),
  silence: $('silenceCheckbox'),
  ack: $('ackBtn'),
};

async function init() {
  const { currentAlerts = [] } = await chrome.storage.local.get(['currentAlerts']);
  const alert = currentAlerts.find(a => a.id === alertId);

  if (!alert) {
    els.body.className = 'modal severity-info';
    els.icon.innerHTML = SEVERITY_ICONS.info;
    els.severity.textContent = 'RESOLVED';
    els.title.textContent = 'This alert is no longer active';
    els.message.textContent = 'It cleared before this window opened. Nothing to do.';
    els.silence.closest('label').hidden = true;
    return;
  }

  // The body class drives the whole colour scheme via styles.css
  // (.severity-critical, .severity-serious, …).
  els.body.className = `modal severity-${alert.severity}`;
  els.icon.innerHTML = SEVERITY_ICONS[alert.severity];
  els.severity.textContent = SEVERITY_LABELS[alert.severity];
  els.title.textContent = alert.title;
  els.message.innerHTML = paragraphsHtml(alert.message) || '<p>No further details.</p>';

  if (alert.startTime) {
    const future = new Date(alert.startTime) > new Date();
    els.start.textContent = `${future ? 'Starts' : 'Started'} ${relativeTime(alert.startTime)} (${longTime(alert.startTime)})`;
  } else els.start.remove();
  if (alert.endTime) {
    els.end.textContent = `Expected to end ${relativeTime(alert.endTime)} (${longTime(alert.endTime)})`;
  } else els.end.remove();

  if (alert.url) { els.link.href = alert.url; els.link.hidden = false; }

  // Reflect the current silenced state so re-opening from the popup is honest.
  const { silencedIds = [] } = await chrome.storage.local.get(['silencedIds']);
  els.silence.checked = silencedIds.includes(alert.id);
}

async function acknowledge() {
  if (alertId && els.silence.checked) {
    await chrome.runtime.sendMessage({ action: 'setSilenced', alertId, silenced: true });
  }
  window.close();
}

els.ack.addEventListener('click', acknowledge);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') window.close();
  // Enter anywhere acknowledges — but not while focus is on the checkbox,
  // where Space/Enter should toggle it, and not with modifiers held.
  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && document.activeElement !== els.silence) {
    acknowledge();
  }
});

init().catch(err => {
  console.error('[alert] init failed', err);
  els.title.textContent = 'Could not load alert';
  els.message.textContent = err.message;
});
