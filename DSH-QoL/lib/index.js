//#region lib/types/index.js
/**
 * DSH-QoL (dsh-qol), host half.
 *
 * Two jobs:
 *  1. Activate in the host Loader so client-modules discovers the browser half.
 *  2. Serve GET/PUT /dsh-qol/prefs — persist the QoL preferences to
 *     ~/.dsh/qol-prefs.json. That file is ALSO the hook the desktop shell
 *     (deepseek-harness-desktop) reads to decide close behavior: "tray" hides
 *     the window to the system tray, "quit" quits the app completely.
 *
 * Preferences shape:
 *   { sessionLogButton: boolean,   // show/hide the Session log download button
 *     closeBehavior: "tray" | "quit" }
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/** Cordis plugin name. */
const name = "dsh-qol";
/** Required services: the web route registry. */
const inject = ["webServer"];

/** Resolve the harness home (env override, else ~/.dsh). */
function dshHome() {
	return process.env.DSH_HOME || join(homedir(), ".dsh");
}

/** Defaults applied when the prefs file is absent or malformed. */
function defaultPrefs() {
	return { sessionLogButton: true, closeBehavior: "quit" };
}

/** Read the prefs file, merging defaults. */
function readPrefs() {
	const path = join(dshHome(), "qol-prefs.json");
	try {
		const raw = JSON.parse(readFileSync(path, "utf8"));
		const d = defaultPrefs();
		return {
			sessionLogButton: typeof raw.sessionLogButton === "boolean" ? raw.sessionLogButton : d.sessionLogButton,
			closeBehavior: raw.closeBehavior === "tray" || raw.closeBehavior === "quit" ? raw.closeBehavior : d.closeBehavior
		};
	} catch {
		return defaultPrefs();
	}
}

/** Validate and persist a partial patch; returns the merged prefs. */
function writePrefs(patch) {
	const merged = { ...readPrefs(), ...patch };
	if (typeof merged.sessionLogButton !== "boolean") throw new Error("sessionLogButton must be a boolean");
	if (merged.closeBehavior !== "tray" && merged.closeBehavior !== "quit") throw new Error("closeBehavior must be 'tray' or 'quit'");
	writeFileSync(join(dshHome(), "qol-prefs.json"), JSON.stringify(merged, null, 2) + "\n", "utf8");
	return merged;
}

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
 * Mount the prefs route.
 * @param ctx - host plugin context carrying webServer.
 */
function apply(ctx) {
	ctx.effect(() => ctx.webServer.register({
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
	}), "dsh-qol: prefs route");
}
//#endregion
export { apply, inject, name };
