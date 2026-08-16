// Smoke test for DSH-Cost-Tracker client bundle (node, no browser).
const path = require("path");

// --- mini react stub with hooks (global store, driven by the test) ---
const hookStore = { states: [], effects: [], cursor: 0 };
const reactStub = {
	createElement: (type, props, ...children) => ({ type, props, children }),
	useState: (init) => {
		const i = hookStore.cursor++;
		if (hookStore.states[i] === undefined) hookStore.states[i] = typeof init === "function" ? init() : init;
		return [hookStore.states[i], (v) => { hookStore.states[i] = typeof v === "function" ? v(hookStore.states[i]) : v; }];
	},
	useCallback: (fn) => fn,
	useEffect: (fn) => { hookStore.effects.push(fn); },
	__reset: () => { hookStore.states = []; hookStore.effects = []; hookStore.cursor = 0; },
	__beginRender: () => { hookStore.cursor = 0; }
};

// --- stub window.__ModuleLoader__ ---
let captured = null;
global.window = {
	__ModuleLoader__: {
		load: (o) => { captured = o; }
	}
};

require(path.join(__dirname, "..", "lib", "client.js"));
if (!captured) throw new Error("bundle did not call __ModuleLoader__.load");
if (captured.id !== "@deepseek-ai/dsh-cost-tracker") throw new Error("bad id: " + captured.id);

const factory = captured.factory;
const req = (spec) => {
	if (spec === "react") return reactStub;
	throw new Error("unexpected require: " + spec);
};
const mod = factory(req);
if (typeof mod.apply !== "function") throw new Error("exports.apply missing");
if (mod.name !== "dsh-cost-tracker") throw new Error("bad name");

// --- stub slots service; run apply ---
const registrations = [];
const slots = {
	inject: (name, cb) => {
		if (!["conversation.composer.dock", "settings.section"].includes(name)) throw new Error("inject bad slot: " + name);
		cb();
	},
	register: (opts, comp) => registrations.push({ opts, comp })
};
mod.apply({ get: (n) => (n === "slots" ? slots : undefined) });
if (registrations.length !== 2) throw new Error("expected 2 registrations, got " + registrations.length);

const dockReg = registrations.find((r) => r.opts.name === "conversation.composer.dock");
const sectionReg = registrations.find((r) => r.opts.name === "settings.section");
if (!dockReg || dockReg.opts.id !== "cost-tracker-dock" || dockReg.opts.order !== 10) throw new Error("bad dock reg");
if (!sectionReg || sectionReg.opts.id !== "cost-tracker" || sectionReg.opts.order !== 20 || sectionReg.opts.label !== "Cost Tracker") throw new Error("bad section reg");
console.log("registrations OK: dock(cost-tracker-dock) + section(cost-tracker)");

// --- render the dock component with fake session + projection data ---
const nodes = [
	{ kind: "user", seq: 0, turn: 1, content: [] },
	{ kind: "assistant", seq: 1, turn: 1, step: 0, usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 5000, cacheWriteTokens: 0 }, provenance: { provider: "qyk888", model: "deepseek-v4-flash" } },
	{ kind: "assistant", seq: 2, turn: 1, step: 1, usage: { inputTokens: 500, outputTokens: 100, cacheReadTokens: 2000, cacheWriteTokens: 0 }, requestConfig: { provider: "qyk888", model: "deepseek-v4-flash" } },
	{ kind: "assistant", seq: 3, turn: 2, step: 0, usage: { inputTokens: 2000, outputTokens: 400, cacheReadTokens: 10000, cacheWriteTokens: 0 }, provenance: { provider: "qyk888", model: "deepseek-v4-pro" } },
	{ kind: "assistant", seq: 4, turn: 2, step: 1, interrupted: true },
];
const projTotal = { uncachedInputTokens: 3500, outputTokens: 700, cacheReadTokens: 17000, cacheWriteTokens: 0 };

const dockProps = {
	useSession: (sel) => sel({ nodes }),
	useProjection: (k) => (k === "tokenUsage" ? projTotal : undefined)
};
reactStub.__reset();
const el = dockReg.comp(dockProps);
if (!el || el.type !== "div") throw new Error("render did not produce div");
const spans = el.children.filter((c) => c && typeof c === "object");
const text = spans.map((s) => s.children.filter((c) => typeof c === "string").join("")).join(" | ");
console.log("dock line:", text);
if (!text.includes("💰") || !text.includes("💵") || !text.includes("Total")) throw new Error("dock emojis/labels missing");

// --- render the settings section with stubbed fetch (drives the global hook store) ---
global.fetch = async () => ({
	ok: true,
	json: async () => ({ ok: true, providers: [
		{ provider: "qyk888", name: "qyk888", balance: 2.65303536, unit: "USD" },
		{ provider: "broken", name: "broken", error: "missing key for BROKEN_KEY" }
	] })
});

// helper: collect all string text under a tree
function collectStrings(node, out) {
	if (node === null || node === undefined || typeof node === "boolean") return;
	if (typeof node === "string") { out.push(node); return; }
	if (Array.isArray(node)) { for (const child of node) collectStrings(child, out); return; }
	if (typeof node === "object" && node.props) {
		if (node.props.type === "button") out.push("[button:" + (Array.isArray(node.props.children) ? node.props.children.flat(2).join("") : String(node.props.children ?? "")) + "]");
		collectStrings(node.props.children, out);
	}
}

reactStub.__reset();
sectionReg.comp({ close: () => {} });
// run mount effects (the load() fetch starts), then let the fetch microtasks settle
hookStore.effects.forEach((fn) => fn());
setTimeout(() => {
	reactStub.__beginRender();
	const settled = sectionReg.comp({ close: () => {} });
	const strings = [];
	collectStrings(settled, strings);
	const joined = strings.join(" ");
	const json = JSON.stringify(settled);
	console.log("section text:", joined || "(collector empty; asserting on JSON)");
	if (!json.includes("💰")) throw new Error("section missing 💰 balance");
	if (!json.includes("Refresh")) throw new Error("section missing Refresh button");
	if (!json.includes("qyk888")) throw new Error("section missing provider name");
	if (!json.includes("2.65")) throw new Error("section missing balance value");
	if (!json.includes("Custom")) throw new Error("section missing Custom tag");
	if (!json.includes("missing key")) throw new Error("section missing per-row error");
	console.log("SMOKE TEST PASSED");
}, 50);
