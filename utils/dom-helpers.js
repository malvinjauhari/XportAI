/**
 * DOM Helper Utilities for XportAI
 * Shared functions for element waiting, text extraction, deduplication, and hashing.
 */

/**
 * Wait for a DOM element to appear in the document.
 * @param {string} selector - CSS selector
 * @param {Element} [root=document] - Root element to observe
 * @param {number} [timeoutMs=10000] - Timeout in milliseconds
 * @returns {Promise<Element>}
 */
export function waitForElement(selector, root = document, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const existing = root.querySelector(selector);
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const el = root.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(root.documentElement || root, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`waitForElement timed out: ${selector}`));
    }, timeoutMs);
  });
}

/**
 * Wait for multiple elements to appear.
 * @param {string} selector
 * @param {number} [minCount=1]
 * @param {Element} [root=document]
 * @param {number} [timeoutMs=10000]
 * @returns {Promise<Element[]>}
 */
export function waitForElements(selector, minCount = 1, root = document, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const check = () => {
      const els = root.querySelectorAll(selector);
      return els.length >= minCount ? els : null;
    };

    const existing = check();
    if (existing) return resolve(Array.from(existing));

    const observer = new MutationObserver(() => {
      const els = check();
      if (els) {
        observer.disconnect();
        resolve(Array.from(els));
      }
    });

    observer.observe(root.documentElement || root, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`waitForElements timed out: ${selector} (need ${minCount})`));
    }, timeoutMs);
  });
}

/**
 * Safely extract text content from an element, preserving some structure.
 * Collapses multiple spaces/newlines but keeps paragraph breaks.
 * @param {Element} el
 * @returns {string}
 */
export function safeText(el) {
  if (!el) return '';
  return el.textContent
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Extract innerHTML safely.
 * @param {Element} el
 * @returns {string}
 */
export function safeHTML(el) {
  if (!el) return '';
  return el.innerHTML;
}

/**
 * Simple content hash for deduplication (djb2 algorithm).
 * @param {string} str
 * @returns {string}
 */
export function contentHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Deduplicate an array of messages by content hash.
 * Keeps the first occurrence.
 * @param {Array<{content: string}>} messages
 * @returns {Array}
 */
export function deduplicateMessages(messages) {
  const seen = new Set();
  const result = [];
  for (const msg of messages) {
    const hash = contentHash(msg.content);
    if (!seen.has(hash)) {
      seen.add(hash);
      result.push(msg);
    }
  }
  return result;
}

/**
 * Remove platform UI artifacts from extracted HTML.
 * Strips copy buttons, screen reader text, hidden elements.
 * @param {string} html
 * @returns {string}
 */
export function stripUIArtifacts(html) {
  const div = document.createElement('div');
  div.innerHTML = html;

  // Remove screen reader text
  div.querySelectorAll('.sr-only, .cdk-visually-hidden, [aria-hidden="true"]').forEach(el => el.remove());

  // Remove hidden elements
  div.querySelectorAll('[style*="display: none"], [style*="visibility: hidden"]').forEach(el => el.remove());

  // Remove copy/action buttons
  div.querySelectorAll('button').forEach(el => el.remove());

  // Remove SVG icons
  div.querySelectorAll('svg').forEach(el => el.remove());

  return div.innerHTML;
}

/**
 * Debounce a function call.
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function}
 */
export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a filename-safe string from a title.
 * @param {string} title
 * @param {string} platform
 * @returns {string}
 */
export function generateFilename(title, platform) {
  const safe = title
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
  const date = new Date().toISOString().split('T')[0];
  return `${platform.toLowerCase()}-${safe || 'conversation'}-${date}`;
}
