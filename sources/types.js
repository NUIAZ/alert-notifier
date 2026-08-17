/**
 * sources/types.js — the one shape every data source must produce.
 *
 * This is the whole contract between "where alerts come from" and "what the
 * extension does with them". An adapter is a module that exports:
 *
 *   export const id          = 'my-feed';         // stable key stored in settings
 *   export const label       = 'My Feed';         // shown in the Options dropdown
 *   export const description = '...';             // one line under the dropdown
 *   export const hosts       = ['https://…/*'];   // must ALSO be in manifest.json
 *                                                 // host_permissions or fetch is
 *                                                 // blocked by the browser
 *   export const settings    = [ … ];             // optional per-source options,
 *                                                 // see sources/nws.js
 *   export async function fetchAlerts(settings)   // → Promise<Alert[]>
 *
 * and registers itself in sources/index.js. That is the entire surface area:
 * ~30 lines for a typical JSON feed. See docs/ADDING_A_SOURCE.md.
 *
 * @typedef {Object} Alert
 * @property {string}  id        Stable, unique within the source. Used to detect
 *                               "new since last poll" and to key dismiss/silence.
 *                               If your feed's IDs change on every fetch, derive
 *                               one from stable fields (see nws.js dedupe note).
 * @property {string}  title     Short headline. Shown in the badge tooltip,
 *                               notification title, card heading, and modal.
 * @property {string}  message   Longer body. Notifications truncate it; the card
 *                               and modal show it in full.
 * @property {'critical'|'serious'|'warning'|'info'} severity
 *                               Already mapped onto lib/severity.js's four levels.
 *                               Use normalizeSeverity() so an unexpected value
 *                               becomes 'info' rather than breaking the poll.
 * @property {boolean} active    false = resolved/expired. Adapters should filter
 *                               these out themselves; the flag exists so a feed
 *                               that reports history can be passed through
 *                               untouched and still behave.
 * @property {string|null} startTime  ISO-8601, or null if unknown.
 * @property {string|null} endTime    ISO-8601 expected end, or null if open-ended.
 * @property {string|null} [url]      Optional link to the source's own page for
 *                                    this alert. Cards render it as "Details ↗".
 */

/**
 * Build an Alert from a partial object, filling safe defaults, so an adapter
 * can't accidentally emit a card with `undefined` in it. Cheap and defensive:
 * one bad item from a feed should never take the whole list down.
 *
 * @param {Partial<Alert>} a
 * @returns {Alert}
 */
export function makeAlert(a) {
  return {
    id:        String(a.id ?? ''),
    title:     String(a.title ?? 'Untitled alert'),
    message:   String(a.message ?? ''),
    severity:  a.severity ?? 'info',
    active:    a.active !== false,
    startTime: a.startTime ?? null,
    endTime:   a.endTime ?? null,
    url:       a.url ?? null,
  };
}
