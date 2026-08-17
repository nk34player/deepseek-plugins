# DSH-QoL

Quality-of-life controls for DeepSeek Harness, in a **QoL** settings page
(a new nav section, order 30, same DSH row styling as Models/General).

## Controls

### 1. Session log button (switch)
Show/hide the **"Session log"** download button in the session header
(top right). Off hides it via an injected stylesheet targeting the
`conversation.session.header.utilities` outlet (where the shipped
`session-log-download` entry renders).

The preference is persisted to **`~/.dsh/qol-prefs.json`** and applied
**at launch** — the client re-reads the pref when the app boots (retrying
until the host route responds) and whenever the settings page opens. The
desktop shell always hides to tray on window close; there is no quit/close
behavior option.

### 2. MCP servers (manager)
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

## Layout

```
DSH-QoL/
  package.json     dsh.client declaration (platform: web) + exports["./client"]
  lib/index.js     host half — activates the loader entry AND serves
                   GET/PUT /dsh-qol/prefs (persists ~/.dsh/qol-prefs.json)
  lib/client.js    browser bundle — QoL settings section with the toggle
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
