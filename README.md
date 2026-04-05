# ⏰ Jeyaul Time — Chrome Extension

A powerful productivity extension built with Manifest V3.

---

## 📁 Project Structure

```
jeyaul-time/
├── manifest.json       ← Extension configuration (MV3)
├── popup.html          ← Main UI popup
├── popup.css           ← All styles
├── popup.js            ← Popup logic (clock, timer, notes, blocker, history)
├── background.js       ← Service worker (alarms, unblock scheduling)
├── content.js          ← Injected in every page (site blocking detection)
├── blocked.html        ← Custom page shown when a site is blocked
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## 🚀 Installation (Load Unpacked)

1. Open Chrome and navigate to: `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **"Load unpacked"**
4. Select the `jeyaul-time/` folder
5. The extension icon will appear in your toolbar — click it!

---

## ✨ Features

### 🕒 Live Clock
- Real-time digital clock (HH:MM:SS) with AM/PM
- Full date: Day, Month Date, Year
- Updates every second

### ⏱ Timer with Alarm
- Set Hours / Minutes / Seconds
- Add a task description
- Animated countdown with progress bar
- **Alarm plays for 30 seconds** when timer ends (Web Audio API beeping)
- Manual "Stop Alarm" button
- Timer state is persisted — survives popup close/reopen

### 📊 Task History
- Every completed timer is saved automatically
- Shows task name + completion timestamp
- Delete individual entries or clear all

### 📝 Notes
- Write and save multiple notes
- **URLs are auto-detected** and rendered as clickable links
- Opens links in a new tab
- Stored in `chrome.storage.local`

### 🚫 Website Blocker
- Enter any domain (e.g. `youtube.com`)
- Set a block duration (hours + minutes)
- Blocked sites redirect to a custom `blocked.html` page with:
  - Live countdown to unblock
  - Motivational quotes
  - Progress bar
- Auto-unblocks when timer expires
- Manually unblock at any time

---

## 🔧 Technical Notes

- **Manifest Version**: 3
- **Storage**: `chrome.storage.local` for all data (notes, history, blocked sites, active timer)
- **Alarms**: `chrome.alarms` for reliable scheduling even when service worker sleeps
- **Alarm Sound**: Generated via Web Audio API — no external audio file needed
- **Content Script**: Runs at `document_start` on all URLs for instant blocking

---

## 💡 Tips

- The timer continues running even if you close the popup
- If the popup is closed when a timer ends, you'll get a system notification
- Blocked sites auto-unblock when their timer expires — no manual action needed
- Notes support multi-line text and multiple URLs per note

---

Built with ❤️ — Jeyaul Time
