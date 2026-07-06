# SelfMade.

A minimal, privacy-first daily health tracker — built as a Progressive Web App. Log water, steps, meals, and habits offline. Auto-syncs to one shared Google Sheet across all your devices when you're online.

---

## Features

**Daily Tracking**
- Water intake (glasses)
- Step count
- Meals — Breakfast, Lunch, Dinner (text notes)
- Boolean habit cards — No Sugar, Workout, Protein Meal, Sleep 6–8 hrs
- Custom habits (checkbox or text)

**History & Streaks**
- 90-day calendar view with colour-coded completion
- Current streak and longest streak tracking
- Day-by-day detail view

**Habits**
- Add unlimited custom habits (checkbox or free-text)
- Manage and reorder from the Habits tab

**Sync**
- Auto-syncs to a single Google Sheet whenever online
- One sheet shared across every device — no duplicates
- First connection on a new device pulls existing data automatically
- Works fully offline; queued changes push on next connection

**Notifications**
- Daily reminders at 7 am, 10 am, 1 pm, 5 pm, and 8 pm
- Persistent via Periodic Background Sync (even when the app is closed)

**PWA**
- Installable on Android, iOS, and desktop
- Full offline support via Service Worker
- No server, no account — all data stays on your device

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Vanilla JS, HTML, CSS — no framework |
| Storage | `localStorage` (logs, habits, settings) |
| Auth | Google Identity Services (OAuth 2.0, token client) |
| Sync | Google Sheets API v4 + Google Drive API v3 |
| Offline | Service Worker with cache-first strategy |
| Notifications | `setInterval` polling + Periodic Background Sync |
| Hosting | GitHub Pages |

---

## Project Structure

```
SelfMade/
├── index.html          # App shell + all CSS
├── sw.js               # Service worker (caching + background sync)
├── manifest.json       # PWA manifest
├── js/
│   ├── db.js           # localStorage helpers
│   ├── auth.js         # Google OAuth (token client)
│   ├── sync.js         # Sheets API upload/download
│   ├── app.js          # Main app logic + rendering
│   ├── notif-shared.js # Notification schedule (shared by page + SW)
│   └── notifications.js# Notification scheduling + Periodic Background Sync
└── icons/              # App icons (SVG, 192px, 512px)
```

---

## Setup — Google Sync

Sync is optional. The app works fully offline without it.

To enable sync:

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create a project (e.g. `SelfMade`)
2. **APIs & Services → Library** → enable:
   - Google Sheets API
   - Google Drive API
3. **OAuth consent screen** → External → add scopes:
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/userinfo.email`
   - Add your email as a test user
4. **Credentials → Create OAuth client ID** → Web application
   - Authorized JavaScript origins: your app URL (e.g. `https://yourusername.github.io`)
5. Copy the **Client ID** → open `js/auth.js` → replace `YOUR_CLIENT_ID_HERE`
6. Reload the app → tap **Connect Google** on the Sync tab

The app will find or create a sheet named `SelfMade Health Log` and auto-sync from that point on.

---

## Deploying Your Own Copy

1. Fork this repo
2. Go to **Settings → Pages** → set source to **GitHub Actions**
3. Replace `YOUR_CLIENT_ID_HERE` in `js/auth.js` with your OAuth Client ID
4. Push — GitHub Actions deploys it automatically

---

## Data & Privacy

All health data is stored locally in your browser's `localStorage`. Nothing is sent to any server except your own Google Sheet (when you explicitly connect Google). See [privacy.html](./privacy.html) for the full privacy policy.

---

## License

MIT
