import definePlugin, { OptionType } from "@utils/types";
import { definePluginSettings } from "@api/Settings";
import { React, ReactDOM } from "@webpack/common";
import { findByPropsLazy } from "@webpack";
import { addMemberListDecorator, removeMemberListDecorator } from "@api/MemberListDecorators";

const PresenceStore = findByPropsLazy("getStatus", "getActivities");
const MAX_TRACKED = 500;

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
});

const lastSeen = new Map<string, number>();
const seenOnline = new Set<string>();
let warnedOnce = false;

function evict(store: Map<any, any> | Set<any>) {
    if (store.size <= MAX_TRACKED) return;
    store.delete(store.keys().next().value);
}

function ago(ms: number) {
    const s = Math.max(0, ms) / 1000; if (s < 60) return `${s | 0}s ago`;
    const m = s / 60; if (m < 60) return `${m | 0}m ago`;
    const h = m / 60; if (h < 24) return `${h | 0}h ago`;
    const d = h / 24; return d < 7 ? `${d | 0}d ago` : `${(d / 7) | 0}w ago`;
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
                    ? <span title={new Date(ts!).toLocaleString()}>
                        {settings.store.label} {formatTime(ts!)}
                    </span>
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
                if (seenOnline.delete(user.id)) { lastSeen.set(user.id, Date.now()); evict(lastSeen); }
            }
        }
    },

    start() {
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
        document.getElementById("los-style")?.remove();
        document.querySelectorAll(".los-slot").forEach(el => el.remove());
        removeMemberListDecorator("LastOnlineTracker");
        seenOnline.clear();
        lastSeen.clear();
        warnedOnce = false;
    },

    getTracked() {
        const out: Record<string, string> = {};
        lastSeen.forEach((ts, id) => out[id] = ago(Date.now() - ts));
        console.table(out);
    },
});
