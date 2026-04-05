/**
 * ═══════════════════════════════════════════════════
 *  Jeyaul Time — background.js (Service Worker)
 *  Handles: Chrome Alarms, Website Block Expiry,
 *           Notifications, Popup Messaging
 * ═══════════════════════════════════════════════════
 */

// ── Alarm name prefixes ──────────────────────────────────────────
const TIMER_ALARM   = 'jeyaul_timer';
const BLOCKER_ALARM = 'jeyaul_block_'; // + url

// ══════════════════════════════════════════════════════════════════
// MESSAGE LISTENER — receives commands from popup.js
// ══════════════════════════════════════════════════════════════════
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.action) {

    // ── Timer: popup asks background to set a chrome.alarm ──────
    case 'startAlarm': {
      // Clear any existing timer alarm
      chrome.alarms.clear(TIMER_ALARM, () => {
        // Chrome alarms have minimum ~1-min granularity, so for short
        // durations we also store endTime and use storage as fallback.
        const delayMinutes = Math.max(0.1, (msg.endTime - Date.now()) / 60000);
        chrome.alarms.create(TIMER_ALARM, { delayInMinutes: delayMinutes });

        // Persist task name for when alarm fires
        chrome.storage.local.set({ timerTask: msg.task });
      });
      sendResponse({ ok: true });
      break;
    }

    // ── Timer: popup cancels the running timer ───────────────────
    case 'cancelAlarm': {
      chrome.alarms.clear(TIMER_ALARM);
      chrome.storage.local.remove(['activeTimer', 'timerTask']);
      sendResponse({ ok: true });
      break;
    }

    // ── Blocker: schedule auto-unblock alarm for a site ─────────
    case 'scheduleUnblock': {
      const alarmName    = BLOCKER_ALARM + msg.url;
      const delayMinutes = Math.max(0.1, (msg.endTime - Date.now()) / 60000);
      chrome.alarms.clear(alarmName, () => {
        chrome.alarms.create(alarmName, { delayInMinutes: delayMinutes });
      });
      sendResponse({ ok: true });
      break;
    }

    // ── Blocker: user manually unblocked a site ──────────────────
    case 'cancelUnblock': {
      chrome.alarms.clear(BLOCKER_ALARM + msg.url);
      sendResponse({ ok: true });
      break;
    }

    default:
      sendResponse({ ok: false, error: 'Unknown action' });
  }

  // Return true keeps the message channel open for async sendResponse
  return true;
});

// ══════════════════════════════════════════════════════════════════
// ALARM LISTENER — fires when a chrome.alarm triggers
// ══════════════════════════════════════════════════════════════════
chrome.alarms.onAlarm.addListener((alarm) => {

  // ── Timer alarm ──────────────────────────────────────────────
  if (alarm.name === TIMER_ALARM) {
    chrome.storage.local.get(['timerTask'], ({ timerTask }) => {
      const task = timerTask || 'Your Task';

      // Try to notify the popup (if it's open)
      chrome.runtime.sendMessage({ action: 'timerDone', task }).catch(() => {
        // Popup is closed — show a system notification instead
        showTimerNotification(task);
      });

      // Clear the stored timer state
      chrome.storage.local.remove(['activeTimer', 'timerTask']);
    });
    return;
  }

  // ── Blocker expiry alarm ─────────────────────────────────────
  if (alarm.name.startsWith(BLOCKER_ALARM)) {
    const url = alarm.name.slice(BLOCKER_ALARM.length);

    // Remove site from blocked list
    chrome.storage.local.get(['blockedSites'], ({ blockedSites }) => {
      const updated = (blockedSites || []).filter(s => s.url !== url);
      chrome.storage.local.set({ blockedSites: updated }, () => {
        showUnblockedNotification(url);
      });
    });
  }
});

// ══════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════

/**
 * Show a system notification when the timer ends and popup is closed.
 */
function showTimerNotification(task) {
  chrome.notifications.create('timer_done', {
    type:    'basic',
    iconUrl: 'icons/icon48.png',
    title:   '⏰ Jeyaul Time — Timer Complete!',
    message: `Task "${task}" has finished. Great work!`,
    priority: 2,
    silent:  false
  });
}

/**
 * Show a notification when a blocked site has been automatically unblocked.
 */
function showUnblockedNotification(url) {
  chrome.notifications.create(`unblocked_${Date.now()}`, {
    type:    'basic',
    iconUrl: 'icons/icon48.png',
    title:   '✅ Jeyaul Time — Site Unblocked',
    message: `${url} has been automatically unblocked.`,
    priority: 1,
    silent:  true
  });
}

// ══════════════════════════════════════════════════════════════════
// STARTUP: Restore any alarms that may have been cleared
// (Service workers can be killed by Chrome and restarted)
// ══════════════════════════════════════════════════════════════════
chrome.runtime.onStartup.addListener(restoreAlarms);
chrome.runtime.onInstalled.addListener(restoreAlarms);

function restoreAlarms() {
  // Re-register timer alarm if still active
  chrome.storage.local.get(['activeTimer', 'blockedSites'], ({ activeTimer, blockedSites }) => {
    const now = Date.now();

    // Restore countdown alarm
    if (activeTimer && activeTimer.endTime > now) {
      const delayMinutes = (activeTimer.endTime - now) / 60000;
      chrome.alarms.create(TIMER_ALARM, { delayInMinutes: Math.max(0.1, delayMinutes) });
    }

    // Restore blocker alarms
    if (blockedSites && blockedSites.length > 0) {
      blockedSites.forEach(site => {
        if (site.endTime > now) {
          const alarmName    = BLOCKER_ALARM + site.url;
          const delayMinutes = (site.endTime - now) / 60000;
          chrome.alarms.create(alarmName, { delayInMinutes: Math.max(0.1, delayMinutes) });
        }
      });
    }
  });
}
