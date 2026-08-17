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
const PREF_GET = { sessionLogButton: false };
const MCP_SERVERS = [
	{ id: "mcp-context7", serverName: "context7", transport: "stdio", command: "node server.js --key ********", commandPreview: "node server.js --key ********", envKeys: ["CONTEXT7_API_KEY"], enabled: true, status: "available · running", tone: "available" },
	{ id: "mcp-tavily", serverName: "tavily", transport: "stdio", command: "node proxy.js", commandPreview: "node proxy.js", envKeys: [], enabled: false, status: "disabled", tone: "disabled" }
];
const JOBS = [
	{ id: "bash-1", kind: "bash", label: "sleep 10", status: "running", startedAt: 1000 },
	{ id: "bash-2", kind: "bash", label: "echo hi", status: "completed", ownerSession: "sess-A", startedAt: 2000, finishedAt: 3000 }
];
const killedIds = [];
global.fetch = async (url, init) => {
	const u = String(url);
	const method = init && typeof init.method === "string" ? init.method : "GET";
	if (u.includes("/dsh-qol/jobs")) {
		if (method === "POST") {
			killedIds.push(JSON.parse(init.body).id);
		}
		return { ok: true, json: async () => ({ ok: true, jobs: JOBS }) };
	}
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

const mod = captured.factory((spec) => {
	if (spec === "react") return reactStub;
	throw new Error("unexpected require: " + spec);
});
if (mod.name !== "dsh-qol") throw new Error("bad name");
if (typeof mod.apply !== "function") throw new Error("bad apply");

// --- run apply with a slots stub (settings.section + sidebar.footer.action) ---
const registrations = [];
const slots = {
	inject: (name, cb) => {
		if (name !== "settings.section" && name !== "sidebar.footer.action") throw new Error("bad slot " + name);
		cb();
	},
	register: (opts, comp) => registrations.push({ opts, comp })
};
mod.apply({ get: (n) => (n === "slots" ? slots : undefined) });
if (registrations.length !== 2) throw new Error("expected 2 registrations, got " + registrations.length);
const secReg = registrations.find((r) => r.opts.id === "qol");
const actionReg = registrations.find((r) => r.opts.id === "background-jobs");
if (!secReg || secReg.opts.order !== 30 || secReg.opts.label !== "QoL") throw new Error("bad settings registration");
if (!actionReg || actionReg.opts.name !== "sidebar.footer.action" || actionReg.opts.order !== 10) throw new Error("bad footer-action registration");
console.log("registration OK: settings.section id=qol order=30 + sidebar.footer.action id=background-jobs");

reactStub.__reset();
const tree = secReg.comp({ close: () => {} });
hookStore.effects.forEach((fn) => fn());

setTimeout(() => {
	if (headChildren.filter((el) => el._removed !== true).length !== 1) throw new Error("launch stylesheet not injected");
	const liveStyle = headChildren.find((el) => el._removed !== true);
	if (!liveStyle || liveStyle.tag !== "style") throw new Error("launch stylesheet not injected");
	if (!liveStyle.textContent.includes("conversation.session.header.utilities")) throw new Error("launch stylesheet targets wrong slot");
	console.log("launch apply OK: session-log button hidden via injected stylesheet");

	reactStub.__beginRender();
	const settled = secReg.comp({ close: () => {} });
	const json = JSON.stringify(settled);
	if (!json.includes("Session log button")) throw new Error("missing session-log row");
	if (!json.includes("QoL")) throw new Error("missing page title");
	// background jobs moved out of settings: no toggle, no manager row, no close-behavior control
	if (json.includes("Control Background Jobs")) throw new Error("control-background-jobs toggle should be removed from settings");
	if (json.includes("When closing window") || json.includes("Keep Running") || json.includes("Quit")) {
		throw new Error("close-behavior control should be removed");
	}
	console.log("settings renders session-log switch only (jobs moved out) OK");

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
	console.log("structure OK: 1 switch in settings");

	// --- MCP manager: open the list view (still in settings) ---
	reactStub.__beginRender();
	const listTree = secReg.comp({ close: () => {} });
	const walk2 = (node, out) => {
		if (!node || typeof node !== "object") return;
		if (node.props && typeof node.props.onClick === "function") out.push(node);
		if (Array.isArray(node.children)) node.children.forEach((c) => walk2(c, out));
	};
	const clickables = [];
	walk2(listTree, clickables);
	const mcpNav = clickables.find((n) => JSON.stringify(n).includes("MCP servers"));
	if (!mcpNav) throw new Error("MCP servers row not found");
	mcpNav.props.onClick();
	setTimeout(() => {
		reactStub.__beginRender();
		const mcpList = secReg.comp({ close: () => {} });
		const mcpViewEl = findElement(mcpList, (n) => n.props && Array.isArray(n.props.servers) && n.props.servers.length === 2);
		if (!mcpViewEl) throw new Error("McpListView not rendered with servers");
		if (mcpViewEl.props.servers[0].serverName !== "context7") throw new Error("context7 missing");
		if (mcpViewEl.props.servers[1].status !== "disabled") throw new Error("tavily status wrong");
		console.log("MCP list view OK: servers =", mcpViewEl.props.servers.map((s) => s.serverName).join(", "));

		// --- Background-jobs footer action: render, click to open the modal, terminate ---
		reactStub.__reset();
		const actionTree = actionReg.comp({ wide: true });
		hookStore.effects.forEach((fn) => fn());
		setTimeout(() => {
			reactStub.__beginRender();
			const actionSettled = actionReg.comp({ wide: true });
			const actionJson = JSON.stringify(actionSettled);
			if (!actionJson.includes("Background jobs")) throw new Error("footer action missing label");
			// click the trigger button -> opens the modal (fetch jobs)
			const trigger = findElement(actionSettled, (n) => n.props && typeof n.props.onClick === "function" && n.props["aria-label"] === "Background jobs");
			if (!trigger) throw new Error("trigger button not found");
			trigger.props.onClick();
			setTimeout(() => {
				reactStub.__beginRender();
				const opened = actionReg.comp({ wide: true });
				// JobsModal is a component element; find it by its props shape
				const modal = findElement(opened, (n) => n.props && Array.isArray(n.props.jobs) && n.props.jobs.length === 2);
				if (!modal) throw new Error("jobs modal not rendered");
				if (modal.props.jobs[0].id !== "bash-1" || modal.props.jobs[1].status !== "completed") throw new Error("jobs data wrong in modal");
				console.log("jobs modal OK: list rendered after clicking footer action");
				// terminate a live job via the modal's onTerminate prop -> POST /dsh-qol/jobs
				modal.props.onTerminate({ id: "bash-1", ownerSession: undefined });
				setTimeout(() => {
					if (!killedIds.includes("bash-1")) throw new Error("terminate did not POST");
					console.log("terminate routed OK from modal");
					console.log("SMOKE TEST PASSED");
				}, 20);
			}, 20);
		}, 20);
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
