//#region lib/types/index.js
/**
 * DSH-Cost-Tracker (dsh-cost-tracker), host half.
 *
 * Two jobs:
 *  1. Appear in the host Loader (its fiber is created on activation, which is
 *     what the client-modules scan checks) so the browser half is discovered.
 *  2. Serve GET /cost-tracker/balance: read every custom provider from
 *     ~/.dsh/settings.yaml (llm-pi-ai.providers), resolve each provider's key
 *     from ~/.dsh/.credentials.yaml (or the env var named by apiKeyEnv), call
 *     the provider's /v1/usage endpoint, and return the balances as JSON.
 *     The API key stays host-side — the browser bundle only ever fetches this
 *     same-origin route.
 *
 * The route is deliberately narrow: no provider state, no writes, no secrets
 * in responses beyond the account balance the provider itself returns.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/** Cordis plugin name. */
const name = "dsh-cost-tracker";
/** Required services: the web route registry. */
const inject = ["webServer"];

/** Resolve the harness home (env override, else ~/.dsh). */
function dshHome() {
	return process.env.DSH_HOME || join(homedir(), ".dsh");
}

/**
 * Minimal line-based reader for the provider section of settings.yaml:
 * `llm-pi-ai:` → `providers:` → `<id>:` with scalar fields `apiKeyEnv`,
 * `baseURL`, and optional `name`. Tolerant of unknown fields and layout
 * differences — only the two scalars we need are captured.
 * @returns provider records [{ provider, apiKeyEnv?, baseURL?, name? }].
 */
function readProviders() {
	const path = join(dshHome(), "settings.yaml");
	let lines;
	try {
		lines = readFileSync(path, "utf8").split(/\r?\n/);
	} catch {
		return [];
	}
	const providers = [];
	let inPi = false;
	let inProviders = false;
	let current = null;
	for (const raw of lines) {
		const indent = raw.match(/^\s*/)?.[0].length ?? 0;
		const body = raw.slice(indent).trim();
		if (body === "") continue;
		if (indent === 0 && body.startsWith("llm-pi-ai:")) {
			inPi = true;
			inProviders = false;
			current = null;
			continue;
		}
		if (!inPi) continue;
		if (indent <= 0) {
			inPi = false;
			inProviders = false;
			current = null;
			continue;
		}
		if (indent === 2 && body.startsWith("providers:")) {
			inProviders = true;
			current = null;
			continue;
		}
		if (!inProviders) continue;
		if (indent === 4) {
			const idMatch = body.match(/^([A-Za-z0-9_.-]+):\s*$/);
			if (idMatch) {
				current = { provider: idMatch[1] };
				providers.push(current);
			}
			continue;
		}
		if (indent === 6 && current !== null) {
			const fieldMatch = body.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
			if (fieldMatch) current[fieldMatch[1]] = fieldMatch[2].trim();
		}
	}
	return providers;
}

/** Read the flat `KEY: value` map from .credentials.yaml. */
function readCredentials() {
	const path = join(dshHome(), ".credentials.yaml");
	let lines;
	try {
		lines = readFileSync(path, "utf8").split(/\r?\n/);
	} catch {
		return {};
	}
	const creds = {};
	for (const raw of lines) {
		const m = raw.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
		if (m) creds[m[1]] = m[2].trim();
	}
	return creds;
}

/** Resolve one provider's API key: env var first, then the credentials file. */
function resolveKey(provider, creds) {
	if (!provider.apiKeyEnv) return void 0;
	return process.env[provider.apiKeyEnv] || creds[provider.apiKeyEnv];
}

/**
 * Query one provider's /v1/usage for its account balance.
 * @param baseURL - provider base URL (typically ends with /v1).
 * @param key - bearer API key.
 * @returns { balance?, unit?, error? } — balance/unit on success, error text on failure.
 */
async function fetchBalance(baseURL, key) {
	const url = `${baseURL.replace(/\/+$/, "")}/usage`;
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), 8000);
	try {
		const res = await fetch(url, {
			headers: { Authorization: `Bearer ${key}`, "User-Agent": "dsh-cost-tracker/0.1" },
			signal: ctrl.signal
		});
		if (!res.ok) return { error: `HTTP ${res.status}` };
		const json = await res.json();
		return {
			balance: typeof json.balance === "number" ? json.balance : void 0,
			unit: typeof json.unit === "string" ? json.unit : "USD"
		};
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error) };
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Mount the balance route: GET /cost-tracker/balance → JSON list of custom
 * providers with live balances. An optional `?provider=<id>` query refreshes
 * only that one provider (the per-row Refresh button), otherwise every custom
 * provider is refreshed.
 * @param ctx - host plugin context carrying webServer.
 */
function apply(ctx) {
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: "/cost-tracker/balance",
		handler: async (req, res) => {
			if (req.method !== "GET" && req.method !== "HEAD") {
				res.writeHead(405);
				res.end();
				return;
			}
			const url = new URL(req.url ?? "/", "http://x");
			const only = url.searchParams.get("provider");
			let providers = readProviders().filter((p) => p.baseURL && p.apiKeyEnv);
			if (only !== null && only !== "") {
				providers = providers.filter((p) => p.provider === only);
			}
			const creds = readCredentials();
			const rows = [];
			for (const provider of providers) {
				const key = resolveKey(provider, creds);
				if (key === void 0 || key === "") {
					rows.push({ provider: provider.provider, error: `missing key for ${provider.apiKeyEnv}` });
					continue;
				}
				const result = await fetchBalance(provider.baseURL, key);
				rows.push({
					provider: provider.provider,
					name: provider.name || provider.provider,
					...result
				});
			}
			const body = JSON.stringify({ ok: true, providers: rows });
			res.writeHead(200, {
				"content-type": "application/json; charset=utf-8",
				"cache-control": "no-cache"
			});
			res.end(body);
		}
	}), "cost-tracker: balance route");
}
//#endregion
export { apply, inject, name };
