/**
 * lib/severity.js: the extension's four-level severity scale and everything
 * that depends on ordering it.
 *
 * Every data source (NWS, GitHub Status, mock, or your own adapter) maps its
 * native severity vocabulary onto these four levels inside its adapter. After
 * that point the rest of the extension (badge colour, notification priority,
 * whether a modal window fires, sort order in the popup) only ever reasons
 * about these four strings. Keeping the vocabulary tiny is what makes a new
 * adapter ~30 lines.
 *
 * Ordering matters: index 0 is the most severe. highestSeverity() and
 * sortBySeverity() rely on that, so add any new level in rank order.
 */

/** Ranked most → least severe. The index doubles as the sort key. */
export const SEVERITY_ORDER = ['critical', 'serious', 'warning', 'info'];

/**
 * Badge / card background per level. Chosen so all four stay distinguishable at
 * 16px badge size and for deuteranopic viewers: black, red, amber, blue; no
 * red/green or red/orange pairs.
 */
export const SEVERITY_COLORS = {
  critical: '#000000',
  serious:  '#DC3545',
  warning:  '#FFC107',
  info:     '#0D6EFD',
};

/** Human label shown on cards, in the modal, and in notification titles. */
export const SEVERITY_LABELS = {
  critical: 'CRITICAL',
  serious:  'SERIOUS',
  warning:  'WARNING',
  info:     'INFO',
};

/**
 * Levels that get the interruptive treatment: a modal popup window plus an OS
 * notification that stays on screen until acted on. Everything below this is
 * badge + a transient toast only. Data, not code, so a fork can dial it up or
 * down without touching background.js.
 */
export const INTERRUPTIVE_SEVERITIES = new Set(['critical', 'serious']);

/**
 * Coerce any input into one of the four levels. Unknown → 'info'. Never
 * throws: an adapter bug should degrade to a quiet blue card, not kill the
 * service worker's poll loop.
 *
 * @param {unknown} value
 * @returns {'critical'|'serious'|'warning'|'info'}
 */
export function normalizeSeverity(value) {
  const s = String(value ?? '').trim().toLowerCase();
  return SEVERITY_ORDER.includes(s) ? s : 'info';
}

/**
 * True if `a` outranks or equals `b`. Backs the "minimum severity" option
 * ("only bother me for serious and above").
 */
export function atLeast(a, b) {
  return SEVERITY_ORDER.indexOf(normalizeSeverity(a)) <=
         SEVERITY_ORDER.indexOf(normalizeSeverity(b));
}

/**
 * The single worst severity present in a list, or null for an empty list.
 * Drives the badge colour: one red "3" is more useful than three counters.
 *
 * @param {Array<{severity: string}>} alerts
 */
export function highestSeverity(alerts) {
  if (!alerts || alerts.length === 0) return null;
  for (const level of SEVERITY_ORDER) {
    if (alerts.some(a => normalizeSeverity(a.severity) === level)) return level;
  }
  return 'info';
}

/**
 * Stable sort, most severe first. Returns a NEW array; the popup sorts what it
 * renders, but background.js stores the source's own order for change detection
 * and must not have that reordered under it.
 */
export function sortBySeverity(alerts) {
  return [...alerts].sort(
    (a, b) => SEVERITY_ORDER.indexOf(normalizeSeverity(a.severity)) -
              SEVERITY_ORDER.indexOf(normalizeSeverity(b.severity))
  );
}
