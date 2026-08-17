# Adding a data source

Everything the extension does — badge, toasts, modal, dismiss/silence — works
off one normalised shape, `Alert`. A *source adapter* is a module that fetches
something and returns `Alert[]`. Nothing else knows or cares where alerts come
from.

## The contract

`sources/types.js` is the authoritative definition. In short, an adapter
exports:

| Export | Type | Purpose |
|---|---|---|
| `id` | `string` | Stable key. Persisted in the user's settings, so don't rename it later. |
| `label` | `string` | Shown in the Options *Feed* dropdown. |
| `description` | `string` | One line under the dropdown. |
| `hosts` | `string[]` | Match patterns for every origin you fetch from. **Must also be in `manifest.json` → `host_permissions`** or the browser blocks the request. A test enforces this. |
| `settings` | `Array` | Optional. Per-source options; the Options page renders a form from them. |
| `fetchAlerts(opts)` | `async (opts) => Alert[]` | The work. `opts` is the saved values for your `settings`. Throw on failure — the worker records the message and shows it in the popup. |

An `Alert`:

```ts
{
  id: string;          // unique within the source; STABLE across polls
  title: string;
  message: string;     // plain text; blank lines become paragraphs
  severity: 'critical' | 'serious' | 'warning' | 'info';
  active: boolean;     // false = resolved/expired (filtered out)
  startTime: string | null;   // ISO-8601
  endTime: string | null;     // ISO-8601, null if open-ended
  url?: string | null;        // "Details ↗" link
}
```

Use `makeAlert({...})` from `sources/types.js` to build them — it fills safe
defaults so a missing field can't put `undefined` on a card.

## Step by step

1. **Create `sources/<name>.js`.** Copy `sources/githubstatus.js` — it is the
   smallest real one (~40 lines with comments).

2. **Map severity.** Your feed's vocabulary → our four levels. Put the table at
   the top of the file as data, and pass the result through
   `normalizeSeverity()` so an unexpected value becomes `info` instead of
   breaking the poll.

3. **Pick stable IDs.** Dismiss, silence and "is this new?" all key on `id`.
   Prefix with your source (`myfeed:123`) so two sources can't collide. If your
   feed re-issues the same alert with new IDs (NWS does), derive an ID from
   stable fields instead — see the dedupe note in `sources/nws.js`.

4. **Filter out resolved items** and set `active: false` on anything you keep
   that isn't current. `background.js` filters again defensively, but the
   adapter is the right place.

5. **Register it** in `sources/index.js`:
   ```js
   import * as myfeed from './myfeed.js';
   export const SOURCES = [nws, githubstatus, mock, myfeed];
   ```

6. **Add the host** to `manifest.json`:
   ```json
   "host_permissions": [
     "https://api.weather.gov/*",
     "https://www.githubstatus.com/*",
     "https://status.example.com/*"
   ]
   ```
   Then **Reload** the extension in `chrome://extensions` — host permission
   changes need a reload, and on a packaged install would prompt the user.

7. **Test it.** Add a captured payload to `tests/fixtures/` and a case in
   `tests/sources.test.js` that runs your normaliser against it. Keep the
   network call and the normalisation separate (`fetchAlerts` calls
   `normalizeX`) so the test needs no fetch mock.

## Per-source settings

Declare fields and the Options page builds the form:

```js
export const settings = [
  { key: 'region', label: 'Region', type: 'select', default: 'us-east',
    help: 'Which region to watch.',
    options: [{ value: 'us-east', label: 'US East' }, { value: 'eu-west', label: 'EU West' }] },
  { key: 'token',  label: 'API token', type: 'text', default: '',
    help: 'Stored in chrome.storage.local on this profile only.' },
];
```

Values arrive in `fetchAlerts(opts)` as `opts.region`, `opts.token`. Types:
`select`, `text`, `number`.

## Authenticated feeds

`fetch()` from the service worker sends cookies for the target origin if the
user is logged in there and the host is in `host_permissions`. For token auth,
store the token via a `settings` field and add it as a header. Do not hard-code
secrets — the extension folder is readable by anyone with the profile.

## Gotchas

- **CORS.** Extensions with `host_permissions` bypass CORS for those hosts, so
  most public JSON APIs "just work" from the worker even when they would fail
  from a web page. If a fetch fails with a bare *Failed to fetch*, the host is
  almost certainly missing from the manifest.
- **Polite polling.** The minimum interval is 5 minutes. Public APIs are shared;
  15 is the default for a reason.
- **Payload size.** Everything you return is written to `chrome.storage.local`
  (5 MB default quota). Trim huge bodies in the adapter.
- **Don't reorder for display.** Return alerts in the source's order; the
  popup sorts by severity itself and the worker relies on the raw list for
  change detection.
