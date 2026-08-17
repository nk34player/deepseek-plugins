# DSH-Cost-Tracker

Live cost tracking for DeepSeek Harness. Adds a per-turn and session-total cost
readout to the composer bar, plus a **Cost Tracker** settings page that shows
your custom providers' live balances.

## Features

- **Composer cost readout** — shows the last turn's cost (💰) and the session
  total (💵) right under the composer.
  - Costs are computed from actual token usage at each model's price, with a
    configurable relay discount.
  - Hover for a full breakdown: every turn and every model, sorted by cost.
  - Session-scoped — costs never bleed across sessions.
- **Cost Tracker settings page** — lists every custom provider from
  `~/.dsh/settings.yaml` with its **Custom** tag, live balance, and a
  **Refresh** button per row. Each row's Refresh fetches **only that provider**
  (the other balances and their errors stay put).
  - Balances come from each provider's `/v1/usage` endpoint, called by the host
    half. Your API key never leaves the machine.

## Install

```powershell
.\install.ps1
```

Then restart the harness. Manual install: copy the package into
`~/.dsh/profiles/node_modules/@deepseek-ai/dsh-cost-tracker/`, add the loader row
to `~/.dsh/profiles/web/cordis.patch.yml`, and restart.

## Uninstall

Delete the package directory and its loader row, then restart.

## Notes

- Pricing constants (per-model prices, relay discount) are at the top of
  `lib/client.js` — adjust them if your provider's rates differ.
- The settings page is a sibling section to Models, not inside it: the Models
  rows expose no per-row slot for third-party plugins.
