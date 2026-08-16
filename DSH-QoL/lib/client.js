// DSH-QoL — client bundle.
// QoL settings page (settings.section id "qol"): two toggles in the harness's
// own row/switch styling —
//   • Session log button — show/hide the top-right "Session log" download
//     button (the shipped session-log-export entry in the
//     conversation.session.header.utilities slot; hidden via an injected
//     stylesheet when off).
//   • On exit — "minimize to tray" vs "quit completely". The preference is
//     persisted host-side (~/.dsh/qol-prefs.json, written through
//     /dsh-qol/prefs); the desktop shell (deepseek-harness-desktop) reads
//     that file to decide its window-close behavior. If the shell exposes a
//     window.dshDesktop close-behavior bridge, it is called directly too.
//
// Classic-script bundle served verbatim by client-modules at
// /plugins/@deepseek-ai/dsh-qol/client.js — no build step.
window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-qol",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		//#region helpers
		/** DSH theme-variable colors (matches the Models/General row styling). */
		const ROW = {
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: "12px",
			display: "flex",
			alignItems: "center",
			gap: "10px",
			padding: "12px 14px"
		};
		const TITLE = { color: "var(--dsw-alias-label-primary)", fontSize: "14px", fontWeight: "500", lineHeight: "22px" };
		const DESC = { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px", lineHeight: "18px", marginTop: "2px" };
		/** A DSH-style switch: 36px tall track with a sliding knob. */
		function Switch({ checked, onChange, label, disabled }) {
			return react.createElement("button", {
				type: "button",
				role: "switch",
				"aria-checked": checked,
				"aria-label": label,
				disabled: disabled === true,
				onClick: () => onChange(!checked),
				style: {
					boxSizing: "border-box",
					flex: "none",
					width: "34px",
					height: "20px",
					borderRadius: "999px",
					border: "none",
					cursor: disabled === true ? "default" : "pointer",
					padding: "0",
					position: "relative",
					background: checked
						? "var(--dsw-alias-button-primary-fill)"
						: "var(--dsw-alias-interactive-bg-hover)",
					transition: "background 150ms ease"
				}
			}, react.createElement("span", {
				"aria-hidden": "true",
				style: {
					position: "absolute",
					top: "2px",
					left: checked ? "16px" : "2px",
					width: "16px",
					height: "16px",
					borderRadius: "999px",
					background: "var(--dsw-alias-label-primary-foreground, #fff)",
					transition: "left 150ms ease"
				}
			}));
		}
		/** Read current prefs from the host route. */
		function fetchPrefs() {
			return fetch("/dsh-qol/prefs", { headers: { Accept: "application/json" } })
				.then((res) => {
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					return res.json();
				})
				.then((json) => json.prefs ?? null);
		}
		/** Persist a partial patch via the host route. */
		function savePrefs(patch) {
			return fetch("/dsh-qol/prefs", {
				method: "PUT",
				headers: { "Content-Type": "application/json", Accept: "application/json" },
				body: JSON.stringify(patch)
			}).then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			});
		}
		/**
		 * Apply the session-log-button visibility: inject/remove a stylesheet
		 * hiding the header-utilities outlet (which contains the Session log
		 * download button). Module-scoped so the <style> survives remounts.
		 */
		let sessionLogStyle = null;
		function applySessionLogButton(visible) {
			if (sessionLogStyle !== null) {
				sessionLogStyle.remove();
				sessionLogStyle = null;
			}
			if (visible) return;
			const style = document.createElement("style");
			style.dataset.plugin = "@deepseek-ai/dsh-qol";
			style.textContent = `[data-slot="conversation.session.header.utilities"] { display: none !important; }`;
			document.head.appendChild(style);
			sessionLogStyle = style;
		}
		/** Tell the desktop shell about the close behavior when a bridge exists. */
		function notifyDesktopCloseBehavior(behavior) {
			if (typeof window === "undefined" || window === null) return;
			const bridge = window.dshDesktop;
			if (bridge === null || bridge === void 0) return;
			if (typeof bridge.setCloseBehavior === "function") {
				try {
					bridge.setCloseBehavior(behavior);
				} catch (_) { /* shell may reject unknown values; pref file is authoritative */ }
			}
		}
		//#endregion

		/**
		 * The QoL settings page: two toggles in the harness's row style.
		 */
		function QolSection(props) {
			const [prefs, setPrefs] = react.useState(null);
			const [error, setError] = react.useState(null);

			react.useEffect(() => {
				let alive = true;
				fetchPrefs()
					.then((p) => {
						if (!alive || p === null) return;
						setPrefs(p);
						applySessionLogButton(p.sessionLogButton !== false);
					})
					.catch((err) => alive && setError(err instanceof Error ? err.message : String(err)));
				return () => { alive = false; };
			}, []);

			const update = (patch) => {
				savePrefs(patch)
					.then((json) => {
						const next = json.prefs ?? patch;
						setPrefs(next);
						setError(null);
						if (Object.prototype.hasOwnProperty.call(patch, "sessionLogButton")) {
							applySessionLogButton(next.sessionLogButton !== false);
						}
						if (Object.prototype.hasOwnProperty.call(patch, "closeBehavior")) {
							notifyDesktopCloseBehavior(next.closeBehavior);
						}
					})
					.catch((err) => setError(err instanceof Error ? err.message : String(err)));
			};

			const sectionStyle = {
				maxWidth: "720px",
				color: "var(--dsw-alias-label-primary)",
				display: "flex",
				flexDirection: "column",
				gap: "12px"
			};
			const titleStyle = { color: "var(--dsw-alias-label-primary)", margin: "0", fontSize: "16px", fontWeight: "500", lineHeight: "24px" };
			const introStyle = { color: "var(--dsw-alias-label-tertiary)", margin: "0", fontSize: "14px", lineHeight: "22px" };
			const errorStyle = { color: "var(--dsw-alias-state-error-primary)", margin: "0", fontSize: "14px", lineHeight: "22px" };
			const textBlock = (title, desc) => react.createElement("div", { style: { minWidth: "0", flex: "1" } },
				react.createElement("div", { style: TITLE }, title),
				react.createElement("div", { style: DESC }, desc)
			);

			return react.createElement("div", { style: sectionStyle },
				react.createElement("h2", { style: titleStyle }, "QoL"),
				react.createElement("p", { style: introStyle }, "Quality-of-life toggles."),
				error === null ? null : react.createElement("p", { style: errorStyle }, "Failed to save: ", error),
				react.createElement("div", { style: ROW },
					textBlock(
						"Session log button",
						"Show the \"Session log\" download button in the session header. Turn off to hide it."
					),
					react.createElement(Switch, {
						checked: prefs === null ? false : prefs.sessionLogButton !== false,
						disabled: prefs === null,
						label: "Session log button",
						onChange: (value) => update({ sessionLogButton: value })
					})
				),
				react.createElement("div", { style: ROW },
					textBlock(
						"Minimize to tray on close",
						"Closing the window hides the app to the system tray instead of quitting. Off = quit completely. (Applies in the desktop shell; it reads ~/.dsh/qol-prefs.json.)"
					),
					react.createElement(Switch, {
						checked: prefs === null ? false : prefs.closeBehavior === "tray",
						disabled: prefs === null,
						label: "Minimize to tray on close",
						onChange: (value) => update({ closeBehavior: value ? "tray" : "quit" })
					})
				)
			);
		}

		/** Cordis plugin name (client side). */
		const name = "dsh-qol";
		/** Register the QoL settings page (a new nav section, order 30). */
		function apply(ctx) {
			const slots = ctx.get("slots");
			if (slots === undefined) return;
			slots.inject("settings.section", () => slots.register({
				name: "settings.section",
				id: "qol",
				order: 30,
				label: "QoL"
			}, QolSection));
		}
		exports.name = name;
		exports.apply = apply;
		return module.exports;
	}
});
