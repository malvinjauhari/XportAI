/**
 * Platform Detector for XportAI
 * Detects which AI platform the current page belongs to using URL + DOM hybrid detection.
 */

export const PLATFORMS = {
  CHATGPT: 'chatgpt',
  GEMINI: 'gemini',
  CLAUDE: 'claude',
  UNSUPPORTED: 'unsupported',
};

const DETECTION_RULES = [
  {
    platform: PLATFORMS.CHATGPT,
    hostname: 'chatgpt.com',
    domSelectors: ['[data-message-author-role]', 'article[data-turn]'],
  },
  {
    platform: PLATFORMS.GEMINI,
    hostname: 'gemini.google.com',
    domSelectors: ['model-response', 'user-query'],
  },
  {
    platform: PLATFORMS.CLAUDE,
    hostname: 'claude.ai',
    domSelectors: ['[data-theme="claude"]', '[data-testid="user-message"]', '[data-is-streaming]'],
  },
];

/**
 * Detect the current AI platform.
 * @returns {string} Platform constant from PLATFORMS
 */
export function detectPlatform() {
  const hostname = window.location.hostname;

  for (const rule of DETECTION_RULES) {
    if (hostname === rule.hostname || hostname.endsWith('.' + rule.hostname)) {
      // URL match — verify with DOM if possible
      if (rule.domSelectors.some(sel => document.querySelector(sel))) {
        return rule.platform;
      }
      // URL matches but DOM not loaded yet — still return platform
      return rule.platform;
    }
  }

  // Try DOM-only detection (fallback for URL changes)
  for (const rule of DETECTION_RULES) {
    if (rule.domSelectors.some(sel => document.querySelector(sel))) {
      return rule.platform;
    }
  }

  return PLATFORMS.UNSUPPORTED;
}

/**
 * Get the platform display name.
 * @param {string} platform
 * @returns {string}
 */
export function getPlatformName(platform) {
  const names = {
    [PLATFORMS.CHATGPT]: 'ChatGPT',
    [PLATFORMS.GEMINI]: 'Gemini',
    [PLATFORMS.CLAUDE]: 'Claude',
    [PLATFORMS.UNSUPPORTED]: 'Unsupported',
  };
  return names[platform] || 'Unknown';
}
