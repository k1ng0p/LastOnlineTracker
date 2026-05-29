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

export default definePlugin({
    name: "LastOnlineTracker",
    description: "Shows 'Active X ago' below usernames in the DM list, styled like Discord's native subtext.",
    authors: [{ name: "k1ng_op", id: 641266820187160576 }],
    dependencies: ["MemberListDecoratorsAPI", "ContextMenuAPI"],

    flux: {
        PRESENCE_UPDATES({ updates }: { updates?: Array<{ user: { id: string }; status: string; clientStatus?: Record<string, string>; }>; }) {
            if (!Array.isArray(updates)) return;
            for (const { user, status, clientStatus } of updates) {
                const fullyOffline = status === "offline" && (!clientStatus || Object.keys(clientStatus).length === 0);
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
        const style = document.createElement("style");
        style.id = "lot-style";
        // This is the non-destructive fix:
        // We set the parent to flex-wrap, and the decorator to 100% width.
        // This pushes ONLY the decorator to the next line.
        style.textContent = `
            /* Wrap nameAndDecorators only for rows with our decorator */
            a[class*="link_"]:has(.lot-decorator-item) [class*="nameAndDecorators_"] {
                flex-wrap: wrap !important;
            }
            /* Allow content area to grow to fit two lines */
            a[class*="link_"]:has(.lot-decorator-item) [class*="content_"] {
                height: auto !important;
                min-height: 34px !important;
            }
            a[class*="link_"]:has(.lot-decorator-item) {
                height: auto !important;
            }
            /* Push decorator wrapper to its own row, aligned under the name */
            a[class*="link_"]:has(.lot-decorator-item) .vc-member-list-decorators-wrapper {
                flex: 1 0 100% !important;
                order: 99 !important;
                display: block !important;
                margin-left: -50px !important;
                padding-left: 50px !important;
            }
            /* Style to match Discord's native subtext (e.g. "1 Member") */
            .lot-decorator-item {
                font-size: 12px !important;
                color: oklab(0.700601 -0.00173169 -0.0100287) !important;
                font-weight: 400 !important;
                line-height: 13px !important;
                font-family: var(--font-primary) !important;
                display: block !important;
                text-align: left !important;
                margin-top: 1px !important;
            }
        `;
        document.head.appendChild(style);

        addMemberListDecorator("LastOnlineTracker", props => {
            const user = (props as any).user;
            if (!user?.id || !isOffline(user.id)) return null;
            const ts = lastSeenMap.get(user.id);
            if (!ts) return null;
            
            return (
                <div className="lot-decorator-item">
                    Active {ago(Date.now() - ts)}
                </div>
            );
        });
        
        addContextMenuPatch("user-context", ctxPatch);
        addContextMenuPatch("gdm-context", ctxPatch);
    },

    stop() {
        document.getElementById("lot-style")?.remove();
        removeMemberListDecorator("LastOnlineTracker");
        removeContextMenuPatch("user-context", ctxPatch);
        removeContextMenuPatch("gdm-context", ctxPatch);
        lastSeenMap.clear();
        seenOnlineSet.clear();
    },
});
