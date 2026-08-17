/**
 * tests/background.test.js — the service worker, driven through the chrome
 * stub. Uses the mock source so no network is involved, and asserts on the
 * observable outputs: storage contents, badge calls, notifications, modal
 * windows. Each test re-imports background.js fresh (vi.resetModules) because
 * the worker registers its listeners at import time.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installChromeStub, sendMessage } from './chrome-stub.js';

let chrome;

async function bootWorker(seed = {}) {
  vi.resetModules();
  chrome = installChromeStub();
  await chrome.storage.local.set({ sourceId: 'mock', ...seed });
  await import('../background.js');
  return chrome;
}

async function install() {
  await chrome.runtime.onInstalled.emit({ reason: 'install' });
}

describe('install + first poll', () => {
  beforeEach(async () => { await bootWorker(); });

  it('seeds defaults, schedules the alarm, and polls once', async () => {
    await install();
    const s = await chrome.storage.local.get(null);
    expect(s.pollIntervalMinutes).toBe(15);
    expect(s.enableModal).toBe(true);
    expect(s.sourceId).toBe('mock');            // our seed survived (not clobbered)
    expect(chrome._calls.alarms.at(-1)).toMatchObject({ periodInMinutes: 15 });
    expect(s.lastChecked).toBeTruthy();
    expect(s.lastError).toBeNull();
    // 6 mock alerts, 1 inactive → 5 stored
    expect(s.currentAlerts).toHaveLength(5);
    expect(s.lastIds).toHaveLength(5);
  });

  it('badge shows count and colour of the worst alert', async () => {
    await install();
    expect(chrome._calls.badgeText.at(-1)).toBe('5');
    expect(chrome._calls.badgeColor.at(-1)).toBe('#000000'); // critical present
  });

  it('notifies for every new alert, opens a modal only for critical/serious', async () => {
    await install();
    expect(chrome._calls.notifications).toHaveLength(5);
    const critical = chrome._calls.notifications.find(n => n.id === 'alert:mock-critical-001');
    expect(critical.requireInteraction).toBe(true);
    expect(critical.priority).toBe(2);
    expect(critical.title).toMatch(/^\[CRITICAL\]/);
    expect(critical.iconUrl).toBe('icons/icon128.png');
    const info = chrome._calls.notifications.find(n => n.id === 'alert:mock-info-001');
    expect(info.requireInteraction).toBe(false);

    expect(chrome._calls.windows).toHaveLength(2);
    expect(chrome._calls.windows.map(w => w.url).sort()).toEqual([
      'chrome-extension://test/alert.html?id=mock-critical-001',
      'chrome-extension://test/alert.html?id=mock-serious-001',
    ]);
    expect(chrome._calls.windows[0]).toMatchObject({ type: 'popup', focused: true });
  });

  it('second poll with no changes is silent', async () => {
    await install();
    const before = chrome._calls.notifications.length;
    await chrome.alarms.onAlarm.emit({ name: 'alert-notifier:poll' });
    expect(chrome._calls.notifications).toHaveLength(before);
    expect(chrome._calls.windows).toHaveLength(2);
  });

  it('ignores alarms that are not ours', async () => {
    await install();
    const before = chrome._calls.notifications.length;
    await chrome.alarms.onAlarm.emit({ name: 'someone-elses' });
    expect(chrome._calls.notifications).toHaveLength(before);
  });
});

describe('settings that shape the poll', () => {
  it('minSeverity drops lower alerts before they are stored', async () => {
    await bootWorker({ minSeverity: 'serious' });
    await install();
    const { currentAlerts } = await chrome.storage.local.get(['currentAlerts']);
    expect(currentAlerts.map(a => a.severity).sort()).toEqual(['critical', 'serious']);
    expect(chrome._calls.badgeText.at(-1)).toBe('2');
  });

  it('enableModal:false suppresses windows but not toasts', async () => {
    await bootWorker({ enableModal: false });
    await install();
    expect(chrome._calls.windows).toHaveLength(0);
    expect(chrome._calls.notifications).toHaveLength(5);
  });

  it('enableNotifications:false suppresses toasts but not modals', async () => {
    await bootWorker({ enableNotifications: false });
    await install();
    expect(chrome._calls.notifications).toHaveLength(0);
    expect(chrome._calls.windows).toHaveLength(2);
  });

  it('a stored interval is honoured by the alarm', async () => {
    await bootWorker({ pollIntervalMinutes: 30 });
    await install();
    expect(chrome._calls.alarms.at(-1)).toMatchObject({ periodInMinutes: 30, delayInMinutes: 30 });
  });

  it('an out-of-range interval is clamped', async () => {
    await bootWorker({ pollIntervalMinutes: 1 });
    await install();
    expect(chrome._calls.alarms.at(-1).periodInMinutes).toBe(5);
  });
});

describe('user actions via runtime messages', () => {
  beforeEach(async () => { await bootWorker(); await install(); });

  it('getState returns what the popup needs', async () => {
    const res = await sendMessage(chrome, { action: 'getState' });
    expect(res.ok).toBe(true);
    expect(res.currentAlerts).toHaveLength(5);
    expect(res.sourceId).toBe('mock');
    expect(res.dismissedIds).toEqual([]);
  });

  it('dismiss hides the alert, updates the badge, clears its toast, and does not re-fire', async () => {
    await sendMessage(chrome, { action: 'dismiss', alertId: 'mock-critical-001' });
    const { dismissedIds } = await chrome.storage.local.get(['dismissedIds']);
    expect(dismissedIds).toEqual(['mock-critical-001']);
    expect(chrome._calls.badgeText.at(-1)).toBe('4');
    expect(chrome._calls.badgeColor.at(-1)).toBe('#DC3545'); // serious is now the worst
    expect(chrome._calls.cleared).toContain('alert:mock-critical-001');

    const n = chrome._calls.notifications.length;
    await chrome.alarms.onAlarm.emit({ name: 'alert-notifier:poll' });
    expect(chrome._calls.notifications).toHaveLength(n);
  });

  it('setSilenced toggles the silenced list', async () => {
    await sendMessage(chrome, { action: 'setSilenced', alertId: 'mock-serious-001', silenced: true });
    expect((await chrome.storage.local.get(['silencedIds'])).silencedIds).toEqual(['mock-serious-001']);
    await sendMessage(chrome, { action: 'setSilenced', alertId: 'mock-serious-001', silenced: false });
    expect((await chrome.storage.local.get(['silencedIds'])).silencedIds).toEqual([]);
  });

  it('resetAndCheck re-fires everything except it respects nothing (that is the point)', async () => {
    await sendMessage(chrome, { action: 'dismiss', alertId: 'mock-critical-001' });
    await sendMessage(chrome, { action: 'setSilenced', alertId: 'mock-serious-001', silenced: true });
    const n = chrome._calls.notifications.length;
    const w = chrome._calls.windows.length;
    await sendMessage(chrome, { action: 'resetAndCheck' });
    expect(chrome._calls.notifications.length - n).toBe(5);
    expect(chrome._calls.windows.length - w).toBe(2);
  });

  it('a silenced alert is not re-notified when it re-appears as new', async () => {
    await sendMessage(chrome, { action: 'setSilenced', alertId: 'mock-serious-001', silenced: true });
    // Forget the snapshot only (simulates the alert vanishing then returning)
    await chrome.storage.local.set({ lastIds: [] });
    const n = chrome._calls.notifications.length;
    const w = chrome._calls.windows.length;
    await sendMessage(chrome, { action: 'checkNow' });
    expect(chrome._calls.notifications.length - n).toBe(4); // 5 minus the silenced one
    expect(chrome._calls.windows.length - w).toBe(1);        // only critical opens a modal
  });

  it('unknown actions are ignored (returns false, no response)', async () => {
    let responded = false;
    for (const fn of chrome.runtime.onMessage.listeners) {
      const keepOpen = fn({ action: 'nonsense' }, {}, () => { responded = true; });
      expect(keepOpen).toBe(false);
    }
    expect(responded).toBe(false);
  });
});

describe('failure handling', () => {
  it('a source that throws records lastError and keeps the previous alerts', async () => {
    await bootWorker();
    await install();
    // Now point at a source whose fetch will fail: nws with a stubbed fetch.
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 503 }));
    await chrome.storage.local.set({ sourceId: 'nws' });
    await sendMessage(chrome, { action: 'checkNow' });
    const s = await chrome.storage.local.get(['lastError', 'currentAlerts']);
    expect(s.lastError).toMatch(/503/);
    expect(s.currentAlerts).toHaveLength(5); // untouched
  });

  it('a successful poll clears lastError', async () => {
    await bootWorker({ lastError: 'stale' });
    await install();
    expect((await chrome.storage.local.get(['lastError'])).lastError).toBeNull();
  });
});

describe('notification click', () => {
  it('opens the alert window for our notifications and ignores others', async () => {
    await bootWorker();
    await install();
    const w = chrome._calls.windows.length;
    await chrome.notifications.onClicked.emit('alert:mock-info-001');
    expect(chrome._calls.windows).toHaveLength(w + 1);
    expect(chrome._calls.windows.at(-1).url).toContain('id=mock-info-001');
    expect(chrome._calls.cleared).toContain('alert:mock-info-001');
    await chrome.notifications.onClicked.emit('other-extension-thing');
    expect(chrome._calls.windows).toHaveLength(w + 1);
  });
});

describe('storage change reactions', () => {
  it('interval change reschedules; unrelated keys do not', async () => {
    await bootWorker();
    await install();
    const before = chrome._calls.alarms.length;
    await chrome.storage.onChanged.emit({ currentAlerts: {} }, 'local');
    expect(chrome._calls.alarms).toHaveLength(before);
    await chrome.storage.local.set({ pollIntervalMinutes: 60 });
    await chrome.storage.onChanged.emit({ pollIntervalMinutes: { newValue: 60 } }, 'local');
    // The listener is fire-and-forget (as in the real browser); let it settle.
    await new Promise(r => setTimeout(r, 0));
    expect(chrome._calls.alarms.at(-1).periodInMinutes).toBe(60);
  });
});
