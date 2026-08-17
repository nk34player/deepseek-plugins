# DSH-QoL

Quality-of-life controls for DeepSeek Harness, collected in a **QoL** settings
page (a new nav section, same styling as Models/General).

## Features

- **Session log button** (toggle) — show or hide the "Session log" download
  button in the session header.
- **Background jobs** (sidebar button) — a **Background jobs** button in the
  sidebar (styled like New Session: full row when wide, round icon in the
  collapsed rail). Clicking it opens a **modal** listing every background job
  the session can see, with a **Terminate** button per live job and a
  **Terminate all running** action. Terminating a job stops it so the model
  stops waiting on it. The list is live (polls every 1.5s while the modal is
  open).
  - Kills are authorized through the owning session's live agent, so you can
    only terminate jobs you own.
  - The manager lives here (main window), not in the QoL settings page.
- **MCP servers** (manager) — a screen for your global MCP servers
  (`~/.dsh/cordis.patch.yml`):
  - List with status dots, transport badges, and command previews.
  - Per-server **enable/disable toggle** and **Remove** (with confirmation).
  - Detail view: status, source, transport, command, and environment variables
    (names only — values never leave the host).
  - Toggles and removals take effect on the next restart.

All preferences are persisted to `~/.dsh/qol-prefs.json` and applied at launch.

## Install

```powershell
.\install.ps1
```

Then restart the harness. Manual install: copy the package into
`~/.dsh/profiles/node_modules/@deepseek-ai/dsh-qol/`, add the loader row to
`~/.dsh/profiles/web/cordis.patch.yml`, and restart.

## Uninstall

Delete the package directory and its loader row, then restart. Delete
`~/.dsh/qol-prefs.json` if you want the preferences gone too.
