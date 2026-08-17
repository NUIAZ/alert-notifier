/**
 * lib/state.js — pure functions for the bookkeeping the service worker does on
 * every poll: which alerts are visible, which are new, and which stored IDs can
 * be forgotten.
 *
 * Nothing in here touches chrome.* — background.js reads storage, calls these,
 * writes storage. The split is deliberate: these are the rules a reviewer will
 * want to reason about ("when exactly does a modal fire?"), and pure functions
 * are what tests/state.test.js exercises without a browser or a chrome mock.
 *
 * Vocabulary used throughout the extension:
 *   dismissed — user clicked ✕ on the card. Hidden from the popup and badge, but
 *               remembered so it doesn't come back on the next poll. Forgotten
 *               automatically once the source stops reporting the alert.
 *   silenced  — user ticked "don't notify me again". Still SHOWN in the popup
 *               and counted on the badge, but never re-notifies or re-opens the
 *               modal.
 *   new       — active now, absent from the previous poll's snapshot, and not
 *               silenced. Only these get a notification / modal.
 */

/**
 * Alerts the source currently reports as active. Adapters already drop
 * expired/resolved items, but this guards against one that forgets:
 * `active` missing → treated as active (the source did return it, after all).
 */
export function activeOnly(alerts) {
  return (alerts || []).filter(a => a && a.active !== false);
}

/**
 * What the popup shows and the badge counts: active and not dismissed.
 * @param {Array} active         output of activeOnly()
 * @param {string[]} dismissedIds
 */
export function visibleAlerts(active, dismissedIds) {
  const dismissed = new Set(dismissedIds || []);
  return active.filter(a => !dismissed.has(a.id));
}

/**
 * Alerts that should trigger a notification / modal on this poll.
 *
 * "New" is judged against the PREVIOUS POLL'S snapshot (lastIds), not against
 * the dismissed list — so an alert the user dismissed but which is still active
 * does not re-fire, while an alert that disappeared and later reappears with
 * the same ID DOES fire again (it is news again).
 *
 * @param {Array} visible       output of visibleAlerts()
 * @param {string[]} lastIds    IDs seen on the previous poll
 * @param {string[]} silencedIds
 */
export function newAlerts(visible, lastIds, silencedIds) {
  const last = new Set(lastIds || []);
  const silenced = new Set(silencedIds || []);
  return visible.filter(a => !last.has(a.id) && !silenced.has(a.id));
}

/**
 * Drop stored IDs (dismissed or silenced) that no longer correspond to an
 * active alert, so storage does not grow forever. Returns the SAME array
 * reference when nothing changed, which lets the caller skip a storage write.
 *
 * @param {string[]} storedIds
 * @param {Array} active
 */
export function pruneIds(storedIds, active) {
  const live = new Set(active.map(a => a.id));
  const list = storedIds || [];
  const kept = list.filter(id => live.has(id));
  return kept.length === list.length ? list : kept;
}

/** Add an ID to a list without duplicates. Returns a new array if it changed. */
export function addId(ids, id) {
  const list = ids || [];
  return list.includes(id) ? list : [...list, id];
}

/** Remove an ID from a list. Always returns a new array. */
export function removeId(ids, id) {
  return (ids || []).filter(x => x !== id);
}
