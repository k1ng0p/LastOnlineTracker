import definePlugin from "@utils/types";
import { React, ReactDOM } from "@webpack/common";
import { findByPropsLazy } from "@webpack";
import { addMemberListDecorator, removeMemberListDecorator } from "@api/MemberListDecorators";

const PresenceStore = findByPropsLazy("getStatus", "getActivities");

const lastSeen = new Map<string, number>();
let ready = false;
let settleTimer: ReturnType<typeof setTimeout> | null = null;
let hardCapTimer: ReturnType<typeof setTimeout> | null = null;
let warnedOnce = false;

function ago(ms: number) {
    const s = ms / 1000; if (s < 60) return `${s | 0}s ago`;
    const m = s / 60; if (m < 60) return `${m | 0}m ago`;
    const h = m / 60; if (h < 24) return `${h | 0}h ago`;
    const d = h / 24; return d < 7 ? `${d | 0}d ago` : `${(d / 7) | 0}w ago`;
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

// discord dumps a burst of "offline" presence updates right after start,
// mixed in with the real ones. instead of guessing a fixed delay, wait
// until updates stop arriving for a bit, with a hard cap as a fallback
// in case they never settle.
function bumpSettle() {
    if (ready) return;
    clearTimeout(settleTimer!);
    settleTimer = setTimeout(() => { ready = true; }, 1500);
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

export default definePlugin({
    name: "LastOnlineTracker",
    description: "shows 'Active X ago' under usernames in the DM list.",
    authors: [{ name: "k1ng_op", id: 641266820187160576n }],
    dependencies: ["MemberListDecoratorsAPI"],

    flux: {
        PRESENCE_UPDATES({ updates }: { updates?: Array<{ user: { id: string }; status: string; clientStatus?: Record<string, string>; }>; }) {
            if (!updates) return;
            if (!ready) bumpSettle();
            for (const { user, status, clientStatus } of updates) {
                if (!ready) continue;
                if (status === "offline" && !Object.keys(clientStatus ?? {}).length) lastSeen.set(user.id, Date.now());
            }
        }
    },

    start() {
        ready = false;
        bumpSettle();
        hardCapTimer = setTimeout(() => { ready = true; }, 8000);

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
    },

    stop() {
        document.getElementById("los-style")?.remove();
        document.querySelectorAll(".los-slot").forEach(el => el.remove());
        removeMemberListDecorator("LastOnlineTracker");
        clearTimeout(settleTimer!);
        clearTimeout(hardCapTimer!);
        ready = false;
        lastSeen.clear();
    },

    getTracked() {
        const out: Record<string, string> = {};
        lastSeen.forEach((ts, id) => out[id] = ago(Date.now() - ts));
        console.table(out);
    },
});
