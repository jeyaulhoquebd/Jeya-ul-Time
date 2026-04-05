/**
 * ═══════════════════════════════════════════════════
 *  Jeyaul Time — popup.js
 *  Handles: Clock, Timer, Notes, Website Blocker, History
 *
 *  FIX: MV3 Content Security Policy blocks inline onclick=""
 *  handlers. All dynamic buttons now use data-* attributes +
 *  event delegation via addEventListener instead.
 * ═══════════════════════════════════════════════════
 */

// ── Audio context for alarm beeping (Web Audio API) ──────────────
let audioCtx       = null;
let alarmInterval  = null;   // interval that fires beeps
let alarmStopTimer = null;   // auto-stop alarm after 30 s
let beepOscillators = [];    // track active oscillators so we can stop them

// ── Timer state ──────────────────────────────────────────────────
let countdownInterval = null; // drives the countdown display

// ── Blocker live-countdown ────────────────────────────────────────
let blockerRefreshInterval = null;

// ══════════════════════════════════════════════════════════════════
// INITIALIZATION
// ══════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initTabs();
  initTimer();
  initNotes();
  initBlocker();
  initHistory();
  restoreTimerState();
  refreshBlockedSites();
});

// ══════════════════════════════════════════════════════════════════
// 1. LIVE CLOCK  — updates every second
// ══════════════════════════════════════════════════════════════════
function initClock() {
  updateClock();
  setInterval(updateClock, 1000);
}

function updateClock() {
  const now  = new Date();
  let   h    = now.getHours();
  const m    = now.getMinutes();
  const s    = now.getSeconds();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;

  document.getElementById('clock').textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
  document.getElementById('ampm').textContent  = ampm;

  const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  document.getElementById('date').textContent =
    `${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${pad(now.getDate())}, ${now.getFullYear()}`;
}

// ══════════════════════════════════════════════════════════════════
// 2. TABS
// ══════════════════════════════════════════════════════════════════
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');

      if (btn.dataset.tab === 'history') renderHistory();
      if (btn.dataset.tab === 'blocker') refreshBlockedSites();
    });
  });
}

// ══════════════════════════════════════════════════════════════════
// 3. TIMER
// ══════════════════════════════════════════════════════════════════
function initTimer() {
  document.getElementById('startTimerBtn').addEventListener('click', startTimer);
  document.getElementById('cancelTimerBtn').addEventListener('click', cancelTimer);
  document.getElementById('stopAlarmBtn').addEventListener('click', stopAlarm);
}

function startTimer() {
  const h    = parseInt(document.getElementById('timerHours').value)   || 0;
  const m    = parseInt(document.getElementById('timerMinutes').value)  || 0;
  const s    = parseInt(document.getElementById('timerSeconds').value)  || 0;
  const task = document.getElementById('taskName').value.trim() || 'Unnamed Task';

  const totalSec = h * 3600 + m * 60 + s;
  if (totalSec <= 0) { alert('Please enter a valid timer duration.'); return; }

  const endTime = Date.now() + totalSec * 1000;

  // Persist so the timer survives popup close/reopen
  chrome.storage.local.set({
    activeTimer: { endTime, totalSec, task, startTime: Date.now() }
  });

  // Tell background to fire a chrome.alarm when done
  chrome.runtime.sendMessage({ action: 'startAlarm', endTime, task });

  showCountdownUI(task, endTime, totalSec);
}

function showCountdownUI(task, endTime, totalSec) {
  document.getElementById('timerSetup').style.display    = 'none';
  document.getElementById('countdownCard').style.display = 'flex';
  document.getElementById('alarmCard').style.display     = 'none';
  document.getElementById('countdownTask').textContent   = task;

  if (countdownInterval) clearInterval(countdownInterval);

  countdownInterval = setInterval(() => {
    const remaining = Math.max(0, endTime - Date.now());

    document.getElementById('countdownDisplay').textContent = formatDuration(remaining);

    // Progress bar shrinks as time elapses
    const pct = (remaining / (totalSec * 1000)) * 100;
    document.getElementById('progressFill').style.width = `${pct}%`;

    if (remaining <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      triggerAlarm(task);
    }
  }, 500);
}

function cancelTimer() {
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  chrome.storage.local.remove('activeTimer');
  chrome.runtime.sendMessage({ action: 'cancelAlarm' });
  resetTimerUI();
}

function resetTimerUI() {
  document.getElementById('timerSetup').style.display    = 'flex';
  document.getElementById('countdownCard').style.display = 'none';
  document.getElementById('alarmCard').style.display     = 'none';
}

// Recover a running timer if the popup was reopened mid-countdown
function restoreTimerState() {
  chrome.storage.local.get(['activeTimer'], ({ activeTimer }) => {
    if (!activeTimer) return;
    const remaining = activeTimer.endTime - Date.now();
    if (remaining <= 0) {
      triggerAlarm(activeTimer.task, /*skipSave=*/true);
    } else {
      showCountdownUI(activeTimer.task, activeTimer.endTime, activeTimer.totalSec);
    }
  });
}

// ── Alarm ─────────────────────────────────────────────────────────

function triggerAlarm(task, skipSave = false) {
  document.getElementById('countdownCard').style.display = 'none';
  document.getElementById('alarmCard').style.display     = 'flex';
  document.getElementById('alarmTaskName').textContent   = task;

  playAlarmSound();
  alarmStopTimer = setTimeout(stopAlarm, 30000); // auto-stop after 30 s

  if (!skipSave) saveToHistory(task);

  chrome.storage.local.remove('activeTimer');
}

function stopAlarm() {
  stopAlarmSound();
  if (alarmStopTimer) { clearTimeout(alarmStopTimer); alarmStopTimer = null; }
  resetTimerUI();
  renderHistory();
}

// ── Web Audio API — generates beeping without an audio file ────────
function playAlarmSound() {
  stopAlarmSound();
  audioCtx      = new (window.AudioContext || window.webkitAudioContext)();
  alarmInterval = setInterval(() => playBeep(880, 0.3), 800);
  playBeep(880, 0.3); // first beep immediately
}

function playBeep(frequency, duration) {
  if (!audioCtx) return;
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
  gain.gain.setValueAtTime(0, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.03);
  gain.gain.linearRampToValueAtTime(0,   audioCtx.currentTime + duration);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + duration);
  beepOscillators.push(osc);
}

function stopAlarmSound() {
  if (alarmInterval) { clearInterval(alarmInterval); alarmInterval = null; }
  beepOscillators.forEach(o => { try { o.stop(); } catch (_) {} });
  beepOscillators = [];
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
}

// ══════════════════════════════════════════════════════════════════
// 4. HISTORY
// ══════════════════════════════════════════════════════════════════
function saveToHistory(task) {
  const entry = { id: Date.now(), task, completed: new Date().toLocaleString() };
  chrome.storage.local.get(['history'], ({ history }) => {
    const list = history || [];
    list.unshift(entry);
    chrome.storage.local.set({ history: list });
  });
}

function initHistory() {
  // "Clear All" button
  document.getElementById('clearHistoryBtn').addEventListener('click', () => {
    if (confirm('Clear all history?')) {
      chrome.storage.local.set({ history: [] }, renderHistory);
    }
  });

  // ── Event delegation for individual delete buttons ─────────────
  // MV3 CSP blocks inline onclick="..." in dynamically created HTML.
  // We attach ONE listener to the parent container and filter by
  // data-action so it works for every row — current and future.
  document.getElementById('historyList').addEventListener('click', e => {
    const btn = e.target.closest('[data-action="delete-history"]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    chrome.storage.local.get(['history'], ({ history }) => {
      const updated = (history || []).filter(entry => entry.id !== id);
      chrome.storage.local.set({ history: updated }, renderHistory);
    });
  });

  renderHistory();
}

function renderHistory() {
  chrome.storage.local.get(['history'], ({ history }) => {
    const list = history || [];
    const el   = document.getElementById('historyList');
    if (list.length === 0) {
      el.innerHTML = emptyState('📋', 'No completed tasks yet.');
      return;
    }
    // Use data-action + data-id — NO inline onclick
    el.innerHTML = list.map(entry => `
      <div class="list-item">
        <div class="list-item-body">
          <div class="list-item-title">${escHtml(entry.task)}</div>
          <div class="list-item-meta">${entry.completed}</div>
        </div>
        <button class="btn-icon"
                data-action="delete-history"
                data-id="${entry.id}"
                title="Delete">🗑</button>
      </div>
    `).join('');
  });
}

// ══════════════════════════════════════════════════════════════════
// 5. NOTES
// ══════════════════════════════════════════════════════════════════
function initNotes() {
  document.getElementById('saveNoteBtn').addEventListener('click', saveNote);

  // ── Event delegation for note delete buttons ───────────────────
  document.getElementById('notesList').addEventListener('click', e => {
    const btn = e.target.closest('[data-action="delete-note"]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    chrome.storage.local.get(['notes'], ({ notes }) => {
      const updated = (notes || []).filter(n => n.id !== id);
      chrome.storage.local.set({ notes: updated }, renderNotes);
    });
  });

  renderNotes();
}

function saveNote() {
  const text = document.getElementById('noteInput').value.trim();
  if (!text) return;

  const note = { id: Date.now(), text, created: new Date().toLocaleString() };
  chrome.storage.local.get(['notes'], ({ notes }) => {
    const list = notes || [];
    list.unshift(note);
    chrome.storage.local.set({ notes: list }, () => {
      document.getElementById('noteInput').value = '';
      renderNotes();
    });
  });
}

function renderNotes() {
  chrome.storage.local.get(['notes'], ({ notes }) => {
    const list = notes || [];
    const el   = document.getElementById('notesList');
    if (list.length === 0) {
      el.innerHTML = emptyState('📝', 'No notes saved yet.');
      return;
    }
    // Use data-action + data-id — NO inline onclick
    el.innerHTML = list.map(note => `
      <div class="list-item">
        <div class="list-item-body">
          <div class="list-item-title">${linkify(escHtml(note.text))}</div>
          <div class="list-item-meta">${note.created}</div>
        </div>
        <button class="btn-icon"
                data-action="delete-note"
                data-id="${note.id}"
                title="Delete">🗑</button>
      </div>
    `).join('');
  });
}

/** Auto-detect URLs in text and wrap them in clickable <a> tags */
function linkify(text) {
  return text.replace(/https?:\/\/[^\s<>"]+/g, url =>
    `<a class="note-link" href="${url}" target="_blank" rel="noopener">${url}</a>`
  );
}

// ══════════════════════════════════════════════════════════════════
// 6. WEBSITE BLOCKER
// ══════════════════════════════════════════════════════════════════
function initBlocker() {
  document.getElementById('blockSiteBtn').addEventListener('click', blockSite);

  // ── Event delegation for unblock (✖) buttons ──────────────────
  document.getElementById('blockedList').addEventListener('click', e => {
    const btn = e.target.closest('[data-action="unblock-site"]');
    if (!btn) return;
    const url = btn.dataset.url;
    chrome.storage.local.get(['blockedSites'], ({ blockedSites }) => {
      const updated = (blockedSites || []).filter(s => s.url !== url);
      chrome.storage.local.set({ blockedSites: updated }, () => {
        chrome.runtime.sendMessage({ action: 'cancelUnblock', url });
        refreshBlockedSites();
      });
    });
  });
}

function blockSite() {
  let url = document.getElementById('blockerUrl').value.trim().toLowerCase();
  if (!url) { alert('Please enter a website URL.'); return; }

  // Normalise — strip protocol and trailing slash
  url = url.replace(/^https?:\/\//i, '').replace(/\/$/, '');

  const h        = parseInt(document.getElementById('blockerHours').value)   || 0;
  const m        = parseInt(document.getElementById('blockerMinutes').value)  || 0;
  const totalMin = h * 60 + m;

  if (totalMin <= 0) { alert('Please set a block duration (at least 1 minute).'); return; }

  const endTime = Date.now() + totalMin * 60 * 1000;

  chrome.storage.local.get(['blockedSites'], ({ blockedSites }) => {
    const list     = blockedSites || [];
    const existing = list.findIndex(s => s.url === url);
    const entry    = { url, endTime, addedAt: new Date().toLocaleString() };

    if (existing >= 0) list[existing] = entry; // update existing
    else               list.push(entry);        // add new

    chrome.storage.local.set({ blockedSites: list }, () => {
      chrome.runtime.sendMessage({ action: 'scheduleUnblock', url, endTime });
      document.getElementById('blockerUrl').value     = '';
      document.getElementById('blockerHours').value   = '0';
      document.getElementById('blockerMinutes').value = '30';
      refreshBlockedSites();
    });
  });
}

function refreshBlockedSites() {
  if (blockerRefreshInterval) {
    clearInterval(blockerRefreshInterval);
    blockerRefreshInterval = null;
  }
  renderBlockedSites();
  blockerRefreshInterval = setInterval(renderBlockedSites, 1000);
}

function renderBlockedSites() {
  chrome.storage.local.get(['blockedSites'], ({ blockedSites }) => {
    const now  = Date.now();
    const live = (blockedSites || []).filter(s => s.endTime > now);

    // Auto-clean expired sites from storage
    if (live.length !== (blockedSites || []).length) {
      chrome.storage.local.set({ blockedSites: live });
    }

    const el = document.getElementById('blockedList');
    if (!el) return;

    if (live.length === 0) {
      el.innerHTML = emptyState('✅', 'No sites currently blocked.');
      return;
    }

    // Use data-action + data-url — NO inline onclick
    el.innerHTML = live.map(site => {
      const remaining = Math.max(0, site.endTime - now);
      return `
        <div class="list-item">
          <div class="list-item-body">
            <div class="list-item-title">🌐 ${escHtml(site.url)}</div>
            <span class="blocker-badge">BLOCKED</span>
            <div class="blocker-timer">⏱ ${formatDuration(remaining)} remaining</div>
          </div>
          <button class="btn-icon"
                  data-action="unblock-site"
                  data-url="${escAttr(site.url)}"
                  title="Unblock now">✖</button>
        </div>
      `;
    }).join('');
  });
}

// ══════════════════════════════════════════════════════════════════
// BACKGROUND MESSAGE LISTENER
// ══════════════════════════════════════════════════════════════════
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'timerDone') {
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    triggerAlarm(msg.task, /*skipSave=*/false);
  }
});

// ══════════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════════

/** Zero-pad a number to 2 digits */
function pad(n) { return String(n).padStart(2, '0'); }

/** Format milliseconds as HH:MM:SS */
function formatDuration(ms) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Escape text for safe insertion into HTML content */
function escHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str)));
  return d.innerHTML;
}

/** Escape text for safe insertion into HTML attribute values */
function escAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Generic empty-state placeholder HTML */
function emptyState(icon, text) {
  return `<div class="empty-state"><span>${icon}</span>${text}</div>`;
}
