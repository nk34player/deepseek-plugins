// Host-half smoke test for DSH-QoL: prefs + MCP manager routes against a
// stub home (a copy of the real ~/.dsh/cordis.patch.yml) and a fake loader.
const path = require("path");
const os = require("os");
const fs = require("fs");
const { pathToFileURL } = require("url");

(async () => {
	const mod = await import(pathToFileURL(path.join(__dirname, "..", "lib", "index.js")).href);
	if (mod.name !== "dsh-qol") throw new Error("bad name");
	if (!mod.inject.includes("webServer") || !mod.inject.includes("loader")) throw new Error("bad inject");

	const stubHome = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-qol-test-"));
	// copy the real patch into the stub home
	fs.copyFileSync("C:/Users/NK34/.dsh/cordis.patch.yml", path.join(stubHome, "cordis.patch.yml"));
	process.env.DSH_HOME = stubHome;

	// fake loader mirroring the 4 mcp rows with runtime state
	const loaderEntries = [
		{ id: "mcp-context7", options: { name: "@deepseek-ai/dsh-mcp-client" }, disabled: false, fiber: { state: 2 } }, // ACTIVE
		{ id: "mcp-fff", options: { name: "@deepseek-ai/dsh-mcp-client" }, disabled: false, fiber: { state: 2 } },
		{ id: "mcp-roblox-studio", options: { name: "@deepseek-ai/dsh-mcp-client" }, disabled: false, fiber: { state: 3 } }, // FAILED
		{ id: "mcp-tavily", options: { name: "@deepseek-ai/dsh-mcp-client" }, disabled: true, fiber: void 0 }, // disabled row
	];
	// fake tool registry with a global layer exposing mcp__<server>__<tool> names
	const fakeTools = {
		layers: {
			global: {
				tools: {
					entries: () => [
						["mcp__context7__query-docs", {}],
						["mcp__context7__resolve-library-id", {}],
						["mcp__fff__find_files", {}],
						["mcp__other__foo", {}],
						["some-global-tool", {}]
					]
				}
			}
		}
	};
	const routes = [];
	const ctx = {
		effect: (fn) => { const d = fn(); if (typeof d === "function") d(); },
		webServer: { register: (r) => { routes.push(r); return () => {}; } },
		loader: { entries: () => loaderEntries },
		tools: fakeTools
	};
	mod.apply(ctx);
	if (routes.length !== 2) throw new Error("expected 2 routes, got " + routes.length);
	const prefsRoute = routes.find((r) => r.kind === "exact" && r.path === "/dsh-qol/prefs");
	const mcpRoute = routes.find((r) => r.kind === "prefix" && r.path === "/dsh-qol/mcp");
	if (!prefsRoute || !mcpRoute) throw new Error("routes missing");

	const call = (route, method, url, body) => {
		let status = 0, payload = "";
		const res = { writeHead: (s) => { status = s; }, end: (b) => { payload = b; } };
		const req = { method, url };
		if (body !== undefined) {
			req.on = (ev, cb) => {
				if (ev === "data") { cb(Buffer.from(JSON.stringify(body))); cb(Buffer.alloc(0)); }
				if (ev === "end") setTimeout(cb, 0);
			};
		}
		return route.handler(req, res).then(() => ({ status, payload: payload === "" ? null : JSON.parse(payload) }));
	};

	// --- MCP list ---
	let r = await call(mcpRoute, "GET", "/dsh-qol/mcp");
	const servers = r.payload.servers;
	if (servers.length !== 4) throw new Error("expected 4 servers, got " + servers.length);
	const context7 = servers.find((s) => s.id === "mcp-context7");
	if (context7.serverName !== "context7" || context7.transport !== "stdio") throw new Error("bad context7");
	if (context7.status !== "available · running") throw new Error("bad context7 status: " + context7.status);
	if (!Array.isArray(context7.envKeys) || !context7.envKeys.includes("CONTEXT7_API_KEY")) throw new Error("envKeys missing");
	// secret must NOT appear in command preview
	if (context7.command.includes("ctx7sk") || context7.commandPreview.includes("ctx7sk")) throw new Error("secret leaked in command");
	// tavily key must be scrubbed
	const tavily = servers.find((s) => s.id === "mcp-tavily");
	if (tavily.status !== "disabled" || tavily.command.includes("tvly-dev") || !tavily.command.includes("********")) {
		throw new Error("tavily scrub/status failed: " + JSON.stringify({ status: tavily.status, cmd: tavily.command }));
	}
	const roblox = servers.find((s) => s.id === "mcp-roblox-studio");
	if (roblox.status !== "error") throw new Error("bad roblox status: " + roblox.status);
	// tool enumeration from the fake registry
	if (!Array.isArray(context7.toolNames) || context7.toolNames.length !== 2) throw new Error("bad context7 toolNames: " + JSON.stringify(context7.toolNames));
	if (!context7.toolNames.includes("query-docs") || !context7.toolNames.includes("resolve-library-id")) throw new Error("context7 toolNames wrong");
	if (roblox.toolNames !== null) throw new Error("roblox should have null toolNames (no tools registered)");
	console.log("MCP list OK:", servers.map((s) => `${s.serverName}:${s.status}(${Array.isArray(s.toolNames) ? s.toolNames.length : "?"} tools)`).join(", "));

	// --- toggle disable context7 (writes stub file) ---
	r = await call(mcpRoute, "PUT", "/dsh-qol/mcp/mcp-context7", { enabled: false });
	const afterDisable = r.payload.servers.find((s) => s.id === "mcp-context7");
	if (afterDisable.status !== "disabled") throw new Error("toggle disable failed: " + afterDisable.status);
	const file = fs.readFileSync(path.join(stubHome, "cordis.patch.yml"), "utf8");
	if (!/disabled: true/.test(file)) throw new Error("disabled flag not written");
	console.log("toggle disable OK");

	// --- re-enable ---
	r = await call(mcpRoute, "PUT", "/dsh-qol/mcp/mcp-context7", { enabled: true });
	if (r.payload.servers.find((s) => s.id === "mcp-context7").status !== "available · running") throw new Error("re-enable failed");
	console.log("re-enable OK");

	// --- remove tavily ---
	r = await call(mcpRoute, "DELETE", "/dsh-qol/mcp/mcp-tavily");
	if (r.payload.servers.some((s) => s.id === "mcp-tavily")) throw new Error("remove failed");
	if (r.payload.servers.length !== 3) throw new Error("expected 3 after remove");
	console.log("remove OK");

	// --- unknown id -> 400 ---
	r = await call(mcpRoute, "DELETE", "/dsh-qol/mcp/mcp-nope");
	if (r.status !== 400) throw new Error("unknown id should 400, got " + r.status);
	console.log("unknown id -> 400 OK");

	// --- prefs still fine ---
	r = await call(prefsRoute, "GET", "/dsh-qol/prefs");
	if (!r.payload.ok || r.payload.prefs.closeBehavior !== "quit") throw new Error("prefs broken after MCP ops");

	fs.rmSync(stubHome, { recursive: true, force: true });
	delete process.env.DSH_HOME;
	console.log("HOST SMOKE TEST PASSED");
})().catch((e) => { console.error("HOST SMOKE TEST FAILED:", e); process.exit(1); });
