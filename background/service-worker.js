/**
 * XportAI Background Service Worker
 * Handles message relay between popup and content scripts, stores default settings.
 */

// ── Installation ───────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      defaultFormat: 'markdown',
    });
  }
});

// ── Message Relay ──────────────────────────────────────────────────────
// Forward messages between popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FORWARD_TO_CONTENT') {
    // Forward from popup to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, message.payload, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: chrome.runtime.lastError.message });
            return;
          }
          sendResponse(response);
        });
      } else {
        sendResponse({ error: 'No active tab' });
      }
    });
    return true; // Keep message port open for async response
  }

  if (message.type === 'GET_SETTINGS') {
    chrome.storage.local.get(['defaultFormat'], (result) => {
      sendResponse(result);
    });
    return true;
  }

  if (message.type === 'SAVE_SETTINGS') {
    chrome.storage.local.set(message.settings, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  // Update badge when content script reports status
  if (message.type === 'STATUS' && sender.tab) {
    const tabId = sender.tab.id;
    const platform = message.platform;

    if (platform && platform !== 'unsupported') {
      chrome.action.setBadgeText({ text: platform.charAt(0).toUpperCase(), tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#111111', tabId });
    } else {
      chrome.action.setBadgeText({ text: '', tabId });
    }
  }
});

// ── Tab Update Listener ────────────────────────────────────────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const url = new URL(tab.url);
    const supportedHosts = ['chatgpt.com', 'gemini.google.com', 'claude.ai'];
    const isSupported = supportedHosts.some(host =>
      url.hostname === host || url.hostname.endsWith('.' + host)
    );

    if (!isSupported) {
      chrome.action.setBadgeText({ text: '', tabId });
    }
  }
});
