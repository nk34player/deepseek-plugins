# DSH-QoL

Quality-of-life toggles for DeepSeek Harness, in a **QoL** settings page
(a new nav section, order 30, same DSH row/switch styling as Models/General).

## Toggles

### 1. Session log button
Show/hide the **"Session log"** download button in the session header
(top right). Off hides it via an injected stylesheet targeting the
`conversation.session.header.utilities` outlet (where the shipped
`session-log-download` entry renders).

### 2. Minimize to tray on close
- **On** = closing the window hides the app to the system tray (backend keeps running).
- **Off** = closing the window quits the app completely.

The preference is persisted to **`~/.dsh/qol-prefs.json`** through the host
route `GET/PUT /dsh-qol/prefs` (same-origin; no secrets cross the browser).
The desktop shell reads that file to decide its window-close behavior; the
client also calls `window.dshDesktop.setCloseBehavior(...)` directly when the
shell exposes that bridge.

## Desktop-shell hook (required for toggle 2 to take effect)

The harness web GUI runs inside the desktop shell
([salathleizhang/deepseek-harness-desktop](https://github.com/salathleizhang/deepseek-harness-desktop)),
which owns the Electron `BrowserWindow`. The shell currently documents tray as
unimplemented, so wire its main process to honor the pref file:

```js
// desktop-shell electron main (window creation site)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

function readCloseBehavior() {
  try {
    const raw = JSON.parse(readFileSync(join(homedir(), ".dsh", "qol-prefs.json"), "utf8"));
    return raw.closeBehavior === "tray" ? "tray" : "quit";
  } catch {
    return "quit";
  }
}

win.on("close", (event) => {
  if (readCloseBehavior() === "tray") {
    event.preventDefault();
    win.hide(); // keep backend running; tray menu reopens/quits
  }
});
```

And in the preload bridge, expose (optional — the file read above is
authoritative either way):

```js
contextBridge.exposeInMainWorld("dshDesktop", {
  ...,
  setCloseBehavior: (behavior) => ipcRenderer.send("qol:set-close-behavior", behavior)
});
```

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
