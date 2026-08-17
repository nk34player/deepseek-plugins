// DSH-QoL — client bundle.
// QoL settings page (settings.section id "qol"):
//   • Session log button — show/hide the top-right "Session log" download
//     button (the shipped session-log-export entry in the
//     conversation.session.header.utilities slot; hidden via an injected
//     stylesheet when off).
//   • When closing window — Reasonix-style segmented control: Keep Running
//     (tray) vs Quit. Persisted host-side to ~/.dsh/qol-prefs.json; the
//     desktop shell reads it for its window-close behavior.
//   • MCP servers — a manager: list of the global MCP servers from
//     ~/.dsh/cordis.patch.yml merged with live loader state, with an
//     enable/disable toggle and a remove action, plus a detail screen
//     (status/source/transport/command/environment).
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

		//#region theme & controls
		/** DSH theme-variable colors (matches Models/General row styling). */
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
		const MONO = { fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", fontSize: "11px", lineHeight: "16px" };
		/** Tone colors for the status dot. */
		const TONE = {
			available: "var(--dsw-alias-state-success-primary)",
			starting: "var(--dsw-alias-state-warn-primary)",
			error: "var(--dsw-alias-state-error-primary)",
			disabled: "var(--dsw-alias-label-tertiary)",
			stopping: "var(--dsw-alias-state-warn-primary)",
			unknown: "var(--dsw-alias-label-tertiary)"
		};
		/** A DSH-style switch. */
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
		/** A DSH-style segmented control (two labeled actions). */
		function SegmentedControl({ value, options, onChange, label, disabled }) {
			return react.createElement("div", {
				role: "radiogroup",
				"aria-label": label,
				style: {
					boxSizing: "border-box",
					display: "inline-flex",
					flex: "none",
					border: "1px solid var(--dsw-alias-border-l2)",
					borderRadius: "999px",
					padding: "2px",
					background: "var(--dsw-alias-interactive-bg-hover)"
				}
			}, options.map((opt, index) => react.createElement("button", {
				key: opt.id,
				type: "button",
				role: "radio",
				"aria-checked": value === opt.id,
				disabled: disabled === true,
				onClick: () => onChange(opt.id),
				style: {
					boxSizing: "border-box",
					height: "28px",
					font: "inherit",
					fontSize: "13px",
					lineHeight: "28px",
					cursor: disabled === true ? "default" : "pointer",
					border: "none",
					borderRadius: "999px",
					padding: "0 14px",
					display: "inline-flex",
					alignItems: "center",
					...(index > 0 && value !== opt.id
						? { borderLeft: "1px solid var(--dsw-alias-border-l2)", borderRadius: 0 }
						: {}),
					background: value === opt.id
						? "var(--dsw-alias-button-primary-fill)"
						: "transparent",
					color: value === opt.id
						? "var(--dsw-alias-label-primary-foreground)"
						: "var(--dsw-alias-label-secondary)",
					transition: "background 150ms ease"
				}
			}, opt.label)));
		}
		//#endregion

		//#region prefs helpers
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
		/** Apply the session-log-button visibility (module-scoped <style>). */
		let sessionLogStyle = null;
		function applySessionLogButton(visible) {
			if (sessionLogStyle !== null) { sessionLogStyle.remove(); sessionLogStyle = null; }
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
				try { bridge.setCloseBehavior(behavior); } catch (_) { /* pref file is authoritative */ }
			}
		}
		//#endregion

		//#region MCP manager
		/** Fetch the MCP server list. */
		function fetchMcp() {
			return fetch("/dsh-qol/mcp", { headers: { Accept: "application/json" } })
				.then((res) => {
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					return res.json();
				})
				.then((json) => json.servers ?? []);
		}
		/** Toggle one server's enabled state (applies on restart). */
		function setMcpEnabled(id, enabled) {
			return fetch(`/dsh-qol/mcp/${encodeURIComponent(id)}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json", Accept: "application/json" },
				body: JSON.stringify({ enabled })
			}).then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			});
		}
		/** Remove one server (applies on restart). */
		function removeMcp(id) {
			return fetch(`/dsh-qol/mcp/${encodeURIComponent(id)}`, {
				method: "DELETE",
				headers: { Accept: "application/json" }
			}).then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			});
		}
		/** Server icon: subdued circular badge with a database glyph. */
		function ServerIcon({ transport }) {
			const glyph = transport === "stdio" ? "⚙" : transport === "sse" || transport === "streamable-http" ? "⇄" : "⛁";
			return react.createElement("span", {
				"aria-hidden": "true",
				style: {
					flex: "none",
					width: "32px",
					height: "32px",
					borderRadius: "999px",
					border: "1px solid var(--dsw-alias-border-l2)",
					background: "var(--dsw-alias-interactive-bg-hover)",
					color: "var(--dsw-alias-label-secondary)",
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					fontSize: "14px"
				}
			}, glyph);
		}
		/** One row in the server list. */
		function McpRow({ server, onOpen, onToggle, onRemove }) {
			return react.createElement("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: "10px",
					padding: "10px 14px",
					cursor: "pointer",
					borderBottom: "1px solid var(--dsw-alias-border-l2)"
				},
				onClick: onOpen,
				role: "button",
				tabIndex: 0,
				"aria-label": `Open ${server.serverName}`
			},
				react.createElement(ServerIcon, { transport: server.transport }),
				react.createElement("div", { style: { minWidth: "0", flex: "1" } },
					react.createElement("div", { style: { display: "flex", alignItems: "center", gap: "6px" } },
						react.createElement("span", {
							"aria-hidden": "true",
							style: { width: "7px", height: "7px", borderRadius: "999px", background: TONE[server.tone] ?? TONE.unknown, flex: "none" }
						}),
						react.createElement("span", { style: TITLE }, server.serverName),
						react.createElement("span", {
							style: {
								border: "1px solid var(--dsw-alias-border-l3)",
								color: "var(--dsw-alias-label-secondary)",
								borderRadius: "999px",
								padding: "0 6px",
								fontSize: "10px",
								lineHeight: "15px",
								flex: "none"
							}
						}, server.transport)
					),
					react.createElement("div", { style: DESC }, server.status),
					react.createElement("div", {
						title: server.command,
						style: { ...MONO, color: "var(--dsw-alias-label-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "4px" }
					}, server.commandPreview)
				),
				react.createElement("button", {
					type: "button",
					style: {
						flex: "none",
						border: "none",
						background: "transparent",
						color: "var(--dsw-alias-label-tertiary)",
						fontSize: "13px",
						padding: "4px",
						cursor: "pointer"
					},
					title: `Remove ${server.serverName}`,
					"aria-label": `Remove ${server.serverName}`,
					onClick: (event) => { event.stopPropagation(); onRemove(); }
				}, "Remove"),
				react.createElement("span", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "13px" } }, "❯"),
				react.createElement(Switch, {
					checked: server.enabled,
					label: `${server.enabled ? "Disable" : "Enable"} ${server.serverName} MCP server`,
					onChange: (value) => { onToggle(value); }
				})
			);
		}
		/** Detail-screen info grid entry. */
		function InfoRow({ label, children, mono }) {
			return react.createElement("div", { style: { display: "flex", gap: "12px", padding: "8px 0", borderBottom: "1px solid var(--dsw-alias-border-l2)" } },
				react.createElement("div", { style: { width: "110px", flex: "none", color: "var(--dsw-alias-label-tertiary)", fontSize: "11px", fontWeight: "600", lineHeight: "18px", textTransform: "uppercase" } }, label),
				react.createElement("div", { style: mono === true ? { ...MONO, color: "var(--dsw-alias-label-primary)", wordBreak: "break-all" } : { color: "var(--dsw-alias-label-primary)", fontSize: "13px", lineHeight: "18px" } }, children)
			);
		}
		/** The MCP server list screen. */
		function McpListView({ servers, loading, error, onOpen, onToggle, onRemove, onBack }) {
			const sectionStyle = {
				maxWidth: "720px",
				color: "var(--dsw-alias-label-primary)",
				display: "flex",
				flexDirection: "column",
				gap: "12px"
			};
			return react.createElement("div", { style: sectionStyle },
				react.createElement("button", {
					type: "button",
					onClick: onBack,
					style: { alignSelf: "flex-start", background: "none", border: "none", color: "var(--dsw-alias-label-primary)", cursor: "pointer", padding: "0", fontSize: "13px", lineHeight: "20px" }
				}, "← Back to QoL"),
				react.createElement("div", null,
					react.createElement("h2", { style: { color: "var(--dsw-alias-label-primary)", margin: "0", fontSize: "16px", fontWeight: "500", lineHeight: "24px" } },
						"Global MCP ", servers.length),
					react.createElement("p", { style: { color: "var(--dsw-alias-label-tertiary)", margin: "2px 0 0", fontSize: "13px", lineHeight: "20px" } },
						"Install once and use automatically in every DeepSeek project.")
				),
				error === null ? null : react.createElement("p", { style: { color: "var(--dsw-alias-state-error-primary)", margin: "0", fontSize: "13px", lineHeight: "20px" } }, error),
				react.createElement("div", {
					style: {
						border: "1px solid var(--dsw-alias-border-l2)",
						borderRadius: "8px",
						overflow: "hidden",
						background: "var(--dsw-alias-bg-secondary, transparent)"
					}
				},
					loading && servers.length === 0
						? react.createElement("div", { style: { padding: "16px 14px", color: "var(--dsw-alias-label-tertiary)", fontSize: "13px" } }, "Loading servers…")
						: servers.length === 0
							? react.createElement("div", { style: { padding: "16px 14px", color: "var(--dsw-alias-label-tertiary)", fontSize: "13px" } }, "No MCP servers configured.")
							: servers.map((server) => react.createElement(McpRow, {
								key: server.id,
								server,
								onOpen: () => onOpen(server.id),
								onToggle: (value) => onToggle(server.id, value),
								onRemove: () => onRemove(server.id)
							}))
				),
				react.createElement("p", { style: { color: "var(--dsw-alias-label-tertiary)", margin: "0", fontSize: "12px", lineHeight: "18px" } },
					"Toggles and removals edit ~/.dsh/cordis.patch.yml and take effect on the next restart.")
			);
		}
		/** The MCP server detail screen. */
		function McpDetailView({ server, error, onBack, onToggle, onRemove, confirmRemove, setConfirmRemove }) {
			if (server === void 0) {
				return react.createElement("div", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "13px" } },
					react.createElement("button", { type: "button", onClick: onBack, style: { background: "none", border: "none", color: "var(--dsw-alias-label-primary)", cursor: "pointer", padding: "0", fontSize: "13px" } }, "← Back to MCP servers"),
					react.createElement("p", { style: { marginTop: "12px" } }, "Server not found."));
			}
			const sectionStyle = {
				maxWidth: "720px",
				color: "var(--dsw-alias-label-primary)",
				display: "flex",
				flexDirection: "column",
				gap: "14px"
			};
			return react.createElement("div", { style: sectionStyle },
				react.createElement("button", {
					type: "button",
					onClick: onBack,
					style: { alignSelf: "flex-start", background: "none", border: "none", color: "var(--dsw-alias-label-primary)", cursor: "pointer", padding: "0", fontSize: "13px", lineHeight: "20px" }
				}, "← Back to MCP servers"),
				react.createElement("div", null,
					react.createElement("h2", { style: { color: "var(--dsw-alias-label-primary)", margin: "0", fontSize: "16px", fontWeight: "500", lineHeight: "24px" } }, server.serverName),
					react.createElement("p", { style: { color: "var(--dsw-alias-label-tertiary)", margin: "2px 0 0", fontSize: "13px", lineHeight: "20px" } },
						"Connection details, diagnostics, and tools.")
				),
				error === null ? null : react.createElement("p", { style: { color: "var(--dsw-alias-state-error-primary)", margin: "0", fontSize: "13px" } }, error),
				react.createElement("div", { style: { border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "8px", padding: "4px 14px" } },
					react.createElement(InfoRow, { label: "Status" },
						react.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: "6px" } },
							react.createElement("span", { "aria-hidden": "true", style: { width: "7px", height: "7px", borderRadius: "999px", background: TONE[server.tone] ?? TONE.unknown, flex: "none" } }),
							server.status
						)
					),
					react.createElement(InfoRow, { label: "Source" }, "Global"),
					react.createElement(InfoRow, { label: "Transport" }, server.transport),
					react.createElement(InfoRow, { label: "Command", mono: true }, server.command),
					react.createElement(InfoRow, { label: "Environment" },
						server.envKeys.length === 0
							? "—"
							: react.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "2px" } },
								server.envKeys.map((key) => react.createElement("code", { key, style: { ...MONO, color: "var(--dsw-alias-label-primary)" } }, key)))
					)
				),
				react.createElement("div", { style: { display: "flex", alignItems: "center", gap: "12px" } },
					react.createElement(Switch, {
						checked: server.enabled,
						label: `${server.enabled ? "Disable" : "Enable"} ${server.serverName} MCP server`,
						onChange: (value) => onToggle(value)
					}),
					react.createElement("span", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px" } },
						server.enabled ? "Enabled" : "Disabled")
				),
				react.createElement("div", { style: { display: "flex", gap: "8px" } },
					confirmRemove
						? react.createElement(react.Fragment, null,
							react.createElement("span", { style: { color: "var(--dsw-alias-label-secondary)", fontSize: "13px", lineHeight: "36px" } },
								`Remove ${server.serverName}? This removes the global server configuration.`),
							react.createElement("button", { type: "button", onClick: () => { setConfirmRemove(false); onRemove(); }, style: buttonStyle("danger") }, "Remove server"),
							react.createElement("button", { type: "button", onClick: () => setConfirmRemove(false), style: buttonStyle("secondary") }, "Cancel")
						)
						: react.createElement("button", { type: "button", onClick: () => setConfirmRemove(true), style: buttonStyle("secondary") }, "Remove server")
				),
				react.createElement("div", { style: { border: "1px dashed var(--dsw-alias-border-l3)", borderRadius: "8px", padding: "14px" } },
					Array.isArray(server.toolNames) && server.toolNames.length > 0
						? react.createElement(react.Fragment, null,
							react.createElement("div", { style: { color: "var(--dsw-alias-label-primary)", fontSize: "13px", fontWeight: "500", lineHeight: "20px" } },
								`${server.toolNames.length} tool${server.toolNames.length === 1 ? "" : "s"}:`),
							react.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "2px", marginTop: "6px" } },
								server.toolNames.map((tool) => react.createElement("code", {
									key: tool,
									style: { ...MONO, color: "var(--dsw-alias-label-secondary)", wordBreak: "break-all" }
								}, `mcp__${server.serverName}__${tool}`)))
						)
						: react.createElement(react.Fragment, null,
							react.createElement("div", { style: { color: "var(--dsw-alias-label-primary)", fontSize: "13px", fontWeight: "500", lineHeight: "20px" } },
								Array.isArray(server.toolNames)
									? "This server registered no tools."
									: "This connection did not return tool details."),
							react.createElement("p", { style: { color: "var(--dsw-alias-label-tertiary)", margin: "4px 0 0", fontSize: "12px", lineHeight: "18px" } },
								Array.isArray(server.toolNames)
									? "The server may expose resources or prompts instead of tools."
									: "Tool discovery has not completed — the server may be starting, disabled, or unreachable.")
						)
				)
			);
		}
		/** Shared button style helper. */
		function buttonStyle(kind) {
			return {
				boxSizing: "border-box",
				height: "36px",
				font: "inherit",
				cursor: "pointer",
				border: "none",
				borderRadius: "18px",
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				gap: "4px",
				padding: "0 14px",
				fontSize: "14px",
				lineHeight: "22px",
				...(kind === "danger"
					? { background: "var(--dsw-alias-state-error-primary)", color: "var(--dsw-alias-label-primary-foreground)" }
					: { background: "var(--dsw-alias-interactive-bg-hover)", color: "var(--dsw-alias-label-primary)" })
			};
		}
		//#endregion

		/**
		 * The QoL settings page: prefs rows plus an MCP server manager with
		 * list and detail views (in-page navigation).
		 */
		function QolSection(props) {
			const [prefs, setPrefs] = react.useState(null);
			const [error, setError] = react.useState(null);
			const [view, setView] = react.useState("prefs"); // prefs | mcp | mcp:<id>
			const [servers, setServers] = react.useState([]);
			const [loading, setLoading] = react.useState(false);
			const [confirmRemove, setConfirmRemove] = react.useState(false);

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

			const refreshMcp = react.useCallback(() => {
				setLoading(true);
				fetchMcp()
					.then((list) => { setServers(list); setError(null); })
					.catch((err) => setError(err instanceof Error ? err.message : String(err)))
					.finally(() => setLoading(false));
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

			const toggleServer = (id, enabled) => {
				setMcpEnabled(id, enabled)
					.then((json) => { setServers(json.servers ?? servers); setError(null); })
					.catch((err) => setError(err instanceof Error ? err.message : String(err)));
			};

			const removeServer = (id) => {
				removeMcp(id)
					.then((json) => {
						setServers(json.servers ?? servers);
						setView("mcp");
						setConfirmRemove(false);
						setError(null);
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

			// MCP detail view
			if (view.startsWith("mcp:")) {
				const id = view.slice(4);
				const server = servers.find((s) => s.id === id);
				return react.createElement(McpDetailView, {
					server,
					error,
					onBack: () => setView("mcp"),
					onToggle: (value) => toggleServer(id, value),
					onRemove: () => removeServer(id),
					confirmRemove,
					setConfirmRemove
				});
			}
			// MCP list view
			if (view === "mcp") {
				return react.createElement(McpListView, {
					servers,
					loading,
					error,
					onBack: () => setView("prefs"),
					onOpen: (id) => { setConfirmRemove(false); setView("mcp:" + id); },
					onToggle: toggleServer,
					onRemove: (id) => {
						// removal confirmation lives on the detail screen
						setConfirmRemove(false);
						setView("mcp:" + id);
					}
				});
			}
			// prefs view
			return react.createElement("div", { style: sectionStyle },
				react.createElement("h2", { style: titleStyle }, "QoL"),
				react.createElement("p", { style: introStyle }, "Quality-of-life controls."),
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
					react.createElement("div", {
						"aria-hidden": "true",
						style: { flex: "none", color: "var(--dsw-alias-label-tertiary)", fontSize: "16px", lineHeight: "1" }
					}, "⏻"),
					textBlock(
						"When closing window",
						"Choose whether DeepSeek Harness keeps running after its main window closes. The desktop shell reads ~/.dsh/qol-prefs.json."
					),
					react.createElement(SegmentedControl, {
						value: prefs === null ? "quit" : prefs.closeBehavior,
						disabled: prefs === null,
						label: "When closing window",
						options: [
							{ id: "tray", label: "Keep Running" },
							{ id: "quit", label: "Quit" }
						],
						onChange: (value) => update({ closeBehavior: value })
					})
				),
				react.createElement("div", {
					style: { ...ROW, cursor: "pointer" },
					role: "button",
					tabIndex: 0,
					onClick: () => { refreshMcp(); setView("mcp"); }
				},
					react.createElement("div", {
						"aria-hidden": "true",
						style: { flex: "none", color: "var(--dsw-alias-label-tertiary)", fontSize: "16px", lineHeight: "1" }
					}, "⛁"),
					textBlock(
						"MCP servers",
						"View, enable, disable, and remove your global MCP servers."
					),
					react.createElement("span", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "14px" } }, "❯")
				)
			);
		}

		/** Cordis plugin name (client side). */
		const name = "dsh-qol";
		/**
		 * Apply prefs at launch (independent of the settings page). The only
		 * launch-visible pref today is the session-log-button visibility,
		 * injected as a stylesheet as soon as prefs are read.
		 */
		function applyPrefsOnLaunch() {
			if (typeof window === "undefined" || window === null) return;
			fetchPrefs()
				.then((prefs) => {
					if (prefs === null) return;
					applySessionLogButton(prefs.sessionLogButton !== false);
				})
				.catch(() => { /* prefs apply lazily when the settings page opens */ });
		}
		/** Register the QoL settings page (a new nav section, order 30). */
		function apply(ctx) {
			applyPrefsOnLaunch();
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
