/**
 * XportAI Content Script — Main Orchestrator
 * Entry point injected into ChatGPT, Gemini, and Claude.
 * Handles SPA navigation, platform detection, and coordinates extraction.
 */

import { detectPlatform, getPlatformName, PLATFORMS } from './platform-detector.js';
import { ChatGPTAdapter } from './adapters/chatgpt-adapter.js';
import { GeminiAdapter } from './adapters/gemini-adapter.js';
import { ClaudeAdapter } from './adapters/claude-adapter.js';
import { collectMessages } from './scroll-collector.js';
import { isStreaming, waitForStreamingEnd } from './streaming-detector.js';
import { normalize } from './normalizer.js';
import { exportMarkdown, getMarkdownFilename } from './exporters/markdown-exporter.js';
import { exportText, getTextFilename } from './exporters/text-exporter.js';
import { sleep } from '../utils/dom-helpers.js';

// ── State ──────────────────────────────────────────────────────────────
let currentPlatform = PLATFORMS.UNSUPPORTED;
let currentAdapter = null;
let floatingButton = null;
let statusOverlay = null;
let isProcessing = false;

// ── Adapter Factory ────────────────────────────────────────────────────
function createAdapter(platform) {
  switch (platform) {
    case PLATFORMS.CHATGPT: return new ChatGPTAdapter();
    case PLATFORMS.GEMINI: return new GeminiAdapter();
    case PLATFORMS.CLAUDE: return new ClaudeAdapter();
    default: return null;
  }
}

// ── SPA Navigation Detection ───────────────────────────────────────────
let lastUrl = location.href;
let initId = 0;

const origPushState = history.pushState;
const origReplaceState = history.replaceState;

history.pushState = function (...args) {
  origPushState.apply(this, args);
  onUrlChange();
};

history.replaceState = function (...args) {
  origReplaceState.apply(this, args);
  onUrlChange();
};

window.addEventListener('popstate', onUrlChange);

const navObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    onUrlChange();
  }
});

function startObserving() {
  if (document.body) {
    navObserver.observe(document.body, { childList: true, subtree: true });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startObserving);
} else {
  startObserving();
}

function onUrlChange() {
  if (location.href === lastUrl) return;
  lastUrl = location.href;
  const currentInitId = ++initId;

  setTimeout(async () => {
    if (currentInitId !== initId) return;
    await initialize();
  }, 1500);
}

// ── Initialization ─────────────────────────────────────────────────────
async function initialize() {
  const platform = detectPlatform();
  currentPlatform = platform;

  if (platform === PLATFORMS.UNSUPPORTED) {
    removeUI();
    notifyPopup({ type: 'STATUS', status: 'unsupported' });
    return;
  }

  currentAdapter = createAdapter(platform);

  try {
    await currentAdapter.waitForReady(10000);
  } catch {
    // Not ready yet — may be landing page, not a conversation
    if (!currentAdapter.isSupported()) {
      removeUI();
      notifyPopup({ type: 'STATUS', status: 'unsupported' });
      return;
    }
  }

  injectFloatingButton();
  notifyStatus('ready');
}

// ── Floating Button ────────────────────────────────────────────────────
function injectFloatingButton() {
  if (floatingButton) floatingButton.remove();

  floatingButton = document.createElement('div');
  floatingButton.id = 'xportai-fab';
  floatingButton.innerHTML = `
    <div id="xportai-fab-btn" title="Export conversation">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    </div>
    <div id="xportai-fab-status" class="hidden"></div>
  `;
  document.body.appendChild(floatingButton);

  floatingButton.querySelector('#xportai-fab-btn').addEventListener('click', handleExportClick);
}

function removeUI() {
  if (floatingButton) {
    floatingButton.remove();
    floatingButton = null;
  }
  if (statusOverlay) {
    statusOverlay.remove();
    statusOverlay = null;
  }
}

function updateButtonState(state) {
  if (!floatingButton) return;
  const btn = floatingButton.querySelector('#xportai-fab-btn');
  const statusEl = floatingButton.querySelector('#xportai-fab-status');

  btn.className = '';
  statusEl.className = 'hidden';

  switch (state) {
    case 'ready':
      btn.classList.add('xportai-ready');
      break;
    case 'extracting':
      btn.classList.add('xportai-processing');
      statusEl.textContent = 'Extracting...';
      statusEl.classList.remove('hidden');
      break;
    case 'processing':
      btn.classList.add('xportai-processing');
      statusEl.textContent = 'Processing...';
      statusEl.classList.remove('hidden');
      break;
    case 'success':
      btn.classList.add('xportai-success');
      statusEl.textContent = 'Exported!';
      statusEl.classList.remove('hidden');
      setTimeout(() => updateButtonState('ready'), 2000);
      break;
    case 'error':
      btn.classList.add('xportai-error');
      statusEl.textContent = 'Error';
      statusEl.classList.remove('hidden');
      setTimeout(() => updateButtonState('ready'), 3000);
      break;
    case 'streaming':
      btn.classList.add('xportai-streaming');
      statusEl.textContent = 'Generating...';
      statusEl.classList.remove('hidden');
      break;
  }
}

// ── Export Flow ────────────────────────────────────────────────────────
async function handleExportClick() {
  if (isProcessing) return;

  // Check if streaming
  if (isStreaming(currentPlatform)) {
    updateButtonState('streaming');
    notifyPopup({ type: 'STATUS', status: 'streaming' });
    try {
      await waitForStreamingEnd(currentPlatform);
    } catch {
      updateButtonState('error');
      return;
    }
  }

  isProcessing = true;
  updateButtonState('extracting');
  notifyPopup({ type: 'STATUS', status: 'extracting' });

  try {
    // Collect messages via scroll
    updateButtonState('extracting');
    const { messages } = await collectMessages(currentAdapter, (progress) => {
      notifyPopup({ type: 'PROGRESS', ...progress });
    });

    if (messages.length === 0) {
      throw new Error('No messages found in conversation');
    }

    // Normalize
    updateButtonState('processing');
    notifyPopup({ type: 'STATUS', status: 'processing' });

    const conversation = normalize(
      currentPlatform,
      currentAdapter.getTitle(),
      currentAdapter.getUrl(),
      messages
    );

    // Export
    const format = await getExportFormat();
    let content, filename;

    if (format === 'markdown') {
      content = exportMarkdown(conversation);
      filename = getMarkdownFilename(conversation);
    } else {
      content = exportText(conversation);
      filename = getTextFilename(conversation);
    }

    // Download
    downloadFile(content, filename, format === 'markdown' ? 'text/markdown' : 'text/plain');

    updateButtonState('success');
    notifyPopup({
      type: 'EXPORT_COMPLETE',
      conversation: {
        title: conversation.title,
        platform: conversation.platformName,
        messageCount: conversation.messageCount,
        format,
      },
    });
  } catch (err) {
    console.error('[XportAI] Export error:', err);
    updateButtonState('error');
    notifyPopup({ type: 'ERROR', error: err.message });
  } finally {
    isProcessing = false;
  }
}

// ── Export Format Selection ────────────────────────────────────────────
async function getExportFormat() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['defaultFormat'], (result) => {
      resolve(result.defaultFormat || 'markdown');
    });
  });
}

// ── File Download ──────────────────────────────────────────────────────
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  // Primary: use chrome.downloads API (bypasses CSP)
  if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.download) {
    chrome.downloads.download({ url, filename, saveAs: false }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.warn('[XportAI] chrome.downloads failed, using fallback:', chrome.runtime.lastError.message);
        fallbackDownload(url, filename);
      } else {
        // Revoke after a delay to ensure download starts
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    });
  } else {
    fallbackDownload(url, filename);
  }
}

function fallbackDownload(url, filename) {
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1000);
  } catch (err) {
    console.error('[XportAI] Download failed:', err);
    URL.revokeObjectURL(url);
    throw new Error('Download blocked by browser. Try right-clicking the floating button and saving.');
  }
}

// ── Communication ──────────────────────────────────────────────────────
function notifyPopup(message) {
  try {
    chrome.runtime.sendMessage(message, () => {
      void chrome.runtime.lastError; // Suppress "Receiving end does not exist"
    });
  } catch {
    // Extension context invalidated (page reloaded, extension updated)
  }
}

function notifyStatus(status) {
  notifyPopup({
    type: 'STATUS',
    status,
    platform: currentPlatform,
    platformName: getPlatformName(currentPlatform),
    isSupported: currentAdapter?.isSupported() ?? false,
  });
}

// ── Message Listener (from popup) ─────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_STATUS':
      sendResponse({
        platform: currentPlatform,
        platformName: getPlatformName(currentPlatform),
        isSupported: currentAdapter?.isSupported() ?? false,
        isStreaming: currentPlatform !== PLATFORMS.UNSUPPORTED ? isStreaming(currentPlatform) : false,
        isProcessing,
      });
      return true;

    case 'TRIGGER_EXPORT':
      handleExportClick().catch(err => {
        console.error('[XportAI] Export handler error:', err);
        notifyPopup({ type: 'ERROR', error: err.message || 'Export failed unexpectedly' });
      });
      sendResponse({ success: true });
      return true;

    case 'GET_INFO':
      if (currentAdapter) {
        sendResponse({
          platform: currentPlatform,
          platformName: getPlatformName(currentPlatform),
          title: currentAdapter.getTitle(),
          url: currentAdapter.getUrl(),
          isSupported: currentAdapter.isSupported(),
        });
      } else {
        sendResponse({ platform: PLATFORMS.UNSUPPORTED });
      }
      return true;
  }
});

// ── Initial Run ────────────────────────────────────────────────────────
async function boot() {
  // Wait a moment for SPA to initialize
  await sleep(1500);
  await initialize();
}

boot();
