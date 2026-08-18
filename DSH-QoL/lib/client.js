// DSH-QoL — client bundle.
// QoL settings page (settings.section id "qol"):
//   • Session log button — show/hide the top-right "Session log" download
//     button (the shipped session-log-export entry in the
//     conversation.session.header.utilities slot; hidden via an injected
//     stylesheet when off). Persisted host-side to ~/.dsh/qol-prefs.json;
//     applied at launch (with retry) and whenever the settings page opens.
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
		let primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		const { Menu } = primitives;

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

		//#region Background-jobs manager
		/** Fetch the background-job list. */
		function fetchJobs() {
			return fetch("/dsh-qol/jobs", { headers: { Accept: "application/json" } })
				.then((res) => {
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					return res.json();
				})
				.then((json) => json.jobs ?? []);
		}
		/** Terminate one background job; resolves with the refreshed list. */
		function killJob(id, sessionId) {
			return fetch("/dsh-qol/jobs", {
				method: "POST",
				headers: { "Content-Type": "application/json", Accept: "application/json" },
				body: JSON.stringify({ id, ...(sessionId !== undefined && sessionId !== null ? { sessionId } : {}) })
			}).then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			});
		}
		/** Status-dot tone for a job status (warning for in-flight/killed, error for failed). */
		const JOB_TONE = {
			running: "starting",
			stopping: "starting",
			completed: "available",
			killed: "disabled",
			failed: "error"
		};
		/** One row in the background-job list. */
		function JobRow({ job, onTerminate }) {
			const live = job.status === "running" || job.status === "stopping";
			return react.createElement("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: "10px",
					padding: "10px 14px",
					borderBottom: "1px solid var(--dsw-alias-border-l2)"
				}
			},
				react.createElement("span", {
					"aria-hidden": "true",
					style: { width: "7px", height: "7px", borderRadius: "999px", background: TONE[JOB_TONE[job.status] ?? "unknown"], flex: "none" }
				}),
				react.createElement("div", { style: { minWidth: "0", flex: "1" } },
					react.createElement("div", { style: { display: "flex", alignItems: "center", gap: "6px" } },
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
						}, job.kind),
						react.createElement("span", { style: { color: "var(--dsw-alias-label-secondary)", fontSize: "11px", lineHeight: "16px", flex: "none" } }, job.id)
					),
					react.createElement("div", {
						title: job.label,
						style: { ...MONO, color: "var(--dsw-alias-label-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "3px" }
					}, job.label),
					react.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginTop: "3px" } },
						react.createElement("span", { style: DESC }, job.status + (job.detail !== undefined ? ` · ${job.detail}` : "")),
						job.ownerSession === undefined
							? react.createElement("span", { style: DESC }, "unowned")
							: react.createElement("span", { style: DESC }, "session " + job.ownerSession.slice(0, 8)),
						react.createElement("span", { style: DESC }, "started " + new Date(job.startedAt).toLocaleTimeString())
					)
				),
				live
					? react.createElement("button", {
						type: "button",
						style: buttonStyle("secondary"),
						onClick: () => onTerminate(),
						"aria-label": `Terminate ${job.id}`
					}, "Terminate")
					: react.createElement("span", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px" } }, job.finishedAt !== undefined
						? "ended " + new Date(job.finishedAt).toLocaleTimeString()
						: "")
			);
		}
		/** The background-job modal: fixed overlay + centered panel listing all jobs. */
		function JobsModal({ jobs, loading, error, onClose, onTerminate, onTerminateAll }) {
			const live = jobs.filter((j) => j.status === "running" || j.status === "stopping");
			return react.createElement("div", {
				role: "dialog",
				"aria-modal": "true",
				"aria-label": "Background jobs",
				style: {
					position: "fixed",
					inset: "0",
					zIndex: "1000",
					display: "flex",
					justifyContent: "center",
					alignItems: "center"
				}
			},
				react.createElement("div", {
					onClick: onClose,
					"aria-hidden": "true",
					style: {
						position: "absolute",
						inset: "0",
						background: "var(--dsw-alias-bg-mask-1)",
						backdropFilter: "var(--dsw-mask-blur)"
					}
				}),
				react.createElement("div", {
					style: {
						position: "relative",
						zIndex: "1",
						background: "var(--dsw-alias-bg-layer-2)",
						color: "var(--dsw-alias-label-primary)",
						width: "640px",
						maxWidth: "calc(100vw - 48px)",
						maxHeight: "min(640px, 100vh - 48px)",
						boxShadow: "var(--dsw-shadow-lv3)",
						borderRadius: "24px",
						display: "flex",
						flexDirection: "column",
						overflow: "hidden"
					}
				},
					react.createElement("div", {
						style: {
							boxSizing: "border-box",
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							gap: "8px",
							padding: "20px 16px 8px",
							flex: "none"
						}
					},
						react.createElement("h2", { style: { margin: "0", fontSize: "16px", fontWeight: "500", lineHeight: "24px" } },
							"Background jobs", jobs.length > 0 ? ` (${jobs.length})` : ""),
						react.createElement("button", {
							type: "button",
							onClick: onClose,
							"aria-label": "Close background jobs",
							style: {
								cursor: "pointer",
								width: "28px",
								height: "28px",
								color: "var(--dsw-alias-label-primary)",
								background: "none",
								border: "none",
								borderRadius: "28px",
								flex: "none",
								display: "inline-flex",
								justifyContent: "center",
								alignItems: "center",
								padding: "0",
								fontSize: "14px"
							}
						}, "✕")
					),
					error === null ? null : react.createElement("p", {
						style: { color: "var(--dsw-alias-state-error-primary)", margin: "0 16px 8px", fontSize: "13px", lineHeight: "20px" }
					}, error),
					react.createElement("div", {
						style: {
							flex: "1",
							minHeight: "0",
							overflowY: "auto",
							padding: "0 12px 8px"
						}
					},
						loading && jobs.length === 0
							? react.createElement("div", { style: { padding: "16px 14px", color: "var(--dsw-alias-label-tertiary)", fontSize: "13px" } }, "Loading jobs…")
							: jobs.length === 0
								? react.createElement("div", { style: { padding: "16px 14px", color: "var(--dsw-alias-label-tertiary)", fontSize: "13px" } }, "No background jobs.")
								: jobs.map((job) => react.createElement(JobRow, {
									key: job.id,
									job,
									onTerminate: () => onTerminate(job)
								}))
					),
					live.length > 0
						? react.createElement("div", { style: { display: "flex", justifyContent: "flex-end", padding: "8px 16px 16px", flex: "none" } },
							react.createElement("button", { type: "button", onClick: onTerminateAll, style: buttonStyle("secondary") },
								`Terminate all running (${live.length})`))
						: null
				)
			);
		}
		/**
		 * Sidebar-footer background-jobs action: a New-Session-styled button
		 * (full row when wide, round icon in the collapsed rail) that opens the
		 * jobs modal. The list is live: polls while the modal is open.
		 */
		function BackgroundJobsAction({ wide }) {
			const [open, setOpen] = react.useState(false);
			const [jobs, setJobs] = react.useState([]);
			const [loading, setLoading] = react.useState(false);
			const [error, setError] = react.useState(null);

			const refresh = () => {
				setLoading(true);
				fetchJobs()
					.then((list) => { setJobs(list); setError(null); })
					.catch((err) => setError(err instanceof Error ? err.message : String(err)))
					.finally(() => setLoading(false));
			};

			react.useEffect(() => {
				if (!open) return;
				refresh();
				const timer = setInterval(refresh, 1500);
				return () => { clearInterval(timer); };
			}, [open]);

			const terminate = (job) => {
				killJob(job.id, job.ownerSession)
					.then((json) => { setJobs(json.jobs ?? jobs); setError(null); })
					.catch((err) => setError(err instanceof Error ? err.message : String(err)));
			};

			const terminateAll = () => {
				const live = jobs.filter((j) => j.status === "running" || j.status === "stopping");
				if (live.length === 0) return;
				let remaining = live.length;
				let updated = jobs;
				live.forEach((job) => {
					killJob(job.id, job.ownerSession)
						.then((json) => {
							updated = json.jobs ?? updated;
							remaining -= 1;
							if (remaining === 0) { setJobs(updated); setError(null); }
						})
						.catch((err) => {
							remaining -= 1;
							setError(err instanceof Error ? err.message : String(err));
						});
				});
			};

			return react.createElement(react.Fragment, null,
				react.createElement("div", { style: { flex: "none", width: "100%" } },
					react.createElement("button", {
						type: "button",
						onClick: () => { refresh(); setOpen(true); },
						title: "Background jobs",
						"aria-label": "Background jobs",
						style: wide
							? {
								boxSizing: "border-box",
								width: "100%",
								height: "38px",
								color: "var(--dsw-alias-label-primary)",
								cursor: "pointer",
								background: "var(--dsw-alias-button-elevated-fill)",
								border: "1px solid var(--dsw-alias-border-l2)",
								borderRadius: "12px",
								display: "inline-flex",
								alignItems: "center",
								justifyContent: "center",
								gap: "6px",
								padding: "8px 16px",
								fontSize: "14px",
								fontWeight: "500",
								lineHeight: "22px"
							}
							: {
								boxSizing: "border-box",
								width: "36px",
								height: "36px",
								color: "var(--dsw-alias-label-primary)",
								cursor: "pointer",
								background: "var(--dsw-alias-interactive-bg-hover)",
								border: "none",
								borderRadius: "50%",
								display: "inline-flex",
								alignItems: "center",
								justifyContent: "center",
								padding: "0",
								fontSize: "16px"
							}
					},
						react.createElement("span", { "aria-hidden": "true", style: { flex: "none", lineHeight: "1" } }, "⟳"),
						wide && react.createElement("span", { style: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, "Background jobs")
					)
				),
				open && react.createElement(JobsModal, {
					jobs,
					loading,
					error,
					onClose: () => setOpen(false),
					onTerminate: terminate,
					onTerminateAll: terminateAll
				})
			);
		}
		//#endregion

		//#region Thinking-content mode
		/**
		 * Controls how assistant reasoning ("Think") disclosures behave in the
		 * transcript:
		 *   - off:      leave the shipped collapsed disclosure untouched.
		 *   - line:     auto-expand when thinking starts, keep the latest line in
		 *               view while it streams, then auto-collapse on completion.
		 *   - expanded: auto-expand when thinking starts and leave it open.
		 *
		 * Driven by a DOM observer over `[data-variant="think"]` (the ReasoningRow
		 * root) and its `[data-disclosure-row]` toggle — stable hooks, so the
		 * hashed CSS-module class names never need to be referenced.
		 */
		const THINKING_MODES = ["off", "line", "expanded"];
		let thinkingMode = "off";
		let thinkingObserver = null;

		/** All ReasoningRow roots currently in the transcript. */
		function thinkRoots() {
			return Array.from(document.querySelectorAll('[data-variant="think"]'));
		}
		/** The clickable disclosure row inside a think root, or null. */
		function thinkRow(root) {
			return root.querySelector('[data-disclosure-row]');
		}
		function isExpanded(root) {
			const row = thinkRow(root);
			return row !== null && row.getAttribute("aria-expanded") === "true";
		}
		/** Expand a collapsed disclosure row (idempotent). */
		function expandThink(root) {
			const row = thinkRow(root);
			if (row !== null && row.getAttribute("aria-expanded") !== "true") row.click();
		}
		/** Collapse an open disclosure row (idempotent). */
		function collapseThink(root) {
			const row = thinkRow(root);
			if (row !== null && row.getAttribute("aria-expanded") === "true") row.click();
		}
		let followFrame = null;
		/** Follow only an already-following transcript; never hijack manual scroll. */
		function followLine(root) {
			if (followFrame !== null) return;
			const schedule = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (callback) => setTimeout(callback, 0);
			followFrame = schedule(() => {
				followFrame = null;
				let el = root.parentElement;
				while (el !== null && el !== document.body) {
					const style = getComputedStyle(el);
					const scrollable = (style.overflowY === "auto" || style.overflowY === "scroll") && el.scrollHeight > el.clientHeight;
					if (scrollable) {
						const distanceFromEnd = el.scrollHeight - el.clientHeight - el.scrollTop;
						if (distanceFromEnd <= 96) el.scrollTop = el.scrollHeight;
						return;
					}
					el = el.parentElement;
				}
			});
		}
		/** Apply the active mode to every think row (idempotent; no-op for "off"). */
		function handleThinkingRows() {
			if (thinkingMode === "off") return;
			thinkRoots().forEach((root) => {
				const running = root.getAttribute("data-state") === "running";
				if (running) {
					expandThink(root);
					if (thinkingMode === "line") followLine(root);
				} else if (thinkingMode === "line") {
					// thinking completed -> auto-collapse (expanded mode leaves it open)
					collapseThink(root);
				}
			});
		}
		/** Set the mode and ensure the observer is watching the transcript. */
		function applyThinkingMode(mode) {
			thinkingMode = THINKING_MODES.includes(mode) ? mode : "off";
			if (typeof MutationObserver === "undefined") return;
			if (thinkingObserver === null) {
				thinkingObserver = new MutationObserver(handleThinkingRows);
				thinkingObserver.observe(document.body, {
					childList: true,
					subtree: true,
					attributes: true,
					attributeFilter: ["data-state", "data-variant", "aria-expanded"]
				});
			}
			handleThinkingRows();
		}
		/** A compact DSH-styled segmented control (e.g. the 3 thinking modes). */
		function Segmented({ value, options, onChange, disabled }) {
			return react.createElement("div", {
				style: {
					display: "flex",
					gap: "4px",
					padding: "3px",
					background: "var(--dsw-alias-interactive-bg-hover)",
					borderRadius: "12px",
					flex: "none"
				}
			}, options.map((opt) => react.createElement("button", {
				key: opt.value,
				type: "button",
				disabled: disabled === true,
				"aria-pressed": value === opt.value,
				onClick: () => onChange(opt.value),
				style: {
					boxSizing: "border-box",
					height: "26px",
					font: "inherit",
					fontSize: "12px",
					lineHeight: "18px",
					cursor: disabled === true ? "default" : "pointer",
					border: "none",
					borderRadius: "9px",
					padding: "0 12px",
					...(value === opt.value
						? { background: "var(--dsw-alias-button-primary-fill)", color: "var(--dsw-alias-label-primary-foreground, #fff)" }
						: { background: "transparent", color: "var(--dsw-alias-label-secondary)" })
				}
			}, opt.label)));
		}
		//#endregion

		//#region Mode switcher (Normal / Plan)
		/**
		 * A dropdown mode switcher visually matching the access-mode
		 * (permission) toggle. Reads the `plan` session projection to show the
		 * current collaboration mode and drives `/plan` / `/plan off` through
		 * the host command channel.
		 */
		function ModeSelect({ useProjection, switchMode }) {
			const plan = useProjection("plan");
			const [open, setOpen] = react.useState(false);
			const [busy, setBusy] = react.useState(false);
			const effectivePlan = plan === undefined || plan === null ? false : (plan.pending ? !plan.active : plan.active);
			const currentMode = effectivePlan ? "plan" : "normal";
			const items = [
				{ id: "normal", label: "Normal" },
				{ id: "plan", label: "Plan" }
			];
			const submit = (id) => {
				if (id === currentMode) { setOpen(false); return; }
				setBusy(true);
				setOpen(false);
				const finish = () => setBusy(false);
				Promise.resolve()
					.then(() => typeof switchMode === "function" ? switchMode(id) : void 0)
					.catch(() => {})
					.finally(finish);
			};
			return react.createElement(react.Fragment, null,
				react.createElement(Menu, {
					open,
					items,
					selectedId: currentMode,
					onSelect: submit,
					onClose: () => setOpen(false),
					side: "top",
					className: "dsh-qol-mode-menu",
					anchor: react.createElement("button", {
						type: "button",
						role: "button",
						className: "dsh-qol-mode-trigger",
						"aria-label": `Mode, current: ${currentMode === "plan" ? "Plan" : "Normal"}`,
						title: "Switch between Normal and Plan mode",
						disabled: busy,
						onClick: () => setOpen(!open),
						style: {
							boxSizing: "border-box",
							minWidth: "0",
							maxWidth: "220px",
							height: "28px",
							color: "var(--dsw-alias-label-secondary)",
							cursor: busy ? "default" : "pointer",
							background: "transparent",
							border: "none",
							borderRadius: "24px",
							outline: "none",
							alignItems: "center",
							gap: "4px",
							padding: "0 4px 0 8px",
							fontSize: "13px",
							fontWeight: "500",
							lineHeight: "20px",
							display: "inline-flex"
						}
					},
						react.createElement("span", {
							"aria-hidden": "true",
							style: { flex: "none", display: "inline-flex", fontSize: "14px", lineHeight: "1" }
						}, effectivePlan ? "🧠" : "💬"),
						react.createElement("span", { style: { textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: "0", overflow: "hidden" } },
							currentMode === "plan" ? "Plan" : "Normal"),
						react.createElement("span", {
							"aria-hidden": "true",
							style: {
								color: "var(--dsw-alias-label-caption)",
								flex: "none",
								transition: "transform .12s",
								display: "inline-flex",
								transform: open ? "rotate(180deg)" : "rotate(0deg)"
							}
						}, "▾")
					)
				})
			);
		}

		/** Slot disposer for the mode switcher; set while the control is injected. */
		let modeSwitcherDispose = null;
		/** Root client context, captured at apply time for slot/command access. */
		let qolCtx = null;
		/** Hide-style element that suppresses the built-in Plan chip while the switcher is on. */
		let modeChipHideStyle = null;
		/**
		 * Inline style for the mode trigger (hover/focus) and the built-in
		 * Plan-chip suppression. Injected once; the chip rule is scoped to a
		 * `dsh-qol-hide-plan-chip` class toggled on <body>.
		 */
		function ensureModeStyles() {
			if (modeChipHideStyle !== null) return;
			const style = document.createElement("style");
			style.dataset.plugin = "@deepseek-ai/dsh-qol";
			style.textContent =
				".dsh-qol-mode-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}" +
				".dsh-qol-mode-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}" +
				".dsh-qol-mode-trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}" +
				".dsh-qol-mode-menu [role=menuitem]{font-family:inherit;font-size:13px;font-weight:400;line-height:20px;letter-spacing:normal}" +
				"body.dsh-qol-hide-plan-chip button[title*=\"/plan off\"]{display:none !important}";
			document.head.appendChild(style);
			modeChipHideStyle = style;
		}
		/** Mount or unmount the Normal/Plan mode switcher in the composer. */
		function applyModeSwitcher(show) {
			if (qolCtx === null) return;
			const slots = qolCtx.get("slots");
			if (slots === void 0) return;
			if (typeof document !== "undefined" && document !== null) {
				ensureModeStyles();
				document.body.classList.toggle("dsh-qol-hide-plan-chip", show === true);
			}
			if (show) {
				if (modeSwitcherDispose !== null) return;
				modeSwitcherDispose = slots.inject("conversation.input.left", () => slots.register({
					name: "conversation.input.left",
					id: "qol-mode",
					order: 50,
					inject: (sessionId) => ({
						switchMode: async (mode) => {
							const remote = qolCtx.get("remote.commands");
							if (remote === void 0 || remote === null) return;
							const command = mode === "plan" ? "/plan" : "/plan off";
							try { await remote.execute(sessionId, command); } catch { /* ignore */ }
						}
					})
				}, ModeSelect));
			} else {
				if (modeSwitcherDispose !== null) {
					const dispose = modeSwitcherDispose;
					modeSwitcherDispose = null;
					dispose();
				}
			}
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
						applyThinkingMode(p.thinkingMode);
						applyModeSwitcher(p.showModeSwitcher !== false);
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
						if (Object.prototype.hasOwnProperty.call(patch, "thinkingMode")) {
							applyThinkingMode(next.thinkingMode);
						}
						if (Object.prototype.hasOwnProperty.call(patch, "showModeSwitcher")) {
							applyModeSwitcher(next.showModeSwitcher !== false);
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
				react.createElement("div", { style: { ...ROW, alignItems: "flex-start", flexDirection: "column", gap: "8px" } },
					react.createElement("div", { style: { display: "flex", alignItems: "center", gap: "10px", width: "100%" } },
						textBlock(
							"Thinking content",
							"Control how assistant reasoning (Think) is shown while streaming."
						),
						react.createElement(Segmented, {
							value: prefs === null ? "off" : prefs.thinkingMode,
							disabled: prefs === null,
							options: [
								{ value: "off", label: "Off" },
								{ value: "line", label: "Line Follow" },
								{ value: "expanded", label: "Expanded" }
							],
							onChange: (value) => update({ thinkingMode: value })
						})
					),
					react.createElement("div", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px", lineHeight: "18px", marginLeft: "2px" } },
						prefs !== null && prefs.thinkingMode === "line"
							? "Opens thinking as it streams, follows the current line, and auto-collapses when done."
							: prefs !== null && prefs.thinkingMode === "expanded"
								? "Opens thinking as it streams and keeps it expanded after completion."
								: "Leave thinking disclosures collapsed until clicked (shipped default).")
				),
				react.createElement("div", { style: ROW },
					textBlock(
						"Mode switcher",
						"Show a Normal/Plan mode switch next to the access-mode button in the composer."
					),
					react.createElement(Switch, {
						checked: prefs === null ? true : prefs.showModeSwitcher !== false,
						disabled: prefs === null,
						label: "Mode switcher",
						onChange: (value) => update({ showModeSwitcher: value })
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
		 * launch-visible pref is the session-log-button visibility, injected as
		 * a stylesheet as soon as prefs are read. Retries until the host route
		 * responds (the host half may still be booting when the client bundle
		 * applies); on total failure the settings page re-applies on open.
		 */
		const LAUNCH_PREF_RETRIES = 10;
		const LAUNCH_PREF_RETRY_MS = 400;
		function applyPrefsOnLaunch() {
			if (typeof window === "undefined" || window === null) return;
			let attempts = 0;
			const tryApply = () => {
				attempts += 1;
				fetchPrefs()
					.then((prefs) => {
						if (prefs === null) return;
						applySessionLogButton(prefs.sessionLogButton !== false);
						applyThinkingMode(prefs.thinkingMode);
						applyModeSwitcher(prefs.showModeSwitcher !== false);
					})
					.catch(() => {
						if (attempts < LAUNCH_PREF_RETRIES) setTimeout(tryApply, LAUNCH_PREF_RETRY_MS);
					});
			};
			tryApply();
		}
		/** Register the QoL settings page (order 30) and the sidebar-footer background-jobs action. */
		function apply(ctx) {
			qolCtx = ctx;
			applyPrefsOnLaunch();
			const slots = ctx.get("slots");
			if (slots === undefined) return;
			slots.inject("settings.section", () => slots.register({
				name: "settings.section",
				id: "qol",
				order: 30,
				label: "QoL"
			}, QolSection));
			slots.inject("sidebar.footer.action", () => slots.register({
				name: "sidebar.footer.action",
				id: "background-jobs",
				order: 10
			}, BackgroundJobsAction));
		}
		exports.name = name;
		exports.apply = apply;
		return module.exports;
	}
});
