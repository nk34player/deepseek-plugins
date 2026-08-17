// Smoke test for DSH-QoL client bundle (node, no browser).
const path = require("path");

// --- mini react stub with hooks ---
const hookStore = { states: [], effects: [], cursor: 0 };
const reactStub = {
	createElement: (type, props, ...children) => ({ type, props, children }),
	useState: (init) => {
		const i = hookStore.cursor++;
		if (hookStore.states[i] === undefined) hookStore.states[i] = typeof init === "function" ? init() : init;
		return [hookStore.states[i], (v) => { hookStore.states[i] = typeof v === "function" ? v(hookStore.states[i]) : v; }];
	},
	useEffect: (fn) => { hookStore.effects.push(fn); },
	useCallback: (fn) => fn,
	__reset: () => { hookStore.states = []; hookStore.effects = []; hookStore.cursor = 0; },
	__beginRender: () => { hookStore.cursor = 0; }
};

// --- stub window + document (for the stylesheet injection) ---
const headChildren = [];
global.window = {
	__ModuleLoader__: { load: (o) => { captured = o; } }
};
global.document = {
	createElement: (tag) => ({ tag, textContent: "", dataset: {}, remove() { this._removed = true; } }),
	head: { appendChild: (el) => headChildren.push(el) }
};

let captured = null;
require(path.join(__dirname, "..", "lib", "client.js"));
if (!captured) throw new Error("bundle did not call __ModuleLoader__.load");
if (captured.id !== "@deepseek-ai/dsh-qol") throw new Error("bad id: " + captured.id);

// --- stub fetch BEFORE apply: applyPrefsOnLaunch() runs inside apply() ---
// The launch apply retries when the fetch fails (host route still booting);
// here the route is always up so the first attempt must succeed.
const PREF_GET = { sessionLogButton: false };
global.fetch = async (url, init) => {
	const u = String(url);
	const method = init && typeof init.method === "string" ? init.method : "GET";
	if (u.includes("/dsh-qol/mcp")) {
		return { ok: true, json: async () => ({ ok: true, servers: MCP_SERVERS }) };
	}
	// /dsh-qol/prefs
	if (method === "GET") {
		return { ok: true, json: async () => ({ ok: true, prefs: PREF_GET }) };
	}
	const body = JSON.parse(init.body);
	return { ok: true, json: async () => ({ ok: true, prefs: { sessionLogButton: body.sessionLogButton ?? true } }) };
};
const MCP_SERVERS = [
	{ id: "mcp-context7", serverName: "context7", transport: "stdio", command: "node server.js --key ********", commandPreview: "node server.js --key ********", envKeys: ["CONTEXT7_API_KEY"], enabled: true, status: "available · running", tone: "available" },
	{ id: "mcp-tavily", serverName: "tavily", transport: "stdio", command: "node proxy.js", commandPreview: "node proxy.js", envKeys: [], enabled: false, status: "disabled", tone: "disabled" }
];

const mod = captured.factory((spec) => {
	if (spec === "react") return reactStub;
	throw new Error("unexpected require: " + spec);
});
if (mod.name !== "dsh-qol") throw new Error("bad name");
if (typeof mod.apply !== "function") throw new Error("bad apply");

// --- run apply with a slots stub ---
const registrations = [];
const slots = {
	inject: (name, cb) => { if (name !== "settings.section") throw new Error("bad slot " + name); cb(); },
	register: (opts, comp) => registrations.push({ opts, comp })
};
mod.apply({ get: (n) => (n === "slots" ? slots : undefined) });
if (registrations.length !== 1) throw new Error("expected 1 registration");
const reg = registrations[0];
if (reg.opts.id !== "qol" || reg.opts.order !== 30 || reg.opts.label !== "QoL") throw new Error("bad registration opts");
console.log("registration OK: settings.section id=qol order=30");

// applyPrefsOnLaunch: the launch fetch resolves (pref says sessionLogButton=false),
// so a stylesheet hiding the session-log button is injected once microtasks run
// (asserted inside the setTimeout below).

reactStub.__reset();
const tree = reg.comp({ close: () => {} });
hookStore.effects.forEach((fn) => fn());

setTimeout(() => {
	if (headChildren.filter((el) => el._removed !== true).length !== 1) throw new Error("launch stylesheet not injected");
	const liveStyle = headChildren.find((el) => el._removed !== true);
	if (!liveStyle || liveStyle.tag !== "style") throw new Error("launch stylesheet not injected");
	if (!liveStyle.textContent.includes("conversation.session.header.utilities")) throw new Error("launch stylesheet targets wrong slot");
	console.log("launch apply OK: session-log button hidden via injected stylesheet");

	reactStub.__beginRender();
	const settled = reg.comp({ close: () => {} });
	const json = JSON.stringify(settled);
	if (!json.includes("Session log button")) throw new Error("missing session-log row");
	if (!json.includes("QoL")) throw new Error("missing page title");
	if (json.includes("When closing window") || json.includes("Keep Running") || json.includes("Quit")) {
		throw new Error("close-behavior control should be removed");
	}
	console.log("section renders switch only (no close-behavior control) OK");

	// exactly one Switch (session log), no SegmentedControl
	const switches = [];
	const walk = (node) => {
		if (!node || typeof node !== "object") return;
		if (node.props) {
			if (typeof node.props.onChange === "function" && "checked" in node.props) switches.push(node);
			if (Array.isArray(node.props.options) && typeof node.props.onChange === "function") throw new Error("SegmentedControl should be removed");
		}
		if (Array.isArray(node.children)) node.children.forEach(walk);
	};
	walk(settled);
	if (switches.length !== 1) throw new Error("expected 1 switch, got " + switches.length);
	console.log("structure OK: 1 switch");

	// --- MCP manager: open the list view ---
	reactStub.__beginRender();
	const listTree = reg.comp({ close: () => {} });
	const walk2 = (node, out) => {
		if (!node || typeof node !== "object") return;
		if (node.props && typeof node.props.onClick === "function") out.push(node);
		if (Array.isArray(node.children)) node.children.forEach((c) => walk2(c, out));
	};
	const clickables = [];
	walk2(listTree, clickables);
	// the MCP servers row is the div with onClick that switches view
	const mcpNav = clickables.find((n) => JSON.stringify(n).includes("MCP servers"));
	if (!mcpNav) throw new Error("MCP servers row not found");
	mcpNav.props.onClick();
	setTimeout(() => {
		reactStub.__beginRender();
		const mcpList = reg.comp({ close: () => {} });
		// McpListView is a component element; find it by its props shape
		const mcpViewEl = findElement(mcpList, (n) => n.props && Array.isArray(n.props.servers) && n.props.servers.length === 2);
		if (!mcpViewEl) throw new Error("McpListView not rendered with servers");
		if (mcpViewEl.props.servers[0].serverName !== "context7") throw new Error("context7 missing");
		if (mcpViewEl.props.servers[1].status !== "disabled") throw new Error("tavily status wrong");
		console.log("MCP list view OK: servers =", mcpViewEl.props.servers.map((s) => s.serverName).join(", "));
		console.log("SMOKE TEST PASSED");
	}, 50);

	function findElement(node, pred) {
		if (!node || typeof node !== "object") return null;
		if (pred(node)) return node;
		if (Array.isArray(node.children)) {
			for (const c of node.children) {
				const found = findElement(c, pred);
				if (found) return found;
			}
		}
		return null;
	}
}, 50);
