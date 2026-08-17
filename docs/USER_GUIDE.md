# Alert Notifier: User Guide

This is the non-technical guide: what the extension does, how to install it,
and what every button means. Developers should read the
[README](../README.md).

## What is a browser extension?

A small program that adds a feature to your browser. Extensions run in a
sandbox and can only do what their listed permissions allow. Alert Notifier
asks for three:

| Permission | Why |
|---|---|
| **alarms** | To wake up every few minutes and check the feed |
| **storage** | To remember your settings and which alerts you've dismissed |
| **notifications** | To show the pop-up messages in the corner of your screen |

…and permission to talk to two websites: `api.weather.gov` and
`www.githubstatus.com`. It does not read your browsing, does not run on web
pages, and sends nothing anywhere except those two requests.

## Installing

1. Download the code: <https://github.com/NUIAZ/alert-notifier>
   → green **Code** button → **Download ZIP** → extract it somewhere permanent
   (the browser loads it from that folder every time, so don't delete it).
2. In the address bar go to **`edge://extensions`** (Edge) or
   **`chrome://extensions`** (Chrome/Brave).
3. Switch on **Developer mode** (top-right in Chrome; left sidebar in Edge).
4. Click **Load unpacked** and choose the extracted `alert-notifier` folder.
5. Click the puzzle-piece icon in the toolbar and **pin** Alert Notifier.

You'll see a round "R" icon. Within a few seconds a number may appear on it:
how many weather alerts are active for the default region (Arizona). Change the
region to your state in Settings (below).

### If you see "Manifest file is missing or unreadable"
You picked the folder *above* the right one. Choose the folder that directly
contains `manifest.json`.

## The badge

The number on the icon is how many alerts are currently showing. Its colour
is the worst one:

| Colour | Meaning |
|---|---|
| ⚫ Black | Critical |
| 🔴 Red | Serious |
| 🟡 Amber | Warning |
| 🔵 Blue | Info |
| (none) | All clear |

## The popup

Click the icon. Each alert is a card, worst first.

- **✕** (top-right of a card): *Dismiss*. Hides it. It won't come back unless
  it goes away and is re-issued later.
- **Don't notify me again for this alert**: keeps the card but stops any
  further pop-ups or notifications for it. Good for a multi-day warning you
  already know about.
- **Details ↗**: opens the alert on the source's own website.
- **↻**: check now. **⚙**: settings.

Under the heading you'll see which feed is active and how long ago it was
checked. A yellow bar means the last check failed (usually no internet); the
previous alerts stay visible.

## Notifications and the pop-up window

When something **new** appears you get a system notification. For **critical**
and **serious** alerts you also get a small window that stays open until you
click **Acknowledge** (or press Enter). Escape closes it. Tick *Don't show this
alert again* before acknowledging if you don't want to hear about that
particular alert again.

You are only interrupted for **new** alerts. Checking every 15 minutes does
not re-notify you about the same thing.

## Settings

Right-click the icon → **Options**, or the ⚙ in the popup. Everything saves
by itself.

**Feed**: where alerts come from:
- *NWS weather alerts (US)*: underneath, choose a **Region** (your state, or
  nationwide) and which severities to **fetch**. Nationwide is busy; if you
  pick it, set the severities to *Extreme + Severe*.
- *GitHub Status incidents*: GitHub's own outage feed. Usually empty (that's
  good news).
- *Sample data (offline)*: five made-up alerts, one of every severity. Use it
  to see what everything looks like; it never changes.

**Check every**: how often to look. 15 minutes is the default; 5 is the
minimum.

**Ignore anything below**: hide low-severity alerts entirely. *Serious* keeps
only serious and critical.

**System notifications** / **Pop-up window**: turn either treatment off.

**Test notifications**: pretend nothing has been shown yet and check again, so
every current alert fires. Switch to *Sample data* first to see the full show.

**Reset to defaults**: click twice.

## Troubleshooting

| Symptom | Fix |
|---|---|
| No notifications appear | Windows: Settings → System → Notifications. Make sure your browser is allowed and *Do not disturb* is off. macOS: System Settings → Notifications → your browser. |
| Badge shows a number but the popup says "All clear" | You have dismissed them all. Wait for the next check or press *Test notifications*. |
| Yellow "Last check failed" bar | No internet, or the site is down. It retries on the next check. |
| Nothing for my state | Good: no NWS alerts there right now. Try *Sample data* to confirm it's working. |
| I moved/renamed the folder | The browser loses the extension. Load unpacked again from the new location. |

## Uninstalling

`chrome://extensions` / `edge://extensions` → **Remove** on the Alert Notifier
card. Its settings are deleted with it.
