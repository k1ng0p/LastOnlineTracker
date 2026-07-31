<div align="center">

# 🕐 LastOnlineTracker

**A client mod plugin that tracks when Discord users were last online.**
**Available for [Vencord](https://github.com/Vendicated/Vencord)/[Equicord](https://github.com/Equicord/Equicord) and [BetterDiscord](https://betterdiscord.app/).**


Shows a *"last seen X ago"* label below usernames in the member list — completely client-side, resets every restart.

![Discord](https://img.shields.io/badge/Discord-Client_Mod-5865F2?style=flat&logo=discord&logoColor=white)
![Vencord](https://img.shields.io/badge/Vencord-Plugin-pink?style=flat)
![BetterDiscord](https://img.shields.io/badge/BetterDiscord-Plugin-8A2BE2?style=flat)
![License](https://img.shields.io/badge/License-GPL--3.0-blue?style=flat)

</div>

---

## ✨ Features

- **Below-username label** — shows `"Active 39m ago"` directly under a user's name in the member list
- **Auto-updates** — refreshes every 60 seconds without needing to reload Discord
- **Client-side only** — no servers, no databases, no external requests
- **Resets on restart** — intentionally ephemeral; closing Discord wipes all data
- **Works in servers and DMs**

---

## 📸 Screenshots (Preview)

| **Last Seen** | **Active** |
|:----------:|:-------------:|
| ![Last Seen](https://i.postimg.cc/dQTv3299/last-Seen.png) | ![Active](https://i.postimg.cc/h47gvL01/Active.png) |

| **Online** | **Seen** |
|:----------:|:--------:|
| ![Online](https://i.postimg.cc/SQzqR6GL/online.png) | ![Seen](https://i.postimg.cc/J7Bm0NQq/Seen.png) |

## ⚙️ Settings

Click the settings icon on the plugin card to customize:

- **🏷️ Label dropdown** — pick what shows before the timestamp: `Active`, `Last seen`, `Online`, or `Seen`

[![Screenshot-2026-07-22-065103.png](https://i.postimg.cc/MpSLWRs0/Screenshot-2026-07-22-065103.png)](https://postimg.cc/mtmjjcWh)

- **🕐 Time format toggle** — switch between relative time (`5m ago`) or exact time (`2:34 PM`)

[![Screenshot-2026-07-22-065135.png](https://i.postimg.cc/fb3mpqx0/Screenshot-2026-07-22-065135.png)](https://postimg.cc/qtTNCLDk)

- **💬 Hover tooltip** — hover the last-seen text to see the full date and time it was recorded

Settings save automatically and apply instantly — no restart needed.

---

## 📦 Installation For Both Vencord and BetterDiscord

> **Note:** This plugin requires a **source install** of Vencord (not the installer/pre-built version) because it needs to be compiled.

### Step 1 — Add the plugin

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

### Step 2 — Build Vencord

```bat
cd path\to\Vencord
pnpm build
```

### Step 3 — Enable the plugin

1. Open Discord
2. Go to **User Settings → Vencord → Plugins**
3. Search for **LastOnlineTracker**
4. Toggle it **ON**

---

## 🔄 Updating

```bat
cd path\to\Vencord\src\userplugins\lastOnlineTracker
git pull
pnpm build
```
---

# BetterDiscord Version

A standalone port for [BetterDiscord](https://betterdiscord.app/) users — same idea, shows `"Active X ago"` under a user's name once they go offline in your DM list

**Differences from the Vencord version:**

- No build step required — it's a single file you drop straight into your plugins folder

## 📋 Requirements

Latest [BetterDiscord](https://betterdiscord.app/)

## 📦 Installation

1. Download the latest [`LastOnlineTracker.plugin.js`](https://github.com/k1ng0p/LastOnlineTracker/blob/main/LastOnlineTracker.plugin.js)
```
   %AppData%/BetterDiscord/plugins
```
3. Open Discord → **Settings → Plugins**
4. Enable **LastOnlineTracker**

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

**Plugin shows in settings but badge is missing**
- Open an issue with your Vencord version and I'll fix the patch (hopefully)

---

## ⚠️ Disclaimer

- This plugin is **client-side only** — it cannot track users you can't already see presence for
- Large servers (250+ members) have limited presence data from Discord
- Discord's Terms of Service technically prohibit client modifications, though bans are essentially unheard of for passive plugins like this
- All tracked data stays in your Device and is never shared

---

## 📄 License

GPL-3.0 — see [LICENSE](https://www.gnu.org/licenses/gpl-3.0.en.html)

---

<div align="center">
Made for <a href="https://vencord.dev">Vencord</a> · Not affiliated with Discord Inc.
</div>
