<div align="center">

# 🕐 LastOnlineTracker

**A [Vencord](https://github.com/Vendicated/Vencord) plugin that tracks when Discord users were last online.**

Shows a *"last seen X ago"* label below usernames in the member list — completely client-side, resets every restart.

![Discord](https://img.shields.io/badge/Discord-Client_Mod-5865F2?style=flat&logo=discord&logoColor=white)
![Vencord](https://img.shields.io/badge/Vencord-Plugin-pink?style=flat)
![License](https://img.shields.io/badge/License-GPL--3.0-blue?style=flat)

</div>

---

## ✨ Features

- **Below-username label** — shows `"Active 39m ago"` directly under a user's name in the member list
- **Auto-updates** — refreshes every 60 seconds without needing to reload Discord
- **Client-side only** — no servers, no databases, no external requests
- **Resets on restart** — intentionally ephemeral; closing Discord wipes all data
- **Optional persistence** — save last-seen times across Discord restarts (off by default)
- **Works in servers and DMs**

> **Note:** "Persist" setting (off by default) If you turn it on, keep in mind saved times don't refresh until that person actually goes offline again, so a saved time can sit there and go a bit stale in the meantime

---

## 📸 Screenshot (Preview)

[![image.png](https://i.postimg.cc/Vv4dCv7P/image.png)](https://postimg.cc/gLXz9zFg)

---

## 📋 Requirements

| Requirement | Version |
|---|---|
| [Vencord](https://vencord.dev) | Latest (`pnpm` source install) |
| Node.js | 18+ |
| pnpm | Any recent version |

> **Note:** This plugin requires a **source install** of Vencord (not the installer/pre-built version) because it needs to be compiled.

---

## 📦 Installation

### Step 1 — Get a source install of Vencord

If you haven't already:

```bat
git clone https://github.com/Vendicated/Vencord
cd Vencord
pnpm install
pnpm build
pnpm inject
```

### Step 2 — Add the plugin

**Option A — Clone this repo (recommended)**
```bat
cd path\to\Vencord\src\userplugins
git clone https://github.com/YOUR_USERNAME/lastOnlineTracker
```

**Option B — Manual copy**

1. Create a folder: `Vencord/src/userplugins/lastOnlineTracker/`
2. Copy `index.tsx` into that folder

Your folder structure should look like:
```
Vencord/
└── src/
    └── userplugins/
        └── lastOnlineTracker/
            └── index.tsx   ← plugin file goes here
```

### Step 3 — Build Vencord

```bat
cd path\to\Vencord
pnpm build
```

### Step 4 — Enable the plugin

1. Open Discord
2. Go to **User Settings → Vencord → Plugins**
3. Search for **LastOnlineTracker**
4. Toggle it **ON**

---

## 🔄 Updating

```bat
cd path\to\Vencord\src\userplugins\lastOnlineTracker
git pull
cd ..\..\..\..
pnpm build
```

---

## 🎮 Usage

Once enabled, the plugin works automatically:

### Member List
Users who go offline while you have Discord open will show a `🕐 Xm ago` label below their username in the right-hand member panel.
 
```
┌─────────────────────────────┐
│  🟢 OnlineUser              │
│                             │
│  ⚫ OfflineUser             │
│     🕐 12m ago              │  ← appears here
│                             │
│  ⚫ AnotherUser             │
│     🕐 2h ago               │
└─────────────────────────────┘
```


```
──────────────────
  Last seen 5m ago
  04/21/2026, 14:32:07
```


### Important: When data appears
- Data only accumulates **during the current session**
- A user must go **online then offline** while you're watching for them to be tracked
- Users who were already offline when you started Discord won't show until they next reconnect and disconnect
- All data is **wiped when Discord closes**

---

## ⚙️ How It Works

```
Discord Presence Event
        │
        ▼
  PRESENCE_UPDATES
  (Flux dispatcher)
        │
        ├── status === "offline"?
        │   └── clientStatus empty?
        │           │
        │           ▼
        │     Save timestamp
        │     to Map<userId, timestamp>
        │
        ▼
   React components
   read from Map and
   re-render every 60s
```

The plugin subscribes to Discord's internal `PRESENCE_UPDATES` Flux event using Vencord's built-in `flux` handler. When a user's status transitions to `"offline"` with no active clients (desktop, web, or mobile), the current Unix timestamp is stored in a plain JavaScript `Map`.

Two display surfaces read from this map:
1. **`addMemberListDecorator`** — injects a React component into member list rows
2. **`addContextMenuPatch`** — appends a menu item to user right-click menus

The `Map` is never persisted to disk. Calling `stop()` or restarting Discord calls `lastSeenMap.clear()`.

---

## ❓ Troubleshooting

**Nothing shows in the member list**
- Make sure the plugin is **enabled** in Settings → Plugins
- Users only appear after they go offline **during your current session**
- Try opening a small server where you can see presence changes

**Build fails with "No matching export"**
- Check your Vencord version: `git log --oneline -5` from the Vencord root
- Run `git pull && pnpm install && pnpm build` to update Vencord
- If errors persist, open an issue and paste the full build error

**"Not tracked yet" in right-click menu**
- That user hasn't gone offline while you've had Discord open this session
- Keep Discord open and wait for them to disconnect

**Plugin shows in settings but badge is missing**
- The below-name patch may have stopped matching due to a Discord update
- The right-side badge (decorator) should still work as a fallback
- Open an issue with your Vencord version and I'll fix the patch (hopefully)

---

## 📁 File Structure

```
lastOnlineTracker/
├── index.tsx     ← main plugin source
└── README.md     ← this file
```

---

## ⚠️ Disclaimer

- This plugin is **client-side only** — it cannot track users you can't already see presence for
- Large servers (250+ members) have limited presence data from Discord
- Discord's Terms of Service technically prohibit client modifications, though bans are essentially unheard of for passive plugins like this
- All tracked data stays in your RAM and is never shared

---

## 📄 License

GPL-3.0 — see [LICENSE](https://www.gnu.org/licenses/gpl-3.0.en.html)

---

<div align="center">
Made for <a href="https://vencord.dev">Vencord</a> · Not affiliated with Discord Inc.
</div>
