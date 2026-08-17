import { resolve } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
/**
 * scripts/screenshots.mjs — loads the unpacked extension into a throw-away
 * Chromium profile with Playwright, switches it to the sample-data feed, and
 * captures the popup, the modal window and the options page for the README.
 * It also serves as an end-to-end smoke test: if the service worker fails to
 * register or the poll throws, this script exits non-zero.
 *
 * Playwright is NOT a dependency of this repo (it is heavy). Run it from a
 * project that has it, pointing NODE_PATH at that node_modules, or:
 *     npx --yes playwright@1.4x install chromium
 *     node scripts/screenshots.mjs
 *
 * Extensions only load in a persistent context and (for MV3 service workers)
 * with the new headless mode or headed; we use headed with a small window.
 */
// Resolve playwright from PLAYWRIGHT_DIR if set (lets you borrow another
// project's install instead of adding it here).
const pwPath = process.env.PLAYWRIGHT_DIR
  ? (await import('node:url')).pathToFileURL(resolve(process.env.PLAYWRIGHT_DIR, 'index.mjs')).href
  : 'playwright';
const { chromium } = await import(pwPath);

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, 'docs', 'screenshots');
mkdirSync(outDir, { recursive: true });
const profile = resolve(tmpdir(), `alert-notifier-profile-${process.pid}`);

const context = await chromium.launchPersistentContext(profile, {
  // BROWSER_CHANNEL=msedge|chrome uses an installed browser instead of
  // Playwright's bundled Chromium (handy on locked-down machines).
  channel: process.env.BROWSER_CHANNEL || undefined,
  headless: false,
  colorScheme: 'light',
  args: [
    `--disable-extensions-except=${root}`,
    `--load-extension=${root}`,
    '--window-size=900,800',
  ],
  viewport: { width: 380, height: 640 },
});

try {
  // Wait for the MV3 service worker to register — that's proof the manifest,
  // module imports and top-level listener wiring are all valid.
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  console.log('service worker up:', sw.url());

  // Watch for uncaught errors in the worker.
  const swErrors = [];
  sw.on('console', m => { if (m.type() === 'error') swErrors.push(m.text()); });

  // Force the sample-data feed and explicitly re-poll (via the same message
  // the options page's "Test notifications" sends) so every severity is
  // present. Waiting on storage.onChanged alone races the install-time poll.
  const driver = await context.newPage();
  await driver.goto(`chrome-extension://${extId}/options.html`);
  await driver.evaluate(async () => {
    await chrome.storage.local.set({ sourceId: 'mock' });
    await new Promise(r => setTimeout(r, 1200)); // let the onChanged poll settle
    await chrome.runtime.sendMessage({ action: 'resetAndCheck' });
  });

  // ── Popup ────────────────────────────────────────────────────────────────
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.waitForSelector('.alert-card', { timeout: 10000 });
  const cards = await popup.locator('.alert-card').count();
  console.log('popup cards:', cards);
  if (cards !== 5) throw new Error(`expected 5 cards, got ${cards}`);
  await popup.locator('.container').screenshot({ path: resolve(outDir, 'popup.png') });

  // ── Modal ────────────────────────────────────────────────────────────────
  const modal = await context.newPage();
  await modal.setViewportSize({ width: 520, height: 600 });
  await modal.goto(`chrome-extension://${extId}/alert.html?id=mock-critical-001`);
  await modal.waitForFunction(() => document.getElementById('alertTitle').textContent !== 'Loading…');
  console.log('modal title:', await modal.locator('#alertTitle').textContent());
  await modal.screenshot({ path: resolve(outDir, 'modal.png') });

  const modal2 = await context.newPage();
  await modal2.setViewportSize({ width: 520, height: 600 });
  await modal2.goto(`chrome-extension://${extId}/alert.html?id=mock-serious-001`);
  await modal2.waitForFunction(() => document.getElementById('alertTitle').textContent !== 'Loading…');
  await modal2.screenshot({ path: resolve(outDir, 'modal-serious.png') });

  // ── Options ──────────────────────────────────────────────────────────────
  const options = await context.newPage();
  await options.setViewportSize({ width: 760, height: 900 });
  await options.goto(`chrome-extension://${extId}/options.html`);
  await options.waitForSelector('#sourceId option', { state: 'attached' });
  const feeds = await options.locator('#sourceId option').allTextContents();
  console.log('feeds in dropdown:', feeds);
  await options.screenshot({ path: resolve(outDir, 'options.png'), fullPage: true });

  // ── Live NWS poll smoke test ─────────────────────────────────────────────
  await driver.evaluate(async () => {
    await chrome.storage.local.set({ sourceId: 'nws' });
    await new Promise(r => setTimeout(r, 1200));
    await chrome.runtime.sendMessage({ action: 'checkNow' });
  });
  const nws = await sw.evaluate(async () => chrome.storage.local.get(['lastError', 'currentAlerts', 'sourceId']));
  console.log('NWS poll:', nws.sourceId, 'error=', nws.lastError, 'alerts=', nws.currentAlerts?.length);
  if (nws.lastError) throw new Error(`NWS poll failed: ${nws.lastError}`);

  const popupNws = await context.newPage();
  await popupNws.goto(`chrome-extension://${extId}/popup.html`);
  await popupNws.waitForTimeout(800);
  await popupNws.locator('.container').screenshot({ path: resolve(outDir, 'popup-nws.png') });

  if (swErrors.length) {
    console.error('service worker console errors:', swErrors);
    process.exitCode = 1;
  } else {
    console.log('OK — screenshots in', outDir);
  }
} finally {
  await context.close();
  rmSync(profile, { recursive: true, force: true });
}
