/**
 * popup.js — renders the toolbar popup.
 *
 * The popup owns no state. On every open it sends { action: 'getState' } to
 * the service worker, gets back the current alerts plus the dismissed/silenced
 * ID lists, and renders. User actions (dismiss, silence, refresh) are likewise
 * messages to the worker, which is the single writer of chrome.storage. That
 * keeps the popup trivially restartable — it is destroyed the moment it loses
 * focus — and means the worker's bookkeeping rules (lib/state.js) can't be
 * bypassed by a UI shortcut.
 */

import { SEVERITY_COLORS, SEVERITY_LABELS, sortBySeverity } from './lib/severity.js';
import { SEVERITY_ICONS } from './lib/icons.js';
import { paragraphsHtml, relativeTime, longTime } from './lib/format.js';
import { getSource } from './sources/index.js';

const $ = id => document.getElementById(id);
const els = {
  list: $('alertList'),
  none: $('noAlerts'),
  lastChecked: $('lastChecked'),
  sourceLabel: $('sourceLabel'),
  errorBanner: $('errorBanner'),
  errorMessage: $('errorMessage'),
  refreshBtn: $('refreshBtn'),
  settingsBtn: $('settingsBtn'),
  template: $('cardTemplate'),
};

document.addEventListener('DOMContentLoaded', () => {
  render();
  els.refreshBtn.addEventListener('click', onRefresh);
  els.settingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
});

/** Ask the worker for state and paint it. */
async function render() {
  try {
    const state = await chrome.runtime.sendMessage({ action: 'getState' });
    if (!state?.ok) throw new Error(state?.error || 'No response from background');
    const {
      currentAlerts = [], dismissedIds = [], silencedIds = [],
      lastChecked, lastError, sourceId,
    } = state;

    els.sourceLabel.textContent = getSource(sourceId).label;
    els.lastChecked.textContent = lastChecked
      ? `Checked ${relativeTime(lastChecked)}`
      : 'Not checked yet';
    els.lastChecked.title = lastChecked ? longTime(lastChecked) : '';

    if (lastError) {
      els.errorBanner.classList.remove('hidden');
      els.errorMessage.textContent = `Last check failed: ${lastError}`;
    } else {
      els.errorBanner.classList.add('hidden');
    }

    const dismissed = new Set(dismissedIds);
    const visible = sortBySeverity(currentAlerts.filter(a => !dismissed.has(a.id)));
    renderCards(visible, new Set(silencedIds));
  } catch (err) {
    console.error('[popup] render failed', err);
    els.errorBanner.classList.remove('hidden');
    els.errorMessage.textContent = `Error: ${err.message}`;
  }
}

/**
 * Cap on cards rendered. Nationwide NWS at Extreme+Severe is ~70 alerts on an
 * ordinary day; a 70-card popup is unusable and the badge already carries the
 * count. We render the worst MAX_CARDS (the list is sorted by severity first)
 * and say how many are hidden, pointing at the region setting.
 */
const MAX_CARDS = 25;

/** Build one card per alert from the <template> in popup.html. */
function renderCards(alerts, silenced) {
  els.list.replaceChildren();
  const empty = alerts.length === 0;
  els.none.classList.toggle('hidden', !empty);
  els.list.classList.toggle('hidden', empty);
  for (const alert of alerts.slice(0, MAX_CARDS)) {
    els.list.appendChild(buildCard(alert, silenced.has(alert.id)));
  }
  if (alerts.length > MAX_CARDS) {
    const more = document.createElement('div');
    more.className = 'more-note';
    more.textContent = `${alerts.length - MAX_CARDS} more not shown — narrow the region or raise the severity floor in Settings.`;
    els.list.appendChild(more);
  }
  // Now that cards are laid out, mark bodies that overflow their max-height so
  // CSS can draw the "there's more" fade only where it is true.
  for (const body of els.list.querySelectorAll('.alert-message')) {
    body.classList.toggle('is-clipped', body.scrollHeight > body.clientHeight + 1);
  }
}

function buildCard(alert, isSilenced) {
  const node = els.template.content.firstElementChild.cloneNode(true);
  const sev = alert.severity;
  const bg = SEVERITY_COLORS[sev];
  // Amber is the only light background; everything else takes white text.
  node.style.backgroundColor = bg;
  node.style.color = sev === 'warning' ? '#000' : '#fff';
  node.dataset.id = alert.id;
  node.dataset.severity = sev;

  node.querySelector('.severity-icon').innerHTML = SEVERITY_ICONS[sev];
  node.querySelector('.severity-label').textContent = SEVERITY_LABELS[sev];
  node.querySelector('.alert-title').textContent = alert.title;
  node.querySelector('.alert-message').innerHTML = paragraphsHtml(alert.message);

  const start = node.querySelector('.alert-start');
  const end = node.querySelector('.alert-end');
  if (alert.startTime) {
    // Scheduled items (maintenance windows) have a start in the future.
    const future = new Date(alert.startTime) > new Date();
    start.textContent = `${future ? 'Starts' : 'Started'} ${relativeTime(alert.startTime)}`;
    start.title = longTime(alert.startTime);
  } else start.remove();
  if (alert.endTime) {
    end.textContent = `Ends ${relativeTime(alert.endTime)}`;
    end.title = longTime(alert.endTime);
  } else end.remove();

  const link = node.querySelector('.alert-link');
  if (alert.url) { link.href = alert.url; link.hidden = false; }

  node.querySelector('.dismiss-btn').addEventListener('click', e => {
    e.stopPropagation();
    dismiss(alert.id, node);
  });

  const box = node.querySelector('.silence-checkbox input');
  box.checked = isSilenced;
  box.addEventListener('change', e =>
    chrome.runtime.sendMessage({ action: 'setSilenced', alertId: alert.id, silenced: e.target.checked }));

  return node;
}

/** Fade the card out, then tell the worker; re-render so the empty state can appear. */
async function dismiss(alertId, node) {
  node.style.opacity = '0';
  node.style.transform = 'translateX(16px)';
  await new Promise(r => setTimeout(r, 180));
  await chrome.runtime.sendMessage({ action: 'dismiss', alertId });
  render();
}

/** Spin the refresh icon while the worker polls, then re-render. */
async function onRefresh() {
  els.refreshBtn.classList.add('spinning');
  els.refreshBtn.disabled = true;
  try {
    await chrome.runtime.sendMessage({ action: 'checkNow' });
  } finally {
    els.refreshBtn.classList.remove('spinning');
    els.refreshBtn.disabled = false;
    render();
  }
}
