import definePlugin, { OptionType } from "@utils/types";
import { definePluginSettings } from "@api/Settings";
import { DataStore } from "@api/index";
import { openModal } from "@utils/modal";
import { React, ReactDOM, Forms, Modal } from "@webpack/common";
import { findByPropsLazy } from "@webpack";
import { addMemberListDecorator, removeMemberListDecorator } from "@api/MemberListDecorators";

const PresenceStore = findByPropsLazy("getStatus", "getActivities");
const MAX_TRACKED = 500;
const STORE_KEY = "LastOnlineTracker_data";
const btnStyle = { padding: "8px 16px", borderRadius: "4px", cursor: "pointer", fontWeight: 500, fontSize: "14px" } as const;

let persistArmed = false;
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let warnedOnce = false;

const lastSeen = new Map<string, number>();
const seenOnline = new Set<string>();

function evict(store: Map<any, any> | Set<any>) {
    if (store.size > MAX_TRACKED) store.delete(store.keys().next().value);
}

function mark(id: string) {
    lastSeen.delete(id);
    lastSeen.set(id, Date.now());
    evict(lastSeen);
    save();
}

async function loadPersistState() {
    if (loaded) return;
    loaded = true;
    try {
        const saved = await DataStore.get(STORE_KEY) as { enabled?: boolean; data?: Record<string, unknown>; } | undefined;
        if (!saved) return;
        persistArmed = !!saved.enabled;
        if (persistArmed)
            for (const [id, ts] of Object.entries(saved.data ?? {}))
                if (typeof ts === "number" && ts > 0) lastSeen.set(id, ts);
    } catch (e) { console.error("LastOnlineTracker: failed to load saved data", e); }
}

async function persistNow() {
    if (!persistArmed) return;
    try { await DataStore.set(STORE_KEY, { enabled: true, data: Object.fromEntries(lastSeen) }); }
    catch (e) { console.error("LastOnlineTracker: failed to save data", e); }
}

function save() {
    clearTimeout(saveTimer!);
    saveTimer = setTimeout(persistNow, 1500);
}

function flushSave() {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    void persistNow();
}

function ago(ms: number) {
    const s = Math.max(0, ms) / 1000;
    if (s < 60) return `${s | 0}s ago`;
    const m = s / 60;
    if (m < 60) return `${m | 0}m ago`;
    const h = m / 60;
    if (h < 24) return `${h | 0}h ago`;
    const d = h / 24;
    return d < 7 ? `${d | 0}d ago` : `${(d / 7) | 0}w ago`;
}

function formatTime(ts: number) {
    return settings.store.timeFormat === "exact"
        ? new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : ago(Date.now() - ts);
}

function isOffline(id: string) {
    try { return (PresenceStore.getStatus(id) ?? "online") === "offline"; }
    catch (e) {
        if (!warnedOnce) {
            warnedOnce = true;
            console.warn("LastOnlineTracker: status check broke, plugin probably needs an update", e);
        }
        return false;
    }
}

function WarnModal({ modalProps, onConfirm }: { modalProps: any; onConfirm: () => void; }) {
    return (
        <Modal {...modalProps} title="Before you enable this">
            <Forms.FormText style={{ margin: "16px 0", fontSize: "16px", lineHeight: "22px", color: "var(--text-normal)" }}>
                Don't turn this on if you don't know how persistent last-seen works.
                Saved times only update when that person goes offline again — they
                don't refresh on their own, so a saved time can sit there and look
                outdated. Don't blame the plugin for showing an inaccurate time.
            </Forms.FormText>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", margin: "8px 0 16px" }}>
                <div onClick={modalProps.onClose} style={{ ...btnStyle, background: "transparent", color: "var(--text-normal)" }}>Cancel</div>
                <div onClick={() => { onConfirm(); modalProps.onClose(); }} style={{ ...btnStyle, background: "#da373c", color: "#fff" }}>I understand, enable it</div>
            </div>
        </Modal>
    );
}

function PersistToggle() {
    const [on, setOn] = React.useState(persistArmed);

    const disable = () => {
        persistArmed = false;
        clearTimeout(saveTimer!);
        saveTimer = null;
        lastSeen.clear();
        void DataStore.del(STORE_KEY);
        setOn(false);
    };

    const enable = () => openModal(modalProps => (
        <WarnModal modalProps={modalProps} onConfirm={() => { persistArmed = true; save(); setOn(true); }} />
    ));

    return (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
            <Forms.FormText style={{ color: "var(--text-normal)", fontSize: "16px", flex: 1 }}>
                keep last-seen saved after Discord restarts. OFF by default.
            </Forms.FormText>
            <div onClick={() => (on ? disable() : enable())} style={{
                width: "40px", height: "24px", borderRadius: "12px", cursor: "pointer", position: "relative", flexShrink: 0,
                background: on ? "#5865f2" : "#80848e", transition: "background-color 0.2s ease"
            }}>
                <div style={{
                    width: "20px", height: "20px", borderRadius: "50%", background: "#fff",
                    position: "absolute", top: "2px", left: on ? "18px" : "2px",
                    transition: "left 0.2s ease", boxShadow: "0 1px 3px rgba(0,0,0,0.3)"
                }} />
            </div>
        </div>
    );
}

const settings = definePluginSettings({
    label: {
        type: OptionType.SELECT,
        description: "text shown before the time",
        options: [
            { label: "Active", value: "Active", default: true },
            { label: "Last seen", value: "Last seen" },
            { label: "Online", value: "Online" },
            { label: "Seen", value: "Seen" },
        ],
    },
    timeFormat: {
        type: OptionType.SELECT,
        description: "how the time is shown",
        options: [
            { label: "Relative (5m ago)", value: "relative", default: true },
            { label: "Exact (2:34 PM)", value: "exact" },
        ],
    },
    persist: {
        type: OptionType.COMPONENT,
        description: "keep last-seen saved after Discord restarts. OFF by default.",
        component: PersistToggle,
    },
});

function BelowNameText({ userId }: { userId: string; }) {
    const anchorRef = React.useRef<HTMLSpanElement>(null);
    const [slot, setSlot] = React.useState<HTMLElement | null>(null);
    const [, tick] = React.useReducer(n => n + 1, 0);

    React.useEffect(() => {
        const t = setInterval(tick, 30_000);
        return () => clearInterval(t);
    }, []);

    React.useLayoutEffect(() => {
        const content = anchorRef.current?.closest<HTMLElement>('[class*="content_"]');
        if (!content) return;
        let el = content.querySelector<HTMLElement>(":scope > .los-slot");
        if (el && el.dataset.userId !== userId) { el.remove(); el = null; }
        if (!el) {
            el = document.createElement("div");
            el.className = "los-slot los-text";
            el.dataset.userId = userId;
            content.appendChild(el);
        }
        setSlot(el);
        return () => el?.remove();
    }, [userId]);

    const ts = lastSeen.get(userId);
    const show = ts !== undefined && isOffline(userId);

    return (
        <>
            <span ref={anchorRef} style={{ display: "none" }} />
            {slot && ReactDOM.createPortal(
                show
                    ? <span title={new Date(ts!).toLocaleString()}>{settings.store.label} {formatTime(ts!)}</span>
                    : null,
                slot
            )}
        </>
    );
}

export default definePlugin({
    name: "LastOnlineTracker",
    description: "shows 'Active X ago' under usernames in the DM list.",
    authors: [{ name: "k1ng_op", id: 641266820187160576n }],
    dependencies: ["MemberListDecoratorsAPI"],
    settings,

    flux: {
        PRESENCE_UPDATES({ updates }: { updates?: Array<{ user: { id: string }; status: string; clientStatus?: Record<string, string>; }>; }) {
            if (!updates) return;
            for (const { user, status, clientStatus } of updates) {
                const offline = status === "offline" && !Object.keys(clientStatus ?? {}).length;
                if (!offline) { seenOnline.add(user.id); evict(seenOnline); continue; }
                if (seenOnline.delete(user.id)) mark(user.id);
            }
        }
    },

    async start() {
        await loadPersistState();
        document.querySelectorAll(".los-slot").forEach(el => el.remove());

        if (!document.getElementById("los-style")) {
            const style = document.createElement("style");
            style.id = "los-style";
            style.textContent = `
                .los-text {
                    font-size: 12px !important; font-weight: 400 !important; line-height: 16px !important;
                    color: var(--text-muted) !important; font-family: var(--font-primary) !important;
                    white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important;
                }
                .los-text:empty { display: none !important; }
            `;
            document.head.appendChild(style);
        }

        addMemberListDecorator("LastOnlineTracker", props => {
            const id = (props as any).user?.id;
            return id ? <BelowNameText userId={id} /> : null;
        });
    },

    stop() {
        flushSave();
        document.getElementById("los-style")?.remove();
        document.querySelectorAll(".los-slot").forEach(el => el.remove());
        removeMemberListDecorator("LastOnlineTracker");
        seenOnline.clear();
        warnedOnce = false;
        loaded = false;
        if (!persistArmed) lastSeen.clear();
    },
});
