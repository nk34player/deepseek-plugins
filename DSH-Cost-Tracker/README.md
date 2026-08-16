# DSH-Cost-Tracker

Per-turn + per-model + session-total **cost** in the composer context bar.

A **client plugin** for DeepSeek Harness (web surface). It adds a live readout
to the band under the composer card (the `conversation.composer.dock` slot),
right after the shipped stats line:

```
💰 T7 $0.0032   💵 Total $0.0241
```

- **💰 per-turn** — cost of the most recent turn, folded from the snapshot's
  assistant nodes (`kind === 'assistant'` with a `usage` record), costed at
  **each node's own model price** (from `node.provenance.model` /
  `requestConfig.model`) and summed per `turn`.
- **💵 total** — the durable whole-log `tokenUsage` projection costed at the
  same rates (survives paging and compaction); the snapshot fold is only the
  fallback while no projection value is served. If a session has run exactly
  one model, the durable total is priced at that model; mixed-model sessions
  price the durable total at the default model (the hover per-model split is
  exact either way).
- **hover tooltip** — full breakdown: every turn (`T7: $0.0005 (1.2K)`) plus
  every model (`deepseek-v4-flash: $0.0211 (24K) · deepseek-v4-pro: ...`),
  sorted by cost.

The `conversation.composer.dock` slot is **session-scoped**: every session —
even the same model in different sessions/workspaces — renders its own
instance of this readout with its own snapshot and projections, so costs never
bleed across sessions.

## Settings: Cost Tracker page (custom-provider balances)

The plugin also adds a **Cost Tracker** page to Settings (a new nav section
beside Models, order 20). It lists every custom provider from
`~/.dsh/settings.yaml` (`llm-pi-ai.providers`) with its **Custom** tag, its
live account balance (`💰 $2.56 USD`), and a **Refresh** button per row.

The balance is fetched from a host route (`GET /cost-tracker/balance` served
by this plugin's host half), which:

1. reads each provider's `apiKeyEnv` + `baseURL` from `~/.dsh/settings.yaml`,
2. resolves the API key from `~/.dsh/.credentials.yaml` (or the env var),
3. calls the provider's `/v1/usage` with `Authorization: Bearer <key>` and
   returns `balance` + `unit`.

The API key **never leaves the machine** — the browser only fetches the
same-origin route; the host half makes the authenticated call.

> **Why not inside the Models page rows?** The provider rows on the Models
> page (Edit button, "Custom" tag) are rendered inside the shipped
> `ModelsSection`, which exposes **no per-row slot** for third-party plugins,
> and `settings.section` is an additive list — so a button can't be injected
> into those exact rows without forking the whole shipped section. The Cost
> Tracker page is the architecture-correct equivalent: same settings family,
> same row/button styling, one row per custom provider with its balance.

## Pricing

Cost is computed as `token buckets × PRICES × RELAY_DISCOUNT` — all constants
at the top of `lib/client.js` (USD per 1,000,000 tokens).

- `PRICES` — official DeepSeek v4 flat list, keyed by model id:
  flash `$0.14 / $0.0028 / $0.28`, pro `$0.435 / $0.003625 / $0.87`
  (input / cache-hit / output; cache-write billed at input rate). Add rows for
  any other model ids your provider reports.
- `RELAY_DISCOUNT` — effective-rate multiplier vs official list:
  - **Official DeepSeek API**: `1`.
  - **qyk888 relay (current provider)**: `0.72` — measured from the relay's
    `/v1/usage` endpoint on 2026-08-14..16: its `actual_cost` was exactly
    0.72 × the official list every day (28% discount), while its `cost` field
    equals the official flat list to the cent. Remaining balance at probe
    time: **$2.65 USD**.
- `DEFAULT_MODEL` — fallback model id (settings.yaml `agent-default-model`,
  currently `deepseek-v4-flash`).

Note: DeepSeek announced peak/off-peak billing (off-peak = half of peak; peak
01:00-04:00 + 06:00-10:00 UTC) effective 2026-08-16 16:00 UTC. The relay has
not adopted it yet, so the plugin uses the flat list; update `PRICES` if your
provider switches.

### Probing a custom provider yourself

The relay is a CORGI AI Gateway. With your key
(`Authorization: Bearer sk-...`, key stored in `~/.dsh/.credentials.yaml`):

- `GET /v1/usage` — **works**: returns `balance`, `unit`, per-day `daily_usage`
  (`input_tokens`, `output_tokens`, `cache_read_tokens`, `cost`, `actual_cost`)
  and per-model `model_stats`. `actual_cost ÷ cost` is the authoritative
  `RELAY_DISCOUNT` to calibrate against.
- `GET /v1/models` — works (200), model list only.
- `GET /v1/balance` — **404** (not implemented on this relay).
- `GET /v1/dashboard/billing/*` — **404** (OpenAI-style billing not exposed).

## Layout

```
DSH-Cost-Tracker/
  package.json     dsh.client declaration (platform: web) + exports["./client"]
  lib/index.js     host half — activates the loader entry AND serves
                   GET /cost-tracker/balance (reads settings + credentials,
                   calls each custom provider's /v1/usage; key stays host-side)
  lib/client.js    browser bundle — classic script, served verbatim by client-modules
```

## How it plugs in

1. The loader row `cost-tracker` is added to the web profile's user patch
   (`~/.dsh/profiles/web/cordis.patch.yml`), naming this package.
2. `dsh-client-modules` scans loader entries, finds `dsh.client.platform === "web"`,
   resolves `exports["./client"]`, and serves the bundle at
   `/plugins/@deepseek-ai/dsh-cost-tracker/client.js` (sha1 rev).
3. The browser module system registers the bundle (id = package name), its
   `apply(ctx)` grabs the client `slots` service and registers:
   - `TurnUsageDock` into `conversation.composer.dock` (list slot, `order: 10`),
   - `CostTrackerSection` into `settings.section` (id `cost-tracker`, `order: 20`).

Host side: the same loader row activates the host half, which registers the
`/cost-tracker/balance` route on the webserver (requires `webServer` via the
plugin's `inject` export).

Data sources (client-side, no host RPC for the dock):

- `useProjection("tokenUsage")` — `{ uncachedInputTokens, outputTokens,
  cacheReadTokens, cacheWriteTokens }`, whole-log totals, costed via `PRICES`.
- `useSession((s) => s.nodes)` — snapshot nodes; per-turn fold of each
  assistant node's raw `usage`.

## Install (this machine)

The package must be resolvable from the web profile dir. It lives in the
flat module fallback `~/.dsh/profiles/node_modules` (maintained by
`healProfilesModuleFallback`, which only adds symlinks for the app's own
dependency closure and never wipes other entries):

```
~/.dsh/profiles/node_modules/@deepseek-ai/dsh-cost-tracker/
```

plus the loader row in `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: cost-tracker
      name: '@deepseek-ai/dsh-cost-tracker'
```

Then **restart the harness** — new loader rows (plugin-set changes) only take
effect on restart. Bundle content edits hot-apply only when the dev web
watcher (`pnpm run dev:web`) is running, which a built deployment does not have.

## Uninstall

Delete the package directory and remove the `cost-tracker` row from
`~/.dsh/profiles/web/cordis.patch.yml`, then restart.
