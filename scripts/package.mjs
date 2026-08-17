/**
 * scripts/package.mjs: builds dist/alert-notifier-<version>.zip, the file you
 * upload to the Chrome Web Store / Edge Add-ons dashboard, or hand to someone
 * to "Load unpacked" after extracting.
 *
 * Only runtime files go in: manifest, the three pages, lib/, sources/, icons/,
 * styles. Tests, fixtures, node_modules, docs and this script stay out; the
 * store rejects packages with stray files and users don't need them.
 *
 *   npm run package
 *
 * Uses the system `zip` if present (macOS/Linux/Git Bash) and falls back to
 * PowerShell's Compress-Archive on Windows, so there is no npm dependency.
 */
import { readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
const out = resolve(root, 'dist', `alert-notifier-${manifest.version}.zip`);

const INCLUDE = [
  'manifest.json',
  'background.js',
  'popup.html', 'popup.js',
  'alert.html', 'alert.js',
  'options.html', 'options.js',
  'styles.css',
  'lib', 'sources',
  'icons/icon16.png', 'icons/icon32.png', 'icons/icon48.png', 'icons/icon128.png',
  'LICENSE',
];

mkdirSync(resolve(root, 'dist'), { recursive: true });
if (existsSync(out)) rmSync(out);

let cmd;
try {
  execSync('zip -v', { stdio: 'ignore' });
  cmd = `zip -r -q "${out}" ${INCLUDE.map(p => `"${p}"`).join(' ')}`;
} catch {
  const list = INCLUDE.map(p => `'${p}'`).join(',');
  cmd = `powershell -NoProfile -Command "Compress-Archive -Path ${list} -DestinationPath '${out}' -Force"`;
}
execSync(cmd, { cwd: root, stdio: 'inherit' });
console.log(`wrote ${out}`);
