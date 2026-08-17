/**
 * tests/chrome-stub.js: a minimal in-memory `chrome.*` for testing
 * background.js end to end without a browser.
 *
 * Only the surface background.js touches is implemented: storage.local,
 * alarms, notifications, action (badge), windows.create, runtime events. Each
 * event exposes `.emit(...)` so a test can pretend the browser fired it, and
 * `calls` records every notification / window / badge call for assertions.
 *
 * Install with `installChromeStub()` BEFORE importing background.js (the
 * worker registers listeners at import time), and use a dynamic import per
 * test file so each gets a fresh module instance.
 */

class Evt {
  constructor() { this.listeners = []; }
  addListener(fn) { this.listeners.push(fn); }
  async emit(...args) { for (const fn of this.listeners) await fn(...args); }
}

export function installChromeStub() {
  const store = new Map();
  const calls = { notifications: [], windows: [], badgeText: [], badgeColor: [], alarms: [], cleared: [] };

  const chrome = {
    _store: store,
    _calls: calls,
    storage: {
      local: {
        async get(keys) {
          if (keys === null || keys === undefined) return Object.fromEntries(store);
          const list = Array.isArray(keys) ? keys : [keys];
          const out = {};
          for (const k of list) if (store.has(k)) out[k] = structuredClone(store.get(k));
          return out;
        },
        async set(obj) {
          for (const [k, v] of Object.entries(obj)) store.set(k, structuredClone(v));
        },
        async remove(keys) { for (const k of [].concat(keys)) store.delete(k); },
      },
      onChanged: new Evt(),
    },
    alarms: {
      async clear() {},
      create(name, info) { calls.alarms.push({ name, ...info }); },
      onAlarm: new Evt(),
    },
    notifications: {
      create(id, opts) { calls.notifications.push({ id, ...opts }); },
      clear(id) { calls.cleared.push(id); },
      onClicked: new Evt(),
    },
    action: {
      setBadgeText(o) { calls.badgeText.push(o.text); },
      setBadgeBackgroundColor(o) { calls.badgeColor.push(o.color); },
      setBadgeTextColor() {},
      setTitle() {},
    },
    windows: { create(o) { calls.windows.push(o); } },
    runtime: {
      onInstalled: new Evt(),
      onStartup: new Evt(),
      onMessage: new Evt(),
      getURL: p => `chrome-extension://test/${p}`,
    },
  };
  globalThis.chrome = chrome;
  return chrome;
}

/**
 * Drive the worker's onMessage listener the way the browser would and resolve
 * with what it passed to sendResponse.
 */
export function sendMessage(chrome, msg) {
  return new Promise(resolve => {
    for (const fn of chrome.runtime.onMessage.listeners) fn(msg, {}, resolve);
  });
}
