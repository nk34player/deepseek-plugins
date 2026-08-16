// Host-half smoke test for DSH-QoL: run apply() with a fake webServer,
// exercise GET/PUT /dsh-qol/prefs against a stub home dir (no real ~/.dsh
// writes).
const path = require("path");
const os = require("os");
const fs = require("fs");
const { pathToFileURL } = require("url");

(async () => {
	const mod = await import(pathToFileURL(path.join(__dirname, "..", "lib", "index.js")).href);
	if (mod.name !== "dsh-qol") throw new Error("bad name");
	if (!Array.isArray(mod.inject) || !mod.inject.includes("webServer")) throw new Error("bad inject");

	// stub home under the OS temp dir (outside the real ~/.dsh)
	const stubHome = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-qol-test-"));
	process.env.DSH_HOME = stubHome;

	let route = null;
	const ctx = {
		effect: (fn) => { const d = fn(); if (typeof d === "function") d(); },
		webServer: { register: (r) => { route = r; return () => {}; } }
	};
	mod.apply(ctx);
	if (!route || route.kind !== "exact" || route.path !== "/dsh-qol/prefs") throw new Error("bad route");

	const call = (method, body) => {
		let status = 0, payload = "";
		const res = { writeHead: (s) => { status = s; }, end: (b) => { payload = b; } };
		const req = { method };
		if (body !== undefined) {
			req.emit = null;
			req.on = (ev, cb) => {
				if (ev === "data") { cb(Buffer.from(JSON.stringify(body))); cb(Buffer.alloc(0)); }
				if (ev === "end") setTimeout(cb, 0);
			};
		}
		return route.handler(req, res).then(() => ({ status, payload: JSON.parse(payload) }));
	};

	// GET defaults
	let r = await call("GET");
	if (!r.payload.ok || r.payload.prefs.sessionLogButton !== true || r.payload.prefs.closeBehavior !== "quit") {
		throw new Error("bad GET defaults: " + JSON.stringify(r.payload));
	}
	console.log("GET defaults OK:", JSON.stringify(r.payload.prefs));

	// PUT tray
	r = await call("PUT", { closeBehavior: "tray" });
	if (r.payload.prefs.closeBehavior !== "tray") throw new Error("PUT tray failed");
	const file = fs.readFileSync(path.join(stubHome, "qol-prefs.json"), "utf8");
	if (!file.includes('"closeBehavior": "tray"')) throw new Error("prefs file missing tray");
	console.log("PUT tray persisted to", path.join(stubHome, "qol-prefs.json"));

	// PUT session-log off + GET round-trip
	r = await call("PUT", { sessionLogButton: false });
	if (r.payload.prefs.sessionLogButton !== false) throw new Error("PUT sessionLog failed");
	r = await call("GET");
	if (r.payload.prefs.sessionLogButton !== false || r.payload.prefs.closeBehavior !== "tray") throw new Error("GET round-trip failed");
	console.log("GET round-trip OK:", JSON.stringify(r.payload.prefs));

	// invalid value rejected
	r = await call("PUT", { closeBehavior: "explode" });
	if (r.status !== 400) throw new Error("invalid closeBehavior should 400, got " + r.status);

	fs.rmSync(stubHome, { recursive: true, force: true });
	delete process.env.DSH_HOME;
	console.log("HOST SMOKE TEST PASSED");
})().catch((e) => { console.error("HOST SMOKE TEST FAILED:", e); process.exit(1); });
