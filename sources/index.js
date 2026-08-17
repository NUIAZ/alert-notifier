/**
 * sources/index.js: the source registry.
 *
 * To add a feed: write sources/<name>.js following sources/types.js, import it
 * here, and add it to SOURCES. The options page discovers it from this list
 * (dropdown entry, description, per-source settings form), and background.js
 * looks it up by `id` at poll time. Nothing else needs to change, apart from
 * manifest.json host_permissions if the feed lives on a new host, because the
 * browser blocks cross-origin fetches from a service worker otherwise. The
 * unit test tests/sources.test.js checks that every registered host IS in the
 * manifest, so forgetting will fail the build rather than fail silently at
 * runtime with a confusing "Failed to fetch".
 */

import * as nws from './nws.js';
import * as githubstatus from './githubstatus.js';
import * as mock from './mock.js';

/** Registration order = order in the Options dropdown. First entry is default. */
export const SOURCES = [nws, githubstatus, mock];

/** ID of the source selected when nothing has been saved yet. */
export const DEFAULT_SOURCE_ID = nws.id;

/**
 * Look a source up by ID, falling back to the default (never undefined) so a
 * stale or corrupted setting can't strand the poll loop.
 * @param {string} sourceId
 */
export function getSource(sourceId) {
  return SOURCES.find(s => s.id === sourceId) || SOURCES[0];
}

/**
 * Default values for a source's per-source settings, from its `settings`
 * declarations. Used both to seed storage on install and to fill gaps when a
 * new option is added in a later version.
 * @param {typeof nws} source
 */
export function defaultSettingsFor(source) {
  const out = {};
  for (const s of source.settings || []) out[s.key] = s.default;
  return out;
}
