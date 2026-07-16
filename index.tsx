import definePlugin, { OptionType } from "@utils/types";
import { definePluginSettings } from "@api/Settings";
import { React, ReactDOM } from "@webpack/common";
import { findByPropsLazy } from "@webpack";
import { DataStore } from "@api/index";
import { addContextMenuPatch, removeContextMenuPatch, findGroupChildrenByChildId } from "@api/ContextMenu";
import { addMemberListDecorator, removeMemberListDecorator } from "@api/MemberListDecorators";
import { Menu } from "@webpack/common";

const PresenceStore = findByPropsLazy("getStatus", "getActivities");
const STORE_KEY = "lastOnlineTracker_data";

const settings = definePluginSettings({
    persist: {
        type: OptionType.BOOLEAN,
        default: false,
        description: "keep last-seen after restart. off by default - saved times don't refresh until that person goes offline again, so they can go stale"
    }
});

const lastSeen = new Map<string, number>();
const seenOnline = new Set<string>();
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function load() {
    if (!settings.store.persist || loaded) return;
    loaded = true;
    try {
        const saved = await DataStore.get(STORE_KEY);
        if (saved && typeof saved === "object")
            for (const [id, ts] of Object.entries(saved as Record<string, unknown>))
                if (typeof ts === "number" && ts > 0) lastSeen.set(id, ts);
    } catch (e) { console.error("LastOnlineTracker load failed", e); }
}

async function persistNow() {
    if (!settings.store.persist) return;
    try { await DataStore.set(STORE_KEY, Object.fromEntries(lastSeen)); }
    catch (e) { console.error("LastOnlineTracker save failed", e); }
}

function save() {
    if (!settings.store.persist) return;
    clearTimeout(saveTimer!);
    saveTimer = setTimeout(persistNow, 1500);
}

function flushSave() {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    void persistNow();
}

function mark(id: string) {
    lastSeen.set(id, Date.now());
    save();
}

function ago(ms: number) {
    const s = ms / 1000; if (s < 60) return `${s | 0}s ago`;
    const m = s / 60; if (m < 60) return `${m | 0}m ago`;
    const h = m / 60; if (h < 24) return `${h | 0}h ago`;
    const d = h / 24; return d < 7 ? `${d | 0}d ago` : `${(d / 7) | 0}w ago`;
}

function isOffline(id: string) {
    try { return (PresenceStore.getStatus(id) ?? "online") === "offline"; }
    catch { return false; }
}

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
        if (!el) {
            el = document.createElement("div");
            el.className = "los-slot los-text";
            content.appendChild(el);
        }
        setSlot(el);
        return () => el?.remove();
    }, []);

    const ts = lastSeen.get(userId);
    const show = ts !== undefined && isOffline(userId);
    return (
        <>
            <span ref={anchorRef} style={{ display: "none" }} />
            {slot && ReactDOM.createPortal(show ? `Active ${ago(Date.now() - ts!)}` : "", slot)}
        </>
    );
}

const ctxPatch = (_: string, children: any[], props: any) => {
    const id = props?.user?.id ?? props?.guildMember?.userId;
    if (!id || !isOffline(id)) return;
    const ts = lastSeen.get(id);
    if (ts === undefined) return;
    const group = findGroupChildrenByChildId("user-profile", children)
        ?? findGroupChildrenByChildId("mark-as-read", children)
        ?? children;
    group.push(
        <Menu.MenuSeparator key="los-sep" />,
        <Menu.MenuItem key="los-item" id="los-item" disabled
            label={`Active ${ago(Date.now() - ts)}`}
            subtext={`Last online: ${new Date(ts).toLocaleString()}`} />
    );
};

export default definePlugin({
    name: "LastOnlineTracker",
    description: "shows 'Active X ago' under usernames in the DM list.",
    authors: [{ name: "k1ng_op", id: 641266820187160576n }],
    dependencies: ["MemberListDecoratorsAPI", "ContextMenuAPI"],
    settings,

    flux: {
        PRESENCE_UPDATES({ updates }: { updates?: Array<{ user: { id: string }; status: string; clientStatus?: Record<string, string>; }>; }) {
            if (!updates) return;
            for (const { user, status, clientStatus } of updates) {
                const offline = status === "offline" && !Object.keys(clientStatus ?? {}).length;
                if (!offline) seenOnline.add(user.id);
                else if (seenOnline.delete(user.id)) mark(user.id);
            }
        }
    },

    async start() {
        await load();
        try {
            const statuses = PresenceStore.getStatuses?.() ?? {};
            for (const [id, status] of Object.entries(statuses as Record<string, string>))
                if (status !== "offline") seenOnline.add(id);
        } catch {}

        document.getElementById("los-style")?.remove();
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

        addMemberListDecorator("LastOnlineTracker", props => {
            const id = (props as any).user?.id;
            return id ? <BelowNameText userId={id} /> : null;
        });
        addContextMenuPatch("user-context", ctxPatch);
        addContextMenuPatch("gdm-context", ctxPatch);
    },

    stop() {
        flushSave();
        document.getElementById("los-style")?.remove();
        document.querySelectorAll(".los-slot").forEach(el => el.remove());
        removeMemberListDecorator("LastOnlineTracker");
        removeContextMenuPatch("user-context", ctxPatch);
        removeContextMenuPatch("gdm-context", ctxPatch);
        seenOnline.clear();
        if (!settings.store.persist) lastSeen.clear();
        loaded = false;
    },

    getTracked() {
        const out: Record<string, string> = {};
        lastSeen.forEach((ts, id) => out[id] = ago(Date.now() - ts));
        console.table(out);
        return out;
    },

    async clearAll() {
        lastSeen.clear();
        seenOnline.clear();
        flushSave();
        await DataStore.del(STORE_KEY);
    },
});
