/**
 * lib/format.js: small DOM/text helpers shared by popup.js, alert.js and
 * options.js. Kept dependency-free on purpose: an extension demo is more
 * convincing when the whole thing is readable vanilla JS with no build step.
 */

/**
 * HTML-escape untrusted text before it goes anywhere near innerHTML. Every
 * string that came from a feed (title, message, area names) is untrusted;
 * a status page or weather bulletin could contain '<' quite legitimately.
 * Preferred pattern in this codebase is textContent; this exists for the few
 * places where a template string is clearer.
 */
export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * "Started 2h ago" / "in 4h" style relative time, falling back to a date for
 * anything more than a couple of days out. Uses Intl.RelativeTimeFormat so it
 * localises for free.
 * @param {string|number|Date} when
 * @param {Date} [now]
 */
export function relativeTime(when, now = new Date()) {
  const t = new Date(when).getTime();
  if (!Number.isFinite(t)) return '';
  const diffSec = Math.round((t - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (abs < 60) return rtf.format(diffSec, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400 * 2) return rtf.format(Math.round(diffSec / 3600), 'hour');
  return new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Full local date-time, e.g. "Aug 17, 2026, 11:47 AM". */
export function longTime(when) {
  const t = new Date(when).getTime();
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Turn feed body text into safe paragraphs. NWS uses blank lines between
 * "* WHAT..." / "* WHERE..." blocks and hard-wraps at ~70 columns; joining
 * single newlines back into spaces and splitting on blank lines gives
 * readable paragraphs without any HTML from the feed being interpreted.
 * @returns {string} innerHTML-safe markup
 */
export function paragraphsHtml(text) {
  return String(text ?? '')
    .split(/\n\s*\n/)
    .map(p => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
    .map(p => `<p>${escapeHtml(p)}</p>`)
    .join('');
}
