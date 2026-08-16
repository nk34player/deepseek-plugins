// DSH-Cost-Tracker — client bundle.
// Per-turn + per-model + session-total COST in the composer context bar
// (the 'conversation.composer.dock' list slot, rendered under the composer
// card beside the shipped stats line).
//
// Accounting model (mirrors a provider's /v1/usage):
//   cost = token buckets × official list price × RELAY_DISCOUNT
// The four buckets are disjoint (verified in dsh-token-meter's fold and in
// the qyk888 relay's /v1/usage response, where `cost` equals the official
// flat list to the cent and `actual_cost` = cost × 0.72).
//
// The dock slot is SESSION-scoped: every session/workspace renders its own
// instance of this readout, so per-session totals never bleed across
// sessions, even when different sessions run different models.
//
// Classic-script bundle served verbatim by client-modules at
// /plugins/@deepseek-ai/dsh-cost-tracker/client.js — no build step.
window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-cost-tracker",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		//#region pricing
		/**
		 * Official DeepSeek v4 flat-list pricing, USD per 1,000,000 tokens
		 * (source: https://api-docs.deepseek.com/quick_start/pricing).
		 * Buckets: input = cache-miss input, hit = cache-hit input (cheapest),
		 * out = completion; cache-write is billed at the input rate.
		 * Add any other model ids your provider exposes (the key must match
		 * the model id reported by the provider).
		 *
		 * NOTE: DeepSeek announced peak/off-peak billing (off-peak = half of
		 * peak; peak 01:00-04:00 + 06:00-10:00 UTC) effective 2026-08-16 16:00
		 * UTC. The qyk888 relay has NOT adopted it yet (its /v1/usage bills
		 * the flat list), so this plugin uses flat rates; if your provider
		 * switches, update the table and pick per the active tier.
		 */
		const PRICES = {
			"deepseek-v4-flash": { in: 0.14, hit: 0.0028, out: 0.28 },
			"deepseek-v4-pro": { in: 0.435, hit: 0.003625, out: 0.87 }
		};
		/** Fallback model id (settings.yaml → agent-default-model). */
		const DEFAULT_MODEL = "deepseek-v4-flash";
		/**
		 * Effective-rate multiplier vs official list.
		 * Official DeepSeek API: 1.
		 * qyk888 relay (ai.qyk888.top, CORGI AI Gateway): 0.72 — DERIVED from
		 * its /v1/usage endpoint on 2026-08-14..16, where actual_cost ÷ cost =
		 * 0.72 exactly every day (28% off list). Recalibrate per provider by
		 * querying its /v1/usage and taking actual_cost ÷ cost.
		 */
		const RELAY_DISCOUNT = 0.72;
		/** Model id carried by one assistant node (provider-reported). */
		function modelOf(node) {
			if (node && node.provenance && typeof node.provenance.model === "string") return node.provenance.model;
			if (node && node.requestConfig && typeof node.requestConfig.model === "string") return node.requestConfig.model;
			return void 0;
		}
		/** Price table for a model id, falling back to the default model. */
		function priceFor(model) {
			return PRICES[model] || PRICES[DEFAULT_MODEL];
		}
		/**
		 * Cost in USD of one usage record at a model's list price × relay
		 * discount. Accepts both the projection shape (uncachedInputTokens /
		 * outputTokens / cacheReadTokens / cacheWriteTokens — durable whole-log
		 * totals) and the raw provider per-message shape (inputTokens /
		 * outputTokens / cacheReadTokens? / cacheWriteTokens?).
		 * @param u - usage record.
		 * @param model - model id; undefined uses the default model.
		 * @returns cost in dollars.
		 */
		function costOf(u, model) {
			if (u === null || typeof u !== "object") return 0;
			const p = priceFor(model);
			return ((u.uncachedInputTokens || u.inputTokens || 0) / 1e6 * p.in
				+ (u.cacheReadTokens || 0) / 1e6 * p.hit
				+ (u.cacheWriteTokens || 0) / 1e6 * p.in
				+ (u.outputTokens || 0) / 1e6 * p.out) * RELAY_DISCOUNT;
		}
		/**
		 * Compact money: $0.0005 / $0.012 / $1.23 / $12.34.
		 * @param d - dollars.
		 * @returns display string.
		 */
		function formatCost(d) {
			if (d >= 1) return `$${d.toFixed(2)}`;
			if (d >= 0.01) return `$${d.toFixed(3)}`;
			return `$${d.toFixed(4)}`;
		}
		/**
		 * Compact token count: 517 / 12.2K / 517K / 1.2M (one decimal under
		 * three digits). Same formatting the shipped stats line uses.
		 * @param n - token count.
		 * @returns display string.
		 */
		function formatTokens(n) {
			const scaled = (v) => v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
			if (n < 1e3) return String(n);
			if (n < 1e6) return `${scaled(n / 1e3)}K`;
			return `${scaled(n / 1e6)}M`;
		}
		//#endregion

		//#region folds
		/**
		 * Fold assistant nodes into per-turn and per-model cost/token totals
		 * in one pass. A turn may contain several assistant steps; each node's
		 * `usage` is that step's raw provider usage, costed at the node's own
		 * model price and summed per `node.turn` and per model id.
		 * Interruption-frozen partials carry no usage — the
		 * `typeof node.usage === "object"` guard skips them.
		 * @param nodes - snapshot nodes.
		 * @returns { perTurn: Map<number,{cost,tokens}>, perModel: Map<string,{cost,tokens}> }.
		 */
		function foldUsage(nodes) {
			const perTurn = new Map();
			const perModel = new Map();
			if (Array.isArray(nodes)) {
				for (let i = 0; i < nodes.length; i++) {
					const node = nodes[i];
					if (node && node.kind === "assistant" && node.usage && typeof node.usage === "object") {
						const model = modelOf(node) || DEFAULT_MODEL;
						const cost = costOf(node.usage, model);
						const tokens = (node.usage.inputTokens || 0)
							+ (node.usage.cacheReadTokens || 0)
							+ (node.usage.cacheWriteTokens || 0)
							+ (node.usage.outputTokens || 0);
						let turn = perTurn.get(node.turn);
						if (turn === void 0) perTurn.set(node.turn, turn = { cost: 0, tokens: 0 });
						turn.cost += cost;
						turn.tokens += tokens;
						let m = perModel.get(model);
						if (m === void 0) perModel.set(model, m = { cost: 0, tokens: 0 });
						m.cost += cost;
						m.tokens += tokens;
					}
				}
			}
			return { perTurn, perModel };
		}
		//#endregion

		/**
		 * The composer.dock entry: 💰 last-turn cost · 💵 session-total cost.
		 * Hovering shows the full per-turn and per-model breakdown.
		 */
		function TurnUsageDock(props) {
			const useSession = props.useSession;
			const useProjection = props.useProjection;
			const nodes = useSession((s) => s && s.nodes);
			const total = useProjection("tokenUsage");

			const { perTurn, perModel } = foldUsage(nodes);
			const turnNos = [...perTurn.keys()].sort((a, b) => a - b);
			const last = turnNos.length > 0 ? turnNos[turnNos.length - 1] : void 0;
			// Model to price the durable whole-log total at: if the session has
			// run exactly one model (the common case), use it; a mixed-model
			// session falls back to the default model for the durable total
			// (per-model split in the tooltip stays exact).
			const modelKeys = [...perModel.keys()];
			const totalModel = modelKeys.length === 1 ? modelKeys[0] : void 0;
			const totalCost = total !== void 0
				? costOf(total, totalModel)
				: [...perTurn.values()].reduce((sum, t) => sum + t.cost, 0);
			const lastCost = last === void 0 ? 0 : perTurn.get(last).cost;

			const turnLines = turnNos
				.map((turn) => `T${turn}: ${formatCost(perTurn.get(turn).cost)} (${formatTokens(perTurn.get(turn).tokens)})`);
			const modelLines = [...perModel.entries()]
				.sort((a, b) => b[1].cost - a[1].cost)
				.map(([model, m]) => `${model}: ${formatCost(m.cost)} (${formatTokens(m.tokens)})`);
			const parts = [...turnLines, ...modelLines];
			const breakdown = parts.join("\n");

			return react.createElement("div", {
				title: breakdown === "" ? "no usage yet" : breakdown,
				style: {
					display: "flex",
					gap: "10px",
					alignItems: "center",
					fontSize: "12px",
					lineHeight: "16px",
					opacity: 0.85,
					fontVariantNumeric: "tabular-nums",
					whiteSpace: "nowrap",
					userSelect: "none",
					cursor: "default"
				}
			},
				react.createElement("span", null, "💰 T", last === void 0 ? "—" : String(last), " ", formatCost(lastCost)),
				react.createElement("span", null, "💵 Total ", formatCost(totalCost))
			);
		}

		//#region settings section
		/** Last successful balance fetch, module-scoped so it survives the
		 * section's unmount/remount (the settings shell mounts the active
		 * section only, so leaving the page unmounts this component). */
		let costTrackerCache = null;

		/**
		 * The Cost Tracker settings page: one row per custom provider with its
		 * live account balance and a Refresh button (same pill style as the
		 * Models page rows). Balance comes from the host route
		 * /cost-tracker/balance, which reads the provider's /v1/usage with the
		 * key held host-side — no secret ever reaches the browser.
		 * On remount the cached result renders immediately; a silent
		 * background refresh updates it without an empty flash.
		 */
		function CostTrackerSection(props) {
			const [state, setState] = react.useState(() => costTrackerCache !== null
				? { status: "ready", rows: costTrackerCache, error: null }
				: { status: "loading", rows: [], error: null });
			const load = react.useCallback(() => {
				setState((prev) => ({ status: "loading", rows: prev.rows, error: null }));
				fetch("/cost-tracker/balance", { headers: { Accept: "application/json" } })
					.then((res) => {
						if (!res.ok) throw new Error(`HTTP ${res.status}`);
						return res.json();
					})
					.then((json) => {
						costTrackerCache = json.providers ?? [];
						setState({ status: "ready", rows: costTrackerCache, error: null });
					})
					.catch((err) => setState((prev) => ({
						status: "error",
						rows: prev.rows,
						error: err instanceof Error ? err.message : String(err)
					})));
			}, []);
			react.useEffect(() => { load(); }, [load]);

			const sectionStyle = {
				maxWidth: "720px",
				color: "var(--dsw-alias-label-primary)",
				display: "flex",
				flexDirection: "column",
				gap: "12px"
			};
			const titleStyle = { color: "var(--dsw-alias-label-primary)", margin: "0", fontSize: "16px", fontWeight: "500", lineHeight: "24px" };
			const introStyle = { color: "var(--dsw-alias-label-tertiary)", margin: "0", fontSize: "14px", lineHeight: "22px" };
			const rowsStyle = { display: "flex", flexDirection: "column", gap: "8px", margin: "12px 0 0", padding: "0", listStyle: "none" };
			const rowCardStyle = { border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "12px", display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px" };
			const rowNameStyle = { color: "var(--dsw-alias-label-primary)", fontSize: "14px", fontWeight: "500", lineHeight: "22px" };
			const rowTagStyle = { border: "1px solid var(--dsw-alias-border-l3)", color: "var(--dsw-alias-label-secondary)", borderRadius: "4px", flex: "none", padding: "1px 6px", fontSize: "11px", lineHeight: "16px" };
			const balanceStyle = { marginLeft: "auto", fontSize: "14px", fontWeight: "500", fontVariantNumeric: "tabular-nums", color: "var(--dsw-alias-label-primary)" };
			const refreshStyle = {
				boxSizing: "border-box",
				height: "36px",
				font: "inherit",
				cursor: "pointer",
				border: "none",
				borderRadius: "18px",
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				gap: "4px",
				padding: "0 14px",
				fontSize: "14px",
				lineHeight: "22px",
				background: "var(--dsw-alias-interactive-bg-hover)",
				color: "var(--dsw-alias-label-primary)"
			};
			const errorStyle = { color: "var(--dsw-alias-state-error-primary)", margin: "0", fontSize: "14px", lineHeight: "22px" };

			return react.createElement("div", { style: sectionStyle },
				react.createElement("h2", { style: titleStyle }, "Cost Tracker"),
				react.createElement("p", { style: introStyle }, "Account balances for your custom providers (from each provider's /v1/usage)."),
				state.error === null ? null : react.createElement("p", { style: errorStyle }, "Failed to load balances: ", state.error),
				react.createElement("ul", { style: rowsStyle },
					state.rows.length === 0 && state.status === "loading"
						? react.createElement("li", { style: rowCardStyle }, "Loading balances…")
						: state.rows.length === 0
							? react.createElement("li", { style: rowCardStyle }, "No custom providers configured.")
							: state.rows.map((row) => react.createElement("li", {
								key: row.provider,
								style: rowCardStyle
							},
								react.createElement("span", { style: rowNameStyle }, row.name || row.provider),
								react.createElement("span", { style: rowTagStyle }, "Custom"),
								react.createElement("span", { style: balanceStyle },
									row.error !== void 0 && row.error !== null
										? row.error
										: "💰 " + formatCost(row.balance ?? 0) + (row.unit !== void 0 && row.unit !== "USD" ? " " + row.unit : "")
								),
								react.createElement("button", {
									type: "button",
									style: refreshStyle,
									disabled: state.status === "loading",
									onClick: load
								}, state.status === "loading" ? "…" : "Refresh")
							))
				)
			);
		}
		//#endregion

		/** Cordis plugin name (client side). */
		const name = "dsh-cost-tracker";
		/**
		 * Register the readout as a second occupant of the composer context bar
		 * (the shipped stats line lives there at order 0; this one renders
		 * after it at order 10). Session-scoped: each session gets its own
		 * instance, so per-session costs stay isolated across sessions and
		 * workspaces. Also registers the Cost Tracker settings page (a new
		 * nav section beside Models) for custom-provider account balances.
		 */
		function apply(ctx) {
			const slots = ctx.get("slots");
			if (slots === undefined) return;
			slots.inject("conversation.composer.dock", () => slots.register({
				name: "conversation.composer.dock",
				id: "cost-tracker-dock",
				order: 10
			}, TurnUsageDock));
			slots.inject("settings.section", () => slots.register({
				name: "settings.section",
				id: "cost-tracker",
				order: 20,
				label: "Cost Tracker"
			}, CostTrackerSection));
		}
		exports.name = name;
		exports.apply = apply;
		return module.exports;
	}
});
