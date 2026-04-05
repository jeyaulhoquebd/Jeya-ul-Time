/**
 * ═══════════════════════════════════════════════════
 *  Jeyaul Time — content.js
 *  Runs on every page (document_start).
 *  Checks if the current site is blocked, and if so,
 *  redirects immediately to blocked.html before the
 *  page can render.
 * ═══════════════════════════════════════════════════
 */

(function () {
  'use strict';

  // Don't run on the extension's own pages or on chrome:// URLs
  if (
    location.href.startsWith('chrome-extension://') ||
    location.href.startsWith('chrome://')           ||
    location.href.startsWith('about:')              ||
    location.href.startsWith('moz-extension://')
  ) {
    return;
  }

  // Normalise the current hostname: strip "www." prefix
  const currentHost = location.hostname.replace(/^www\./, '').toLowerCase();

  // Read blocked sites from storage and check for a match
  chrome.storage.local.get(['blockedSites'], ({ blockedSites }) => {
    if (!blockedSites || blockedSites.length === 0) return;

    const now     = Date.now();
    const matched = blockedSites.find(site => {
      if (!site || !site.url || site.endTime <= now) return false;

      // Normalise stored URL the same way
      const storedHost = site.url
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '')
        .replace(/\/.*$/, '')         // strip path
        .toLowerCase();

      // Match if either host contains the other
      // (covers subdomain and path cases)
      return (
        currentHost === storedHost ||
        currentHost.endsWith('.' + storedHost) ||
        storedHost.endsWith('.' + currentHost)
      );
    });

    if (matched) {
      // Build the redirect URL with context info as query params
      const blockedPageUrl =
        chrome.runtime.getURL('blocked.html') +
        `?site=${encodeURIComponent(matched.url)}` +
        `&endTime=${matched.endTime}`;

      // Immediately replace the page with the blocked page
      window.location.replace(blockedPageUrl);
    }
  });
})();
