/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";
import { React } from "@webpack/common";
import { findByPropsLazy } from "@webpack";
import { addContextMenuPatch, removeContextMenuPatch, findGroupChildrenByChildId } from "@api/ContextMenu";
import { addMemberListDecorator, removeMemberListDecorator } from "@api/MemberListDecorators";
import { Menu } from "@webpack/common";

const PresenceStore = findByPropsLazy("getStatus", "getActivities");

const lastSeenMap   = new Map<string, number>();
const seenOnlineSet = new Set<string>();

function ago(ms: number): string {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return d < 7 ? `${d}d ago` : `${Math.floor(d / 7)}w ago`;
}

function isOffline(userId: string): boolean {
    try { return (PresenceStore.getStatus(userId) ?? "offline") === "offline"; }
    catch { return true; }
}

const subStyle: React.CSSProperties = {
    display: "block", fontSize: "12px", fontWeight: 400,
    lineHeight: "16px", color: "var(--text-muted)",
    overflow: "hidden", whiteSpace: "nowrap",
    textOverflow: "ellipsis", userSelect: "none",
};

function LastSeenText({ userId }: { userId: string; }) {
    const [, tick] = React.useReducer(n => n + 1, 0);
    React.useEffect(() => {
        const t = setInterval(tick, 30_000);
        return () => clearInterval(t);
    }, []);
    if (!isOffline(userId)) return null;
    const ts = lastSeenMap.get(userId);
    if (!ts) return null;
    return <span style={subStyle}>Active {ago(Date.now() - ts)}</span>;
}

const ctxPatch = (_navId: string, children: any[], props: any) => {
    const userId: string | undefined = props?.user?.id ?? props?.guildMember?.userId;
    if (!userId || !isOffline(userId)) return;
    const ts = lastSeenMap.get(userId);
    if (!ts) return;
    const group = findGroupChildrenByChildId("user-profile", children)
        ?? findGroupChildrenByChildId("mark-as-read", children)
        ?? children;
    group.push(
        <Menu.MenuSeparator key="lot-sep" />,
        <Menu.MenuItem
            key="lot-lastseen"
            id="lot-lastseen"
            label={`Active ${ago(Date.now() - ts)}`}
            subtext={`Last online: ${new Date(ts).toLocaleString()}`}
            disabled
        />
    );
};

const decoratorStyle: React.CSSProperties = {
    fontSize: "11px", color: "var(--text-muted)", userSelect: "none",
};

export default definePlugin({
    name: "LastOnlineTracker",
    description: "Shows 'Active X ago' below usernames in the DM list. Resets on restart.",
    authors: [{ name: "k1ng_op", id: 641266820187160576 }],
    dependencies: ["MemberListDecoratorsAPI", "ContextMenuAPI"],

    patches: [
        // ── DM list left sidebar ──────────────────────────────────────────────
        // Confirmed from console:
        //   r = user object  (r.isSystemUser(), r.username, r.id)
        //   t = channel object (t.isSystemDM(), t.isMultiUserDM())
        //
        // THE BUG WE FIXED:
        //   ?? has HIGHER precedence than ?:
        //   So:  dmSubtext(r) ?? t.isSystemDM() ? A : B
        //   Parses as: (dmSubtext(r) ?? t.isSystemDM()) ? A : B
        //   When our fn returns JSX (truthy): JSX ? A : B = A = "Official Discord Message" ← WRONG
        //
        // THE FIX:
        //   Capture the ENTIRE original subText expression (up to ,highlighted:)
        //   and pass it as a lazy thunk: () => originalExpr
        //   Our function calls getOriginal() only when it has no data.
        //   When it has data it returns our JSX directly — no ternary involved.
        {
            find: '"PrivateChannel"',
            replacement: {
                // Captures the full Discord subText expression from t.isSystemDM()
                // all the way to the next prop ,highlighted: using lazy matching.
                // The full expression is passed as a thunk so it only evaluates
                // when we actually need it (saves work + avoids side effects).
                match: /,subText:(t\.isSystemDM\(\)[\s\S]*?),highlighted:/,
                replace: (_, expr) =>
                    `,subText:$self.dmSubtext(r,()=>(${expr})),highlighted:`,
            },
            optional: true,
        },
    ],

    // user       = `r` in compiled code = Discord user object
    // getOriginal = thunk that evaluates Discord's full subText expression
    //               (system DM label / group size / activity status / null)
    dmSubtext(user: any, getOriginal: () => React.ReactNode): React.ReactNode {
        const userId: string | undefined = user?.id;

        // No userId, or user is online/idle/dnd → show Discord's own subtext
        if (!userId || !isOffline(userId)) return getOriginal();

        const ts = lastSeenMap.get(userId);

        // Not tracked yet → show Discord's own subtext (nothing for offline users)
        if (!ts) return getOriginal();

        // We have data → return our element directly, no ternary involved
        return <LastSeenText key="lot-dm" userId={userId} />;
    },

    getTracked() {
        const out: Record<string, string> = {};
        lastSeenMap.forEach((ts, id) => { out[id] = ago(Date.now() - ts); });
        console.table(out);
        return out;
    },

    __test(userId: string) {
        seenOnlineSet.add(userId);
        lastSeenMap.set(userId, Date.now() - 5 * 60 * 1000);
        console.log(`[LastOnlineTracker] Injected test data for ${userId} — scroll the DM list to re-render`);
    },

    flux: {
        PRESENCE_UPDATES({ updates }: {
            updates?: Array<{
                user:          { id: string };
                status:        string;
                clientStatus?: Record<string, string>;
            }>;
        }) {
            if (!Array.isArray(updates)) return;
            for (const { user, status, clientStatus } of updates) {
                const fullyOffline =
                    status === "offline" &&
                    (!clientStatus || Object.keys(clientStatus).length === 0);
                if (!fullyOffline) {
                    seenOnlineSet.add(user.id);
                    lastSeenMap.delete(user.id);
                } else if (seenOnlineSet.has(user.id)) {
                    lastSeenMap.set(user.id, Date.now());
                    seenOnlineSet.delete(user.id);
                }
            }
        },
    },

    start() {
        addMemberListDecorator("LastOnlineTracker", props => {
            const user = (props as any).user;
            if (!user?.id || !isOffline(user.id)) return null;
            const ts = lastSeenMap.get(user.id);
            if (!ts) return null;
            return <span style={decoratorStyle}>{ago(Date.now() - ts)}</span>;
        });
        addContextMenuPatch("user-context", ctxPatch);
        addContextMenuPatch("gdm-context", ctxPatch);
    },

    stop() {
        removeMemberListDecorator("LastOnlineTracker");
        removeContextMenuPatch("user-context", ctxPatch);
        removeContextMenuPatch("gdm-context", ctxPatch);
        lastSeenMap.clear();
        seenOnlineSet.clear();
    },
});
