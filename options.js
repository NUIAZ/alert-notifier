/**
 * options.js — settings page logic.
 *
 * Design: autosave on change, no Save button. Each control writes straight to
 * chrome.storage.local via lib/settings.js; background.js listens for the keys
 * it cares about (interval → reschedule alarm, source/minSeverity → re-poll).
 * The per-source section is generated from each adapter's `settings` array so
 * a new feed gets a form for free.
 */

import { SOURCES, getSource, defaultSettingsFor } from './sources/index.js';
import {
  loadSettings, saveSettings, defaultSettings, clampPoll, MIN_POLL_MINUTES, MAX_POLL_MINUTES,
} from './lib/settings.js';

const $ = id => document.getElementById(id);
const els = {
  form: $('settingsForm'),
  sourceId: $('sourceId'),
  sourceDescription: $('sourceDescription'),
  sourceSettings: $('sourceSettings'),
  poll: $('pollIntervalMinutes'),
  minSeverity: $('minSeverity'),
  notifications: $('enableNotifications'),
  modal: $('enableModal'),
  testBtn: $('testBtn'),
  checkBtn: $('checkBtn'),
  resetBtn: $('resetBtn'),
  status: $('statusLine'),
};

/** In-memory copy of settings, kept in sync with storage as the user edits. */
let settings;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Populate the feed dropdown from the registry.
  for (const s of SOURCES) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.label;
    els.sourceId.appendChild(opt);
  }
  els.poll.min = MIN_POLL_MINUTES;
  els.poll.max = MAX_POLL_MINUTES;

  settings = await loadSettings();
  paint();

  els.sourceId.addEventListener('change', async () => {
    settings.sourceId = els.sourceId.value;
    renderSourceSettings();
    await persist({ sourceId: settings.sourceId });
    flash(`Feed set to “${getSource(settings.sourceId).label}”. Checking…`);
  });
  els.poll.addEventListener('change', async () => {
    settings.pollIntervalMinutes = clampPoll(els.poll.value);
    els.poll.value = settings.pollIntervalMinutes;
    await persist({ pollIntervalMinutes: settings.pollIntervalMinutes });
    flash(`Will check every ${settings.pollIntervalMinutes} minutes.`);
  });
  els.minSeverity.addEventListener('change', async () => {
    settings.minSeverity = els.minSeverity.value;
    await persist({ minSeverity: settings.minSeverity });
    flash('Minimum severity saved.');
  });
  els.notifications.addEventListener('change', async () => {
    settings.enableNotifications = els.notifications.checked;
    await persist({ enableNotifications: settings.enableNotifications });
    flash('Saved.');
  });
  els.modal.addEventListener('change', async () => {
    settings.enableModal = els.modal.checked;
    await persist({ enableModal: settings.enableModal });
    flash('Saved.');
  });

  els.testBtn.addEventListener('click', () => runAction('resetAndCheck', 'Re-firing every active alert…', 'Done — check your notifications.'));
  els.checkBtn.addEventListener('click', () => runAction('checkNow', 'Checking…', 'Checked.'));
  els.resetBtn.addEventListener('click', async () => {
    // A confirm() here would block automation and is easy to misclick through;
    // instead a two-step: first click arms, second within 4 s resets.
    if (els.resetBtn.dataset.armed) {
      settings = defaultSettings();
      await persist(settings);
      paint();
      delete els.resetBtn.dataset.armed;
      els.resetBtn.textContent = 'Reset to defaults';
      flash('Settings reset to defaults.');
    } else {
      els.resetBtn.dataset.armed = '1';
      els.resetBtn.textContent = 'Click again to confirm';
      setTimeout(() => { delete els.resetBtn.dataset.armed; els.resetBtn.textContent = 'Reset to defaults'; }, 4000);
    }
  });
}

/** Push settings → controls. */
function paint() {
  els.sourceId.value = settings.sourceId;
  els.poll.value = settings.pollIntervalMinutes;
  els.minSeverity.value = settings.minSeverity;
  els.notifications.checked = settings.enableNotifications;
  els.modal.checked = settings.enableModal;
  renderSourceSettings();
}

/**
 * Build the per-source form from the adapter's `settings` declarations. Each
 * declaration is { key, label, type: 'select'|'text'|'number', default, help,
 * options? }. Values live under settings.sourceSettings[sourceId][key].
 */
function renderSourceSettings() {
  const source = getSource(settings.sourceId);
  els.sourceDescription.textContent = source.description || '';
  els.sourceSettings.replaceChildren();

  const values = { ...defaultSettingsFor(source), ...(settings.sourceSettings[source.id] || {}) };
  settings.sourceSettings[source.id] = values;

  for (const decl of source.settings || []) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const label = document.createElement('label');
    label.htmlFor = `src-${source.id}-${decl.key}`;
    label.textContent = decl.label;
    wrap.appendChild(label);

    let control;
    if (decl.type === 'select') {
      control = document.createElement('select');
      for (const o of decl.options || []) {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label ?? o.value;
        control.appendChild(opt);
      }
    } else {
      control = document.createElement('input');
      control.type = decl.type === 'number' ? 'number' : 'text';
    }
    control.id = label.htmlFor;
    control.value = values[decl.key] ?? decl.default ?? '';
    control.addEventListener('change', async () => {
      values[decl.key] = control.value;
      settings.sourceSettings[source.id] = values;
      await persist({ sourceSettings: settings.sourceSettings });
      flash(`${decl.label} saved. Checking…`);
    });
    wrap.appendChild(control);

    if (decl.help) {
      const help = document.createElement('p');
      help.className = 'help';
      help.textContent = decl.help;
      wrap.appendChild(help);
    }
    els.sourceSettings.appendChild(wrap);
  }
}

async function persist(partial) {
  await saveSettings(partial);
}

/** Send a background action and show progress in the status line. */
async function runAction(action, busyText, doneText) {
  flash(busyText, true);
  const res = await chrome.runtime.sendMessage({ action });
  flash(res?.ok ? doneText : `Failed: ${res?.error || 'unknown error'}`);
}

let flashTimer;
function flash(text, sticky = false) {
  els.status.textContent = text;
  clearTimeout(flashTimer);
  if (!sticky) flashTimer = setTimeout(() => { els.status.textContent = ''; }, 3500);
}
