//#region lib/types/index.js
/**
 * DSH-QoL (dsh-qol), host half.
 *
 * Jobs:
 *  1. Activate in the host Loader so client-modules discovers the browser half.
 *  2. Serve GET/PUT /dsh-qol/prefs — persist QoL preferences to
 *     ~/.dsh/qol-prefs.json.
 *  3. Serve the MCP manager surface:
 *     - GET  /dsh-qol/mcp        → list of MCP servers: config parsed from
 *       ~/.dsh/cordis.patch.yml (@deepseek-ai/dsh-mcp-client rows) merged
 *       with live loader state (enabled + fiber phase).
 *     - PUT  /dsh-qol/mcp/<id>   → { enabled } toggles a row's `disabled`
 *       flag in the patch file (applies on restart, like any loader change).
 *     - DELETE /dsh-qol/mcp/<id> → removes the row block from the patch.
 *
 * YAML edits are surgical line operations that only touch the matching
 * mcp-client row block; secrets are never returned (env key names only, and
 * command previews are scrubbed of secret-shaped query values and API keys).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/** Cordis plugin name. */
const name = "dsh-qol";
/** Required services: routes, Loader (runtime state), tool registry, background jobs, live agents, sessions. */
const inject = ["webServer", "loader", "tools", "jobs", "agents", "sessions"];

/** Resolve the harness home (env override, else ~/.dsh). */
function dshHome() {
	return process.env.DSH_HOME || join(homedir(), ".dsh");
}

//#region preferences
/** Valid thinking-content modes. */
const THINKING_MODES = ["off", "line", "expanded"];
/** Defaults applied when the prefs file is absent or malformed. */
function defaultPrefs() {
	return { sessionLogButton: true, controlBackgroundJobs: true, thinkingMode: "off" };
}

/** Coerce a raw value into a valid thinking mode. */
function coerceThinkingMode(value) {
	return THINKING_MODES.includes(value) ? value : defaultPrefs().thinkingMode;
}

/** Read the prefs file, merging defaults. */
function readPrefs() {
	const path = join(dshHome(), "qol-prefs.json");
	try {
		const raw = JSON.parse(readFileSync(path, "utf8"));
		const d = defaultPrefs();
		return {
			sessionLogButton: typeof raw.sessionLogButton === "boolean" ? raw.sessionLogButton : d.sessionLogButton,
			controlBackgroundJobs: typeof raw.controlBackgroundJobs === "boolean" ? raw.controlBackgroundJobs : d.controlBackgroundJobs,
			thinkingMode: coerceThinkingMode(raw.thinkingMode)
		};
	} catch {
		return defaultPrefs();
	}
}

/** Validate and persist a partial patch; returns the merged prefs. */
function writePrefs(patch) {
	const merged = { ...readPrefs(), ...patch };
	if (typeof merged.sessionLogButton !== "boolean") throw new Error("sessionLogButton must be a boolean");
	if (typeof merged.controlBackgroundJobs !== "boolean") throw new Error("controlBackgroundJobs must be a boolean");
	if (!THINKING_MODES.includes(merged.thinkingMode)) throw new Error(`thinkingMode must be one of ${THINKING_MODES.join(", ")}`);
	writeFileSync(join(dshHome(), "qol-prefs.json"), JSON.stringify(merged, null, 2) + "\n", "utf8");
	return merged;
}
//#endregion

//#region MCP manager
const MCP_MODULE = "@deepseek-ai/dsh-mcp-client";

/** Redact secret-shaped substrings in a command preview. */
function scrubCommand(text) {
	return text
		.replace(/([?&][A-Za-z0-9_-]*(?:KEY|SECRET|TOKEN|PASSWORD|PASS|API)[A-Za-z0-9_-]*=)[^&\s"']+/gi, "$1********")
		.replace(/(sk-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, "$1…")
		.replace(/(tvly-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, "$1…")
		.replace(/(ctx7sk-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, "$1…");
}

/**
 * Parse the mcp-client rows from ~/.dsh/cordis.patch.yml.
 * Understands the layout: a top-level `- insert:` list whose items carry
 * `id`, `name` (= MCP_MODULE), and `config` with transport/serverName/
 * command/args/env/timeouts. Tolerant of other rows and comment lines.
 * @returns array of { id, config, disabled, blockStart, blockEnd }.
 */
function readMcpRows() {
	const path = join(dshHome(), "cordis.patch.yml");
	let text;
	try {
		text = readFileSync(path, "utf8");
	} catch {
		return { rows: [], text: "" };
	}
	const lines = text.split(/\r?\n/);
	const rows = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const idMatch = line.match(/^\s*-\s*id:\s*([A-Za-z0-9_.-]+)\s*$/);
		if (!idMatch) continue;
		// scan the block until the next top-level list item or insert marker
		let j = i + 1;
		let block = [line];
		while (j < lines.length) {
			const next = lines[j];
			if (/^\s*-\s*id:\s/.test(next) || /^\s*-\s*insert:\s*$/.test(next)) break;
			block.push(next);
			j++;
		}
		const blockText = block.join("\n");
		const nameMatch = blockText.match(/name:\s*(['"])(.*?)\1/);
		if (!nameMatch || nameMatch[2] !== MCP_MODULE) {
			i = j - 1;
			continue;
		}
		const config = {};
		const configMatch = blockText.match(/config:\s*$/m);
		if (configMatch) {
			const after = blockText.slice(configMatch.index).split("\n").slice(1);
			let current = null;
			const scalar = (value) => value.replace(/^['"]|['"]$/g, "").trim();
			for (const cfgLine of after) {
				const indent = cfgLine.match(/^\s*/)?.[0].length ?? 0;
				const body = cfgLine.trim();
				if (body === "" || body.startsWith("#")) continue;
				if (indent < 6) break;
				if (body.startsWith("- ")) {
					// a list item under `current` (args, etc.)
					if (current !== null && config[current] !== void 0) {
						if (!Array.isArray(config[current])) config[current] = [];
						config[current].push(scalar(body.slice(1).trim()));
					}
					continue;
				}
				const m = body.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
				if (!m) continue;
				if (m[2] === "") {
					// a nested map (env, reconnect, headers, ...)
					current = m[1];
					config[current] = {};
					continue;
				}
				if (current !== null && typeof config[current] === "object" && !Array.isArray(config[current])) {
					config[current][m[1]] = scalar(m[2]);
					continue;
				}
				config[m[1]] = scalar(m[2]);
				current = null;
			}
			// Normalize a YAML list that parsed as an empty map (`args: []`).
			if (config.args !== void 0 && typeof config.args === "object" && !Array.isArray(config.args)) {
				config.args = Object.keys(config.args).length === 0 ? [] : config.args;
			}
		}
		rows.push({
			id: idMatch[1],
			config,
			disabled: /^\s*disabled:\s*true\s*$/m.test(blockText),
			blockStart: i,
			blockEnd: j
		});
		i = j - 1;
	}
	return { rows, text, lines };
}

/**
 * Map a loader fiber phase to the user-facing status vocabulary.
 * @returns { text, tone } where tone ∈ available|starting|error|disabled|stopping|unknown.
 */
function statusOf(row, runtime) {
	if (!row.disabled && runtime?.enabled === false) {
		return { text: "disabled", tone: "disabled" };
	}
	if (row.disabled) return { text: "disabled", tone: "disabled" };
	if (runtime === void 0 || runtime.fiberPhase === null) {
		return { text: "available · starts on demand", tone: "available" };
	}
	switch (runtime.fiberPhase) {
		case "active": return { text: "available · running", tone: "available" };
		case "pending":
		case "loading": return { text: "starting", tone: "starting" };
		case "failed": return { text: "error", tone: "error" };
		case "unloading": return { text: "stopping", tone: "starting" };
		default: return { text: "available · starts on demand", tone: "available" };
	}
}

/**
 * Enumerate the registered tool names for one MCP server from the live tool
 * registry (`mcp__<serverName>__<rawName>`). The registry's layers are
 * TS-private but plain at runtime; reads are defensive — any failure yields
 * null (unknown), never a crash.
 * @param tools - the ToolRuntime service (injected).
 * @param serverName - the MCP server namespace.
 * @returns tool names without the prefix, or null when enumeration failed.
 */
function toolsFor(tools, serverName) {
	if (tools === null || tools === void 0) return null;
	try {
		const prefix = `mcp__${serverName}__`;
		const names = [];
		const layers = tools.layers;
		if (!layers || typeof layers !== "object") return null;
		const candidates = [layers.global, layers.active];
		for (const layer of candidates) {
			if (!layer || typeof layer.tools?.entries !== "function") continue;
			for (const [name] of layer.tools.entries()) {
				if (typeof name === "string" && name.startsWith(prefix)) names.push(name.slice(prefix.length));
			}
		}
		return names.length > 0 ? [...new Set(names)].sort() : null;
	} catch {
		return null;
	}
}

/** The server namespace name for a row. */
function serverNameOf(row) {
	return row.config.serverName || row.id.replace(/^mcp-/, "");
}

/** Build one client-facing server record. */
function serverView(row, runtime, tools) {
	const cfg = row.config;
	const command = [cfg.command, ...(Array.isArray(cfg.args) ? cfg.args : [])]
		.filter((part) => part !== void 0 && part !== "")
		.join(" ");
	const envKeys = cfg.env !== void 0 && typeof cfg.env === "object"
		? Object.keys(cfg.env)
		: [];
	const status = statusOf(row, runtime);
	const serverName = serverNameOf(row);
	return {
		id: row.id,
		serverName,
		transport: cfg.transport || "stdio",
		commandPreview: scrubCommand(command).slice(0, 140),
		command: scrubCommand(command),
		envKeys,
		disabled: row.disabled,
		enabled: !row.disabled,
		status: status.text,
		tone: status.tone,
		toolNames: toolsFor(tools, serverName)
	};
}

/** Cordis FiberState enum mirror (numeric, like the Loader reports). */
const FIBER_STATE = { PENDING: 0, LOADING: 1, ACTIVE: 2, FAILED: 3, DISPOSED: 4, UNLOADING: 5 };
/** Map a numeric FiberState to a phase name (DISPOSED → null). */
function fiberPhaseOf(state) {
	switch (state) {
		case FIBER_STATE.PENDING: return "pending";
		case FIBER_STATE.LOADING: return "loading";
		case FIBER_STATE.ACTIVE: return "active";
		case FIBER_STATE.FAILED: return "failed";
		case FIBER_STATE.DISPOSED: return null;
		case FIBER_STATE.UNLOADING: return "unloading";
		default: return null;
	}
}

/** Build the runtime map from the Loader (entry id → { enabled, fiberPhase }). */
function runtimeMap(ctx) {
	const map = new Map();
	for (const entry of ctx.loader.entries()) {
		if (entry.options.name !== MCP_MODULE) continue;
		const id = typeof entry.id === "string" ? entry.id : entry.options.id;
		map.set(id, {
			enabled: !entry.disabled,
			fiberPhase: entry.fiber === void 0 ? null : fiberPhaseOf(entry.fiber.state)
		});
	}
	return map;
}

/** Read the full MCP list for the client. */
function readMcpList(ctx) {
	const { rows } = readMcpRows();
	const runtime = runtimeMap(ctx);
	return rows.map((row) => serverView(row, runtime.get(row.id), ctx.tools));
}

/** Toggle one row's `disabled` flag in the patch file (applies on restart). */
function setMcpEnabled(id, enabled) {
	const { rows, text, lines } = readMcpRows();
	const row = rows.find((r) => r.id === id);
	if (row === void 0) throw new Error(`no mcp server with id ${id}`);
	const wantDisabled = !enabled;
	if (row.disabled === wantDisabled) return;
	let out = lines.slice();
	const nameIdx = out.slice(row.blockStart, row.blockEnd).findIndex((l) => /name:\s*['"]@deepseek-ai\/dsh-mcp-client['"]/.test(l));
	if (wantDisabled) {
		// insert `disabled: true` right after the row's name line
		const at = row.blockStart + nameIdx + 1;
		const indent = (out[at - 1].match(/^\s*/)?.[0].length ?? 0) + 2;
		out.splice(at, 0, `${" ".repeat(indent)}disabled: true`);
	} else {
		// remove the row's `disabled: true` line
		out = out.filter((l, i) => !(i >= row.blockStart && i < row.blockEnd && /^\s*disabled:\s*true\s*$/.test(l)));
	}
	writeFileSync(join(dshHome(), "cordis.patch.yml"), out.join("\n"), "utf8");
}

/** Remove one row block from the patch file (applies on restart). */
function removeMcpRow(id) {
	const { rows, lines } = readMcpRows();
	const row = rows.find((r) => r.id === id);
	if (row === void 0) throw new Error(`no mcp server with id ${id}`);
	const out = lines.slice(0, row.blockStart).concat(lines.slice(row.blockEnd));
	writeFileSync(join(dshHome(), "cordis.patch.yml"), out.join("\n"), "utf8");
}
//#endregion

//#region Background-jobs manager
/**
 * One background job as the QoL client sees it: the public snapshot plus the
 * owning session when the job is session-owned. `reported` and output limits
 * are internal bookkeeping with no human meaning and are dropped.
 */
function jobView(snapshot) {
	return {
		id: snapshot.id,
		kind: snapshot.kind,
		label: snapshot.label,
		status: snapshot.status,
		...snapshot.detail !== void 0 ? { detail: snapshot.detail } : {},
		startedAt: snapshot.startedAt,
		...snapshot.finishedAt !== void 0 ? { finishedAt: snapshot.finishedAt } : {},
		...snapshot.ownerSession !== void 0 ? { ownerSession: snapshot.ownerSession } : {}
	};
}

/**
 * List every background job the QoL surface may show: unowned jobs (open to
 * any caller) plus the jobs owned by each live session, resolved through the
 * exact live Agent so the registry's session fence is honored. Deduped by id,
 * preferring the row that carries an ownerSession. Defensive per session —
 * a teardown race never fails the whole list.
 * @param ctx - host plugin context (jobs, agents, sessions services).
 * @returns public job views, newest first.
 */
function listJobs(ctx) {
	const jobs = ctx.jobs;
	if (jobs === void 0 || jobs === null) throw new Error("background job registry unavailable");
	const byId = new Map();
	const absorb = (snapshot, sessionId) => {
		// Ownership is read from the snapshot's own marker (the registry's
		// snapshot() emits ownerSession for owned jobs); the passed sessionId is
		// only a fallback when the registry omits it. Unowned jobs re-listed by an
		// owned caller therefore never pick up that caller's session id.
		const row = jobView(snapshot);
		const prior = byId.get(row.id);
		if (prior === void 0 || (prior.ownerSession === void 0 && row.ownerSession !== void 0)) {
			byId.set(row.id, row.ownerSession !== void 0 ? row : (sessionId !== void 0 ? { ...row, ownerSession: sessionId } : row));
		}
	};
	try {
		for (const snapshot of jobs.list(void 0)) absorb(snapshot);
	} catch {
		/* unowned read failed; owned reads below still contribute */
	}
	if (ctx.sessions !== void 0 && typeof ctx.sessions.list === "function") {
		for (const session of ctx.sessions.list()) {
			let agent;
			try {
				agent = ctx.agents?.get(session.id);
			} catch {
				agent = void 0;
			}
			if (agent === void 0 || agent === null) continue;
			try {
				for (const snapshot of jobs.list(agent)) absorb(snapshot, session.id);
			} catch {
				/* a torn-down session's read can fail; skip it */
			}
		}
	}
	return [...byId.values()].sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * Terminate one background job by id, scoped to its owning session. The caller
 * is resolved to the live Agent of that session (never fabricated), matching
 * the registry's authorization model exactly.
 * @param ctx - host plugin context.
 * @param id - registry job id.
 * @param sessionId - owning session id (may be absent for unowned jobs).
 * @param reason - forwarded to the producer.
 * @returns `requested` for live work, `already-finished` for a settled job.
 */
function killJob(ctx, id, sessionId, reason) {
	const jobs = ctx.jobs;
	if (jobs === void 0 || jobs === null) throw new Error("background job registry unavailable");
	if (typeof id !== "string" || id.length === 0) throw new Error("job id is required");
	const caller = sessionId !== void 0 ? ctx.agents?.get(sessionId) : void 0;
	return jobs.kill(id, caller, reason);
}
//#endregion

/** Read the JSON request body (bounded). */
function readBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > 64 * 1024) {
				reject(new Error("body too large"));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => {
			try {
				resolve(chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString("utf8")));
			} catch (error) {
				reject(error);
			}
		});
		req.on("error", reject);
	});
}

/**
 * Mount the routes.
 * @param ctx - host plugin context carrying webServer and loader.
 */
function apply(ctx) {
	ctx.effect(() => {
		const disposePrefs = ctx.webServer.register({
			kind: "exact",
			path: "/dsh-qol/prefs",
			handler: async (req, res) => {
				const json = (value, status = 200) => {
					res.writeHead(status, {
						"content-type": "application/json; charset=utf-8",
						"cache-control": "no-cache"
					});
					res.end(JSON.stringify(value));
				};
				if (req.method === "GET" || req.method === "HEAD") {
					json({ ok: true, prefs: readPrefs() });
					return;
				}
				if (req.method === "PUT") {
					try {
						const body = await readBody(req);
						json({ ok: true, prefs: writePrefs(body) });
					} catch (error) {
						json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
					}
					return;
				}
				res.writeHead(405);
				res.end();
			}
		});

		const disposeMcp = ctx.webServer.register({
			kind: "prefix",
			path: "/dsh-qol/mcp",
			handler: async (req, res) => {
				const json = (value, status = 200) => {
					res.writeHead(status, {
						"content-type": "application/json; charset=utf-8",
						"cache-control": "no-cache"
					});
					res.end(JSON.stringify(value));
				};
				const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
				const id = pathname.startsWith("/dsh-qol/mcp/") ? pathname.slice("/dsh-qol/mcp/".length) : null;
				try {
					if (req.method === "GET" || req.method === "HEAD") {
						json({ ok: true, servers: readMcpList(ctx) });
						return;
					}
					if (req.method === "PUT" && id !== null) {
						const body = await readBody(req);
						setMcpEnabled(id, body.enabled === true);
						json({ ok: true, servers: readMcpList(ctx) });
						return;
					}
					if (req.method === "DELETE" && id !== null) {
						removeMcpRow(id);
						json({ ok: true, servers: readMcpList(ctx) });
						return;
					}
					res.writeHead(405);
					res.end();
				} catch (error) {
					json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
				}
			}
		});

		const disposeJobs = ctx.webServer.register({
			kind: "exact",
			path: "/dsh-qol/jobs",
			handler: async (req, res) => {
				const json = (value, status = 200) => {
					res.writeHead(status, {
						"content-type": "application/json; charset=utf-8",
						"cache-control": "no-cache"
					});
					res.end(JSON.stringify(value));
				};
				try {
					if (req.method === "GET" || req.method === "HEAD") {
						json({ ok: true, jobs: listJobs(ctx) });
						return;
					}
					if (req.method === "POST") {
						const body = await readBody(req);
						const result = killJob(ctx, body.id, body.sessionId, body.reason ?? "terminated from QoL");
						json({ ok: true, result, jobs: listJobs(ctx) });
						return;
					}
					res.writeHead(405);
					res.end();
				} catch (error) {
					json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
				}
			}
		});

		return () => { disposePrefs(); disposeMcp(); disposeJobs(); };
	}, "dsh-qol: routes");
}
//#endregion
export { apply, inject, name };
