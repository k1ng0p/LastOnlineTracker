/**
 * @name LastOnlineTracker
 * @author k1ng_op
 * @description Shows "Active X ago" under usernames in the DM list.
 * @version 1.2.5
 * @authorId 641266820187160576
 * @authorLink https://github.com/k1ng0p
 * @source https://github.com/k1ng0p/LastOnlineTracker
 * @updateUrl https://raw.githubusercontent.com/k1ng0p/LastOnlineTracker/main/LastOnlineTracker.plugin.js
 */

const config = {
    changelog: [
        { title: "Added", type: "added", items: [
            "Persistent last-seen storage — keeps last-seen times saved after Discord restarts",
            "OFF by default, with a warning popup before you can turn it on"
        ] }
    ]
};

const NAME = "LastOnlineTracker";
const VERSION = "1.2.5";
const MAX_TRACKED = 500;
const LABELS = ["Active", "Last seen", "Online", "Seen"];
const FORMATS = [["Relative (5m ago)", "relative"], ["Exact (2:34 PM)", "exact"]];
const PERSIST_NOTE = "keep last-seen saved after Discord restarts. OFF by default.";
const PERSIST_WARNING = "Don't turn this on if you don't know how persistent last-seen works. " +
    "Saved times only update when that person goes offline again — they don't refresh on their own, " +
    "so a saved time can sit there and look outdated. Don't blame the plugin for showing an inaccurate time.";

function evict(map) {
    if (map.size > MAX_TRACKED) map.delete(map.keys().next().value);
}

module.exports = class LastOnlineTracker {
    constructor() {
        this.lastSeen = new Map();
        this.knownStatus = new Map();
        this.warnedOnce = false;
        this.saveTimer = null;
        this.onPresenceChange = this.onPresenceChange.bind(this);

        const saved = BdApi.Data.load(NAME, "settings") || {};
        this.settings = {
            label: LABELS.includes(saved.label) ? saved.label : "Active",
            timeFormat: FORMATS.some(([, v]) => v === saved.timeFormat) ? saved.timeFormat : "relative",
            persist: saved.persist === true
        };
        this.persistArmed = this.settings.persist;
    }

    start() {
        const lastVersion = BdApi.Data.load(NAME, "lastVersion");
        if (lastVersion !== VERSION) {
            try { BdApi.UI.showChangelogModal({ title: NAME, subtitle: `v${VERSION}`, changes: config.changelog }); }
            catch (e) { console.warn(`[${NAME}] changelog popup failed`, e); }
            BdApi.Data.save(NAME, "lastVersion", VERSION);
        }

        this.PresenceStore = BdApi.Webpack.getStore("PresenceStore");
        this.ChannelStore = BdApi.Webpack.getStore("ChannelStore");
        if (!this.PresenceStore || !this.ChannelStore) return;

        if (this.persistArmed) {
            const savedData = BdApi.Data.load(NAME, "lastSeenData") || {};
            for (const [id, ts] of Object.entries(savedData))
                if (typeof ts === "number" && ts > 0) this.lastSeen.set(id, ts);
        }

        this.PresenceStore.addChangeListener(this.onPresenceChange);
        BdApi.DOM.addStyle("los-style", `
            .los-text { font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .los-text:empty { display: none; }
            .los-settings > *:last-child hr,
            .los-settings > *:last-child [class*="divider"] { display: none !important; }
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
        this.flushSave();
        BdApi.DOM.removeStyle("los-style");
        document.querySelectorAll(".los-slot").forEach(el => el.remove());
        this.knownStatus.clear();
        this.warnedOnce = false;
        if (!this.persistArmed) this.lastSeen.clear();
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
        this.updateTexts();
    }

    mark(id) {
        this.lastSeen.delete(id);
        this.lastSeen.set(id, Date.now());
        evict(this.lastSeen);
        this.queueSave();
    }

    persistNow() {
        if (!this.persistArmed) return;
        try { BdApi.Data.save(NAME, "lastSeenData", Object.fromEntries(this.lastSeen)); }
        catch (e) { console.error(`[${NAME}] failed to save data`, e); }
    }

    queueSave() {
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.persistNow(), 1500);
    }

    flushSave() {
        if (!this.saveTimer) return;
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
        this.persistNow();
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
        document.querySelectorAll('[data-list-item-id]').forEach(row => {
            const id = this.getRecipientId(row);
            if (!id) return;
            if (!this.knownStatus.has(id)) { this.knownStatus.set(id, this.status(id)); evict(this.knownStatus); }
            if (row.querySelector(":scope .los-slot")) return;
            const content = row.querySelector('[class*="content_"]') || row;
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
    }

    enablePersist(setOn) {
        BdApi.UI.showConfirmationModal("Before you enable this", PERSIST_WARNING, {
            confirmText: "I understand, enable it",
            cancelText: "Cancel",
            onConfirm: () => {
                this.persistArmed = true;
                this.settings.persist = true;
                this.saveSettings();
                this.queueSave();
                setOn(true);
            }
        });
    }

    disablePersist(setOn) {
        this.persistArmed = false;
        this.settings.persist = false;
        this.saveSettings();
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
        BdApi.Data.delete(NAME, "lastSeenData");
        setOn(false);
    }

    getSettingsPanel() {
        const { SettingItem, DropdownInput } = BdApi.Components;
        if (!SettingItem || !DropdownInput) {
            const div = document.createElement("div");
            div.textContent = `${NAME}: your BD version is missing required UI components.`;
            div.style.cssText = "padding:10px;color:var(--text-danger)";
            return div;
        }

        const React = BdApi.React;
        const self = this;
        const field = (id, name, options, value, onChange) =>
            React.createElement(SettingItem, { id, name },
                React.createElement(DropdownInput, { options, value, onChange }));

        function Switch({ on, onClick }) {
            return React.createElement("div", {
                onClick,
                style: {
                    width: "40px", height: "24px", borderRadius: "12px", cursor: "pointer", position: "relative", flexShrink: 0,
                    background: on ? "#5865f2" : "#80848e", transition: "background-color 0.2s ease"
                }
            }, React.createElement("div", {
                style: {
                    width: "20px", height: "20px", borderRadius: "50%", background: "#fff",
                    position: "absolute", top: "2px", left: on ? "18px" : "2px",
                    transition: "left 0.2s ease", boxShadow: "0 1px 3px rgba(0,0,0,0.3)"
                }
            }));
        }

        function Panel() {
            const [label, setLabel] = React.useState(self.settings.label);
            const [timeFormat, setTimeFormat] = React.useState(self.settings.timeFormat);
            const [persist, setPersist] = React.useState(self.persistArmed);

            const update = (key, val, setter) => {
                self.settings[key] = val;
                self.saveSettings();
                self.updateTexts();
                setter(val);
            };

            return React.createElement("div", { className: "los-settings" },
                field("los-label", "Label text", LABELS.map(l => ({ label: l, value: l })), label,
                    v => update("label", v, setLabel)),
                field("los-format", "Time format", FORMATS.map(([l, v]) => ({ label: l, value: v })), timeFormat,
                    v => update("timeFormat", v, setTimeFormat)),
                React.createElement("div", {
                    style: {
                        display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px",
                        padding: "10px 0", borderTop: "1px solid var(--background-modifier-accent)"
                    }
                },
                    React.createElement("div", { style: { flex: 1 } },
                        React.createElement("div", { style: { color: "var(--header-primary)", fontSize: "16px", fontWeight: 600 } }, "Persist last-seen"),
                        React.createElement("div", { style: { color: "var(--text-muted)", fontSize: "14px", marginTop: "4px" } }, PERSIST_NOTE)
                    ),
                    React.createElement(Switch, {
                        on: persist,
                        onClick: () => persist ? self.disablePersist(setPersist) : self.enablePersist(setPersist)
                    }))
            );
        }

        return React.createElement(Panel);
    }
};
