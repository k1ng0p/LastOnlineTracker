/**
 * @name LastOnlineTracker
 * @author k1ng_op
 * @description Shows "Active X ago" under usernames in the DM list.
 * @version 1.2.0
 * @authorId 641266820187160576
 * @authorLink https://github.com/k1ng0p
 * @source https://github.com/k1ng0p/LastOnlineTracker
 * @updateUrl https://raw.githubusercontent.com/k1ng0p/LastOnlineTracker/main/betterdiscord/LastOnlineTracker.plugin.js
 */

const config = {
    changelog: [
        { title: "New Features", type: "added", items: [
            "Custom label text (Active / Last seen / Online / Seen)",
            "Exact timestamp on hover",
            "Relative or exact time format toggle"
        ] },
        { title: "Bug Fixes", type: "fixed", items: [
            "Memory leak from unlimited tracked users, now capped at 500",
            "Cleanup was removing the wrong (still active) user instead of the truly oldest one",
            "Settings dropdown could crash on some BD versions",
            "Corrupted saved settings were trusted without checking",
            "Status check failures were silent, now logs a warning once",
            "Settings panel could show outdated values after a change"
        ] },
        { title: "Improvements", type: "improved", items: [
            "Only watches the DM list for changes instead of the whole app",
            "Tighter DM row detection",
            "Skips update checks when nothing is on screen"
        ] }
    ]
};

const NAME = "LastOnlineTracker";
const VERSION = "1.2.0";
const MAX_TRACKED = 500;
const LABELS = ["Active", "Last seen", "Online", "Seen"];
const FORMATS = [["Relative (5m ago)", "relative"], ["Exact (2:34 PM)", "exact"]];

function evict(map) {
    if (map.size > MAX_TRACKED) map.delete(map.keys().next().value);
}

module.exports = class LastOnlineTracker {
    constructor() {
        this.lastSeen = new Map();
        this.knownStatus = new Map();
        this.warnedOnce = false;
        this.onPresenceChange = this.onPresenceChange.bind(this);

        const saved = BdApi.Data.load(NAME, "settings") || {};
        this.settings = {
            label: LABELS.includes(saved.label) ? saved.label : "Active",
            timeFormat: FORMATS.some(([, v]) => v === saved.timeFormat) ? saved.timeFormat : "relative"
        };
    }

    start() {
        const lastVersion = BdApi.Data.load(NAME, "lastVersion");
        if (lastVersion !== VERSION) {
            BdApi.UI.showChangelogModal({ title: NAME, subtitle: `v${VERSION}`, changes: config.changelog });
            BdApi.Data.save(NAME, "lastVersion", VERSION);
        }

        this.PresenceStore = BdApi.Webpack.getStore("PresenceStore");
        this.ChannelStore = BdApi.Webpack.getStore("ChannelStore");
        if (!this.PresenceStore || !this.ChannelStore) return;

        this.PresenceStore.addChangeListener(this.onPresenceChange);
        BdApi.DOM.addStyle("los-style", `
            .los-text { font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .los-text:empty { display: none; }
        `);

        const root = document.querySelector('nav[class*="privateChannels"]') || document.body;
        this.observer = new MutationObserver(() => {
            if (this.scanQueued) return;
            this.scanQueued = true;
            requestAnimationFrame(() => { this.scanQueued = false; this.scan(); });
        });
        this.observer.observe(root, { childList: true, subtree: true });
        this.scan();
        this.tickInterval = setInterval(() => {
            if (document.querySelector(".los-slot")) this.updateTexts();
        }, 30_000);
    }

    stop() {
        this.PresenceStore?.removeChangeListener(this.onPresenceChange);
        this.observer?.disconnect();
        clearInterval(this.tickInterval);
        BdApi.DOM.removeStyle("los-style");
        document.querySelectorAll(".los-slot").forEach(el => el.remove());
        this.lastSeen.clear();
        this.knownStatus.clear();
        this.warnedOnce = false;
    }

    status(id) {
        try { return this.PresenceStore.getStatus(id) ?? "online"; }
        catch (e) {
            if (!this.warnedOnce) { this.warnedOnce = true; console.warn(`[${NAME}] status lookup broke`, e); }
            return "online";
        }
    }

    isOffline(id) { return this.status(id) === "offline"; }

    onPresenceChange() {
        for (const id of this.knownStatus.keys()) {
            const cur = this.status(id);
            if (this.knownStatus.get(id) !== "offline" && cur === "offline") this.mark(id);
            this.knownStatus.set(id, cur);
        }
    }

    mark(id) {
        this.lastSeen.delete(id);
        this.lastSeen.set(id, Date.now());
        evict(this.lastSeen);
    }

    ago(ms) {
        const s = Math.max(0, ms) / 1000; if (s < 60) return `${s | 0}s ago`;
        const m = s / 60; if (m < 60) return `${m | 0}m ago`;
        const h = m / 60; if (h < 24) return `${h | 0}h ago`;
        const d = h / 24; return d < 7 ? `${d | 0}d ago` : `${(d / 7) | 0}w ago`;
    }

    formatTime(ts) {
        return this.settings.timeFormat === "exact"
            ? new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
            : this.ago(Date.now() - ts);
    }

    getRecipientId(row) {
        const channelId = (row.getAttribute("data-list-item-id") || "").split("___").pop();
        if (!/^\d+$/.test(channelId)) return null;
        try {
            const channel = this.ChannelStore.getChannel(channelId);
            return channel?.type === 1 ? channel.recipients?.[0] ?? null : null;
        } catch { return null; }
    }

    scan() {
        document.querySelectorAll('[data-list-item-id^="private-channels-uid"]').forEach(row => {
            const id = this.getRecipientId(row);
            if (!id) return;
            if (!this.knownStatus.has(id)) { this.knownStatus.set(id, this.status(id)); evict(this.knownStatus); }
            if (row.querySelector(":scope .los-slot")) return;
            const content = row.querySelector('a[class*="link_"] [class*="content_"]');
            if (!content) return;
            const slot = document.createElement("div");
            slot.className = "los-slot los-text";
            slot.dataset.userId = id;
            content.appendChild(slot);
        });
        this.updateTexts();
    }

    updateTexts() {
        document.querySelectorAll(".los-slot").forEach(slot => {
            const ts = this.lastSeen.get(slot.dataset.userId);
            const show = ts !== undefined && this.isOffline(slot.dataset.userId);
            slot.textContent = show ? `${this.settings.label} ${this.formatTime(ts)}` : "";
            if (show) slot.title = new Date(ts).toLocaleString();
            else slot.removeAttribute("title");
        });
    }

    saveSettings() {
        BdApi.Data.save(NAME, "settings", this.settings);
        this.updateTexts();
    }

    dropdown(title, current, options, onChange) {
        const { React, ReactDOM } = BdApi;

        function Select() {
            const [open, setOpen] = React.useState(false);
            const [pos, setPos] = React.useState(null);
            const triggerRef = React.useRef(null);

            React.useEffect(() => {
                if (!open) return;
                const rect = triggerRef.current.getBoundingClientRect();
                setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
                const close = e => {
                    if (triggerRef.current?.contains(e.target) || e.target.closest(".los-dropdown-list")) return;
                    setOpen(false);
                };
                document.addEventListener("mousedown", close);
                return () => document.removeEventListener("mousedown", close);
            }, [open]);

            const list = open && pos && ReactDOM.createPortal(
                React.createElement("div", {
                    className: "los-dropdown-list",
                    style: {
                        position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 99999,
                        borderRadius: "4px", overflow: "hidden",
                        background: "var(--background-secondary)", boxShadow: "var(--elevation-high)"
                    }
                }, options.map(([label, val]) => React.createElement("div", {
                    key: val,
                    onClick: () => { onChange(val); setOpen(false); },
                    onMouseEnter: e => { if (val !== current) e.currentTarget.style.background = "var(--background-modifier-hover)"; },
                    onMouseLeave: e => { if (val !== current) e.currentTarget.style.background = "transparent"; },
                    style: {
                        padding: "10px 12px", cursor: "pointer",
                        background: val === current ? "var(--brand-experiment)" : "transparent",
                        color: val === current ? "#fff" : "var(--text-normal)"
                    }
                }, label))),
                document.body
            );

            return React.createElement(React.Fragment, null,
                React.createElement("div", {
                    ref: triggerRef, onClick: () => setOpen(o => !o),
                    style: {
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "10px 12px", borderRadius: "4px", cursor: "pointer",
                        background: "var(--input-background)", border: "1px solid var(--background-modifier-accent)"
                    }
                },
                    React.createElement("span", null, options.find(([, v]) => v === current)?.[0] ?? current),
                    React.createElement("span", { style: { opacity: 0.6 } }, "▾")
                ),
                list
            );
        }

        return React.createElement("div", { style: { marginBottom: "20px" } },
            React.createElement("div", { style: { marginBottom: "8px", fontWeight: 600, fontSize: "14px", color: "var(--header-primary)" } }, title),
            React.createElement(Select)
        );
    }

    getSettingsPanel() {
        const React = BdApi.React;
        const self = this;

        return React.createElement(function Panel() {
            const [, rerender] = React.useReducer(n => n + 1, 0);
            return React.createElement("div", null,
                self.dropdown("Label text", self.settings.label, LABELS.map(l => [l, l]), v => {
                    self.settings.label = v; self.saveSettings(); rerender();
                }),
                self.dropdown("Time format", self.settings.timeFormat, FORMATS, v => {
                    self.settings.timeFormat = v; self.saveSettings(); rerender();
                })
            );
        });
    }

    getTracked() {
        const out = {};
        this.lastSeen.forEach((ts, id) => out[id] = this.ago(Date.now() - ts));
        console.table(out);
    }
};
