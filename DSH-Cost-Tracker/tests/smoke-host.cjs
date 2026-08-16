// Host-half smoke test: run apply() with a fake webServer, capture the
// /cost-tracker/balance route, invoke it, and assert the real relay balance
// comes back (reads ~/.dsh/settings.yaml + .credentials.yaml, calls /v1/usage).
const path = require("path");

(async () => {
	const { pathToFileURL } = await import("node:url");
	const mod = await import(pathToFileURL(path.join(__dirname, "..", "lib", "index.js")).href);
	if (mod.name !== "dsh-cost-tracker") throw new Error("bad name");
	if (!Array.isArray(mod.inject) || !mod.inject.includes("webServer")) throw new Error("bad inject");
	if (typeof mod.apply !== "function") throw new Error("bad apply");

	let route = null;
	const disposers = [];
	const fakeWebServer = {
		register: (r) => { route = r; disposers.push(() => {}); return () => {}; }
	};
	const ctx = {
		effect: (fn) => { const d = fn(); if (typeof d === "function") disposers.push(d); },
		webServer: fakeWebServer
	};
	mod.apply(ctx);
	if (!route) throw new Error("route not registered");
	if (route.kind !== "exact" || route.path !== "/cost-tracker/balance") throw new Error("bad route: " + JSON.stringify(route));

	// invoke the handler with fake req/res
	let status = 0, body = "";
	const res = {
		writeHead: (s) => { status = s; },
		end: (b) => { body = b; }
	};
	await route.handler({ method: "GET" }, res);
	if (status !== 200) throw new Error("bad status " + status);
	const json = JSON.parse(body);
	if (!json.ok || !Array.isArray(json.providers)) throw new Error("bad json");
	console.log("providers:", JSON.stringify(json.providers, null, 2));
	const qyk = json.providers.find((p) => p.provider === "qyk888");
	if (!qyk) throw new Error("qyk888 not found in providers");
	if (typeof qyk.balance !== "number" || qyk.balance <= 0) throw new Error("bad balance: " + JSON.stringify(qyk));
	if (qyk.error) throw new Error("qyk888 errored: " + qyk.error);
	console.log("HOST SMOKE TEST PASSED (balance =", qyk.balance, qyk.unit + ")");
})().catch((e) => { console.error("HOST SMOKE TEST FAILED:", e); process.exit(1); });
