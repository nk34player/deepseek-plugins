# deepseek-plugins

A collection of plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

Each plugin ships as a dual-faced package: a **host half** (Node, runs inside the
harness) and a **client half** (browser bundle, adds UI to the web surface). They
install side-by-side under your DSH profile and register their own settings
pages, slots, and host routes.

## Plugins

| Plugin | Package | What it does |
| --- | --- | --- |
| [DSH-Cost-Tracker](DSH-Cost-Tracker/README.md) | `@deepseek-ai/dsh-cost-tracker` | Live per-turn and session cost in the composer bar, plus a Cost Tracker settings page with custom-provider balances. |
| [DSH-QoL](DSH-QoL/README.md) | `@deepseek-ai/dsh-qol` | Quality-of-life settings: session-log button toggle, background-job control, and a global MCP server manager. |

## Install

Each plugin has its own `install.ps1` (idempotent) that copies the package into
`~/.dsh/profiles/node_modules/@deepseek-ai/<name>/` and appends the loader row to
`~/.dsh/profiles/web/cordis.patch.yml`. After installing, **restart the harness**
— new loader rows only load on restart.

See each plugin's README for details.

## Layout

```
deepseek-plugins/
  DSH-Cost-Tracker/     cost-tracking plugin
  DSH-QoL/              quality-of-life plugin
```

Each plugin folder contains:

```
<name>/
  package.json     dsh.client declaration + exports["./client"]
  lib/index.js     host half (loader entry, host routes)
  lib/client.js    browser bundle (UI)
  tests/           node smoke tests
  install.ps1      idempotent installer
  README.md        plugin docs
```

## Requirements

- DeepSeek Harness (desktop or web)
- The plugins are personal/experimental — no published builds, no external
  dependencies beyond what the harness already provides.
