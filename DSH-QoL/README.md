# DSH-QoL

Quality-of-life controls for DeepSeek Harness, in a **QoL** settings page
(a new nav section, order 30, same DSH row styling as Models/General).

## Controls

### 1. Session log button (switch)
Show/hide the **"Session log"** download button in the session header
(top right). Off hides it via an injected stylesheet targeting the
`conversation.session.header.utilities` outlet (where the shipped
`session-log-download` entry renders).

### 2. When closing window (segmented control)
A Reasonix-style segmented choice, not an on/off toggle:

```
[ Keep Running ] [ Quit ]
```

- **Keep Running** (default) — closing the window hides the app to the system
  tray; the backend keeps running. This is the installed desktop shell's
  current behavior (verified in its `app.asar`).
- **Quit** — closing the window quits the app completely. Needs the small
  shell patch below, because the packaged shell currently always hides.

### 3. MCP servers (manager)
A server-management screen for the **global MCP servers** defined in
`~/.dsh/cordis.patch.yml` (the `@deepseek-ai/dsh-mcp-client` rows), opened
from the "MCP servers" row.

- **List** — "Global MCP N" header, one bordered panel, rows with: subdued
  server icon, status dot + name + transport badge (stdio/sse/streamable-http),
  availability text (available · running / starting / error / disabled /
  available · starts on demand), monospace command preview (truncated, secret
  values scrubbed), chevron → detail, Remove, enable/disable toggle.
- **Status** — derived from the live Loader state (`ctx.loader` fiber phase)
  merged with the config's `disabled` flag, not hardcoded.
- **Detail** — "← Back to MCP servers", name header, info grid
  (Status / Source / Transport / Command / Environment), enable toggle,
  Remove with confirmation, and the "no tool details" empty state.
- **Toggle / Remove** — edit `~/.dsh/cordis.patch.yml` surgically (only the
  matching row block); they apply on the next restart, like any loader change.
- **Security** — env values are never returned (only variable names), and
  command previews scrub secret-shaped query values / API keys
  (`--key ********`, `tvly-…`, `ctx7sk-…`).

Host endpoints: `GET /dsh-qol/mcp`, `PUT /dsh-qol/mcp/<id>` (enabled),
`DELETE /dsh-qol/mcp/<id>`.

The preference is persisted to **`~/.dsh/qol-prefs.json`** through the host
route `GET/PUT /dsh-qol/prefs` (same-origin; no secrets cross the browser).
The desktop shell reads that file to decide its window-close behavior; the
client also calls `window.dshDesktop.setCloseBehavior(...)` directly when the
shell exposes that bridge.

## Desktop-shell hook (required for toggle 2 to take effect)

The harness web GUI runs inside the desktop shell
([salathleizhang/deepseek-harness-desktop](https://github.com/salathleizhang/deepseek-harness-desktop)),
which owns the Electron `BrowserWindow`. **The installed shell already has a
tray and already hides-to-tray on close** (verified in the packaged
`app.asar`: `lib/window-lifecycle.js` always `preventDefault()` + `hide()`
on window close, and `lib/main.js` builds a tray menu with Open Window /
Launch at login / Notifications / Quit). The GitHub README is stale.

So "Keep Running" (tray) is the shell's current behavior — the gap is the
**Quit** option. To make the segmented control actually quit, patch the
shell's `lib/window-lifecycle.js` to read the pref file:

```js
// desktop-shell lib/window-lifecycle.js (createDesktopLifecycle)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

function readCloseBehavior() {
  try {
    const raw = JSON.parse(readFileSync(join(homedir(), ".dsh", "qol-prefs.json"), "utf8"));
    return raw.closeBehavior === "quit" ? "quit" : "tray";
  } catch {
    return "tray"; // shell default: hide to tray
  }
}

onWindowClose(event) {
  if (quitting) return;
  if (readCloseBehavior() === "quit") {
    requestQuit();        // tear down the Host and app.quit()
    return;
  }
  event.preventDefault();
  options.getWindow()?.hide();
}
```

`requestQuit` is already wired in the shell (used by the tray's Quit item and
updater install), so the close path just reuses it.

The plugin's client also calls `window.dshDesktop.setCloseBehavior(...)` when
the shell's preload exposes such a method — the packaged preload currently
does not, so the file read above is the authoritative channel.

## Layout

```
DSH-QoL/
  package.json     dsh.client declaration (platform: web) + exports["./client"]
  lib/index.js     host half — activates the loader entry AND serves
                   GET/PUT /dsh-qol/prefs (persists ~/.dsh/qol-prefs.json)
  lib/client.js    browser bundle — QoL settings section with the two toggles
  tests/           smoke tests (node, no browser)
```

## Install

1. Copy `package.json`, `lib\index.js`, `lib\client.js` into
   `~/.dsh\profiles\node_modules\@deepseek-ai\dsh-qol\`.
2. Add the loader row to `~/.dsh\profiles\web\cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-qol
      name: '@deepseek-ai/dsh-qol'
```

3. Restart the harness GUI (new loader rows only load on restart).

## Uninstall

Delete `~/.dsh\profiles\node_modules\@deepseek-ai\dsh-qol\`, remove the
`dsh-qol` row from the patch, restart. Delete `~/.dsh\qol-prefs.json` if you
want the preferences gone too.
