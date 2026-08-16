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
	__reset: () => { hookStore.states = []; hookStore.effects = []; hookStore.cursor = 0; },
	__beginRender: () => { hookStore.cursor = 0; }
};

// --- stub window + document (for the stylesheet injection) ---
const headChildren = [];
global.window = {
	__ModuleLoader__: { load: (o) => { captured = o; } },
	dshDesktop: { setCloseBehavior: (b) => { window._bridgeCalls.push(b); } }
};
global.window._bridgeCalls = [];
global.document = {
	createElement: (tag) => ({ tag, textContent: "", dataset: {}, remove() { this._removed = true; } }),
	head: { appendChild: (el) => headChildren.push(el) }
};

let captured = null;
require(path.join(__dirname, "..", "lib", "client.js"));
if (!captured) throw new Error("bundle did not call __ModuleLoader__.load");
if (captured.id !== "@deepseek-ai/dsh-qol") throw new Error("bad id: " + captured.id);

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

// --- render the section with stubbed fetch + hooks ---
global.fetch = async (url, init) => {
	if (init === undefined) {
		return { ok: true, json: async () => ({ ok: true, prefs: { sessionLogButton: true, closeBehavior: "quit" } }) };
	}
	const body = JSON.parse(init.body);
	return { ok: true, json: async () => ({ ok: true, prefs: { sessionLogButton: body.sessionLogButton ?? true, closeBehavior: body.closeBehavior ?? "quit" } }) };
};

reactStub.__reset();
const tree = reg.comp({ close: () => {} });
hookStore.effects.forEach((fn) => fn());

setTimeout(() => {
	reactStub.__beginRender();
	const settled = reg.comp({ close: () => {} });
	const json = JSON.stringify(settled);
	if (!json.includes("Session log button")) throw new Error("missing session-log row");
	if (!json.includes("Minimize to tray on close")) throw new Error("missing tray row");
	if (!json.includes("QoL")) throw new Error("missing page title");
	console.log("section renders both toggles OK");

	// flip the tray switch: find the Switch elements (unrendered components
	// carry onChange + checked props) and invoke the tray one
	const switches = [];
	const walk = (node) => {
		if (!node || typeof node !== "object") return;
		if (node.props && typeof node.props.onChange === "function" && "checked" in node.props) switches.push(node);
		if (Array.isArray(node.children)) node.children.forEach(walk);
	};
	walk(settled);
	if (switches.length !== 2) throw new Error("expected 2 switches, got " + switches.length);
	const traySwitch = switches.find((s) => String(s.props.label ?? s.props["aria-label"] ?? "").includes("tray"));
	traySwitch.props.onChange(true);
	setTimeout(() => {
		if (window._bridgeCalls.length !== 1 || window._bridgeCalls[0] !== "tray") {
			throw new Error("desktop bridge not called with 'tray': " + JSON.stringify(window._bridgeCalls));
		}
		console.log("tray toggle -> desktop bridge called with 'tray'");
		console.log("SMOKE TEST PASSED");
	}, 50);
}, 50);
