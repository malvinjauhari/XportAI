/**
 * XportAI Popup Script
 * Manages the extension popup UI, communicates with content scripts.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.getElementById('status-text');
  const infoSection = document.getElementById('info-section');
  const infoPlatform = document.getElementById('info-platform');
  const infoTitle = document.getElementById('info-title');
  const infoMessages = document.getElementById('info-messages');
  const exportSection = document.getElementById('export-section');
  const exportStatus = document.getElementById('export-status');
  const exportStatusText = document.getElementById('export-status-text');
  const btnExportMd = document.getElementById('btn-export-md');
  const btnExportTxt = document.getElementById('btn-export-txt');
  const settingsToggle = document.getElementById('settings-toggle');
  const settingsPanel = document.getElementById('settings-panel');
  const formatSelect = document.getElementById('format-select');

  // Load settings
  const settings = await chrome.storage.local.get(['defaultFormat']);
  formatSelect.value = settings.defaultFormat || 'markdown';

  // Settings toggle
  settingsToggle.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
    settingsToggle.classList.toggle('active');
  });

  formatSelect.addEventListener('change', () => {
    chrome.storage.local.set({ defaultFormat: formatSelect.value });
  });

  // Export buttons
  btnExportMd.addEventListener('click', () => triggerExport('markdown'));
  btnExportTxt.addEventListener('click', () => triggerExport('text'));

  // Get current tab status
  await refreshStatus();

  // Listen for messages from content script
  chrome.runtime.onMessage.addListener((message) => {
    switch (message.type) {
      case 'STATUS':
        updateStatus(message);
        break;
      case 'PROGRESS':
        updateProgress(message);
        break;
      case 'EXPORT_COMPLETE':
        showExportComplete(message.conversation);
        break;
      case 'ERROR':
        showError(message.error);
        break;
    }
  });

  async function refreshStatus(retries = 5, delayMs = 400) {
    const supportedHosts = ['chatgpt.com', 'gemini.google.com', 'claude.ai'];

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;

        // Only try on supported URLs
        try {
          const url = new URL(tab.url);
          if (!supportedHosts.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) {
            showUnsupported();
            return;
          }
        } catch {
          showUnsupported();
          return;
        }

        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' });
        if (response) {
          updateStatus(response);
          return;
        }
      } catch {
        // Content script not ready yet — wait and retry
        if (attempt < retries - 1) {
          await new Promise(r => setTimeout(r, delayMs));
        }
      }
    }
    // All retries exhausted
    showUnsupported();
  }

  function updateStatus(data) {
    const { status, platform, platformName, isSupported, isStreaming } = data;

    // Determine display status
    const displayStatus = status || (isSupported ? 'ready' : 'unsupported');

    // Update status dot
    statusDot.className = 'status-dot ' + displayStatus;

    // Update status text
    const statusMessages = {
      detecting: 'Detecting platform...',
      ready: 'Ready to export',
      unsupported: 'Not a conversation page',
      streaming: 'Response generating...',
      extracting: 'Extracting messages...',
      processing: 'Processing...',
      success: 'Export complete!',
      error: 'Export failed',
    };
    statusText.textContent = statusMessages[displayStatus] || 'Unknown';

    // Update info section
    if (isSupported && platform && platform !== 'unsupported') {
      infoSection.classList.remove('hidden');
      infoPlatform.textContent = platformName || platform;
      exportSection.classList.remove('hidden');
    } else {
      infoSection.classList.add('hidden');
      exportSection.classList.add('hidden');
    }

    // Disable buttons during streaming/processing
    const isBlocked = displayStatus === 'streaming' || displayStatus === 'extracting' || displayStatus === 'processing';
    btnExportMd.disabled = isBlocked;
    btnExportTxt.disabled = isBlocked;
  }

  function updateProgress(data) {
    const { phase, current, iteration } = data;
    const phaseMessages = {
      'scrolling-to-top': 'Loading conversation history...',
      'collecting': `Collecting messages... ${current} found`,
      'final-pass': 'Finalizing extraction...',
    };
    statusText.textContent = phaseMessages[phase] || 'Processing...';
  }

  async function triggerExport(format) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      // Set format preference
      await chrome.storage.local.set({ defaultFormat: format });

      // Show processing state
      setStatus('extracting', 'Extracting messages...');

      // Send export trigger to content script (with retry)
      let response = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_EXPORT' });
          break;
        } catch {
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 500));
          }
        }
      }

      if (!response?.success) {
        showError('Failed to trigger export');
      }
    } catch (err) {
      showError(err.message || 'Export failed');
    }
  }

  function showExportComplete(conversation) {
    setStatus('success', 'Export complete!');
    infoTitle.textContent = conversation.title;
    infoMessages.textContent = conversation.messageCount;
    exportStatus.classList.remove('hidden');
    exportStatusText.className = 'export-status-text success';
    exportStatusText.textContent = `Exported ${conversation.messageCount} messages as .${conversation.format === 'markdown' ? 'md' : 'txt'}`;

    setTimeout(() => {
      exportStatus.classList.add('hidden');
    }, 4000);
  }

  function showError(message) {
    setStatus('error', 'Export failed');
    exportStatus.classList.remove('hidden');
    exportStatusText.className = 'export-status-text error';
    exportStatusText.textContent = message;
  }

  function showUnsupported() {
    setStatus('unsupported', 'Not a conversation page');
    infoSection.classList.add('hidden');
    exportSection.classList.add('hidden');
  }

  function setStatus(status, text) {
    statusDot.className = 'status-dot ' + status;
    statusText.textContent = text;
  }
});
