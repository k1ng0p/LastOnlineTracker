/**
 * @name LastOnlineTracker
 * @author k1ng_op
 * @description Shows "Active X ago" under usernames in the DM list.
 * @version 1.2.2
 * @authorId 641266820187160576
 * @authorLink https://github.com/k1ng0p
 * @source https://github.com/k1ng0p/LastOnlineTracker
 * @updateUrl https://raw.githubusercontent.com/k1ng0p/LastOnlineTracker/main/LastOnlineTracker.plugin.js
 */

const config = {
    changelog: [
        { title: "Bug Fix", type: "fixed", items: [
            "Last seen text was not showing up for anyone",
            "The plugin was too picky about finding DM rows and where to put the text",
            "Text could keep showing for a bit after someone came back online instead of disappearing right away",
            "A popup on first install could silently break the whole plugin if it failed"
        ] }
    ]
};

const NAME = "LastOnlineTracker";
const VERSION = "1.2.2";
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
            try { BdApi.UI.showChangelogModal({ title: NAME, subtitle: `v${VERSION}`, changes: config.changelog }); }
            catch (e) { console.warn(`[${NAME}] changelog popup failed`, e); }
            BdApi.Data.save(NAME, "lastVersion", VERSION);
        }

        this.PresenceStore = BdApi.Webpack.getStore("PresenceStore");
        this.ChannelStore = BdApi.Webpack.getStore("ChannelStore");
        if (!this.PresenceStore || !this.ChannelStore) return;

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
        this.updateTexts();
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

        function Panel() {
            const [label, setLabel] = React.useState(self.settings.label);
            const [timeFormat, setTimeFormat] = React.useState(self.settings.timeFormat);

            const update = (key, val, setter) => {
                self.settings[key] = val;
                BdApi.Data.save(NAME, "settings", self.settings);
                self.updateTexts();
                setter(val);
            };

            return React.createElement("div", { className: "los-settings" },
                field("los-label", "Label text", LABELS.map(l => ({ label: l, value: l })), label,
                    v => update("label", v, setLabel)),
                field("los-format", "Time format", FORMATS.map(([l, v]) => ({ label: l, value: v })), timeFormat,
                    v => update("timeFormat", v, setTimeFormat))
            );
        }

        return React.createElement(Panel);
    }

    getTracked() {
        const out = {};
        this.lastSeen.forEach((ts, id) => out[id] = this.ago(Date.now() - ts));
        console.table(out);
    }
};
