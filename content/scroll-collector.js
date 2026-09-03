/**
 * Scroll Collector for XportAI
 * Handles virtualized/lazy-loaded conversations by progressively scrolling
 * and collecting messages without duplicates.
 */

import { sleep, deduplicateMessages, contentHash } from '../utils/dom-helpers.js';

const MAX_SCROLL_ITERATIONS = 150;
const STABILITY_THRESHOLD = 3; // consecutive scrolls with no new messages
const SCROLL_STEP_MS = 300;
const RENDER_WAIT_MS = 400;

/**
 * Scroll through a conversation and collect all messages.
 * Works with both regular DOMs and virtualized DOMs (like Claude).
 *
 * @param {import('./adapters/base-adapter.js').BaseAdapter} adapter
 * @param {Function} [onProgress] - Callback with ({ phase, current, total })
 * @returns {Promise<{messages: Array, scrollRestored: boolean}>}
 */
export async function collectMessages(adapter, onProgress) {
  const container = adapter.getScrollContainer();
  if (!container) {
    throw new Error('No scroll container found');
  }

  const originalScrollTop = container.scrollTop;
  const collectedMessages = new Map(); // contentHash → message
  let stableCount = 0;
  let previousCount = 0;

  // Phase 1: Scroll to the very top to load earliest messages
  onProgress?.({ phase: 'scrolling-to-top', current: 0, total: 0 });
  await scrollToTop(container);

  // Phase 2: Progressive scroll down, collecting at each position
  for (let i = 0; i < MAX_SCROLL_ITERATIONS; i++) {
    // Extract messages visible at current scroll position
    const visibleMessages = adapter.extract();
    let newCount = 0;

    for (const msg of visibleMessages) {
      const hash = contentHash(msg.content);
      if (!collectedMessages.has(hash)) {
        collectedMessages.set(hash, msg);
        newCount++;
      }
    }

    const totalCount = collectedMessages.size;
    onProgress?.({
      phase: 'collecting',
      current: totalCount,
      total: previousCount,
      iteration: i,
    });

    // Check stability
    if (totalCount === previousCount) {
      stableCount++;
      if (stableCount >= STABILITY_THRESHOLD) {
        break; // No new messages for N iterations — we're done
      }
    } else {
      stableCount = 0;
    }
    previousCount = totalCount;

    // Scroll down by one viewport height
    const scrolled = scrollDown(container);
    if (!scrolled) {
      // Can't scroll further — reached bottom
      break;
    }

    await sleep(SCROLL_STEP_MS);
    await sleep(RENDER_WAIT_MS);
  }

  // Phase 3: Final scroll-to-bottom pass to catch any late-loading messages
  onProgress?.({ phase: 'final-pass', current: collectedMessages.size, total: 0 });
  await scrollToBottom(container);
  await sleep(RENDER_WAIT_MS);

  const finalMessages = adapter.extract();
  for (const msg of finalMessages) {
    const hash = contentHash(msg.content);
    if (!collectedMessages.has(hash)) {
      collectedMessages.set(hash, msg);
    }
  }

  // Restore original scroll position
  container.scrollTop = originalScrollTop;

  const messages = deduplicateMessages(Array.from(collectedMessages.values()));
  return { messages, scrollRestored: true };
}

/**
 * Scroll to the top of a container.
 * @param {Element} container
 */
async function scrollToTop(container) {
  // For virtualized containers, scroll in steps to trigger loading
  let currentPos = container.scrollTop;

  while (currentPos > 0) {
    currentPos -= container.clientHeight || 500;
    container.scrollTop = Math.max(0, currentPos);
    // Dispatch synthetic scroll event to trigger lazy-loading
    container.dispatchEvent(new Event('scroll', { bubbles: true }));
    await sleep(150);
  }

  container.scrollTop = 0;
  container.dispatchEvent(new Event('scroll', { bubbles: true }));
  await sleep(RENDER_WAIT_MS);
}

/**
 * Scroll down by one viewport height.
 * @param {Element} container
 * @returns {boolean} Whether scrolling occurred
 */
function scrollDown(container) {
  const before = container.scrollTop;
  container.scrollTop += container.clientHeight || 500;
  
  // Dispatch synthetic scroll events to trigger SPA lazy-loading
  container.dispatchEvent(new Event('scroll', { bubbles: true }));
  container.dispatchEvent(new Event('scrollend', { bubbles: true }));
  
  return container.scrollTop > before;
}

/**
 * Scroll to the bottom of a container.
 * @param {Element} container
 */
async function scrollToBottom(container) {
  let lastPos = -1;
  let attempts = 0;

  while (container.scrollTop !== lastPos && attempts < 50) {
    lastPos = container.scrollTop;
    container.scrollTop = container.scrollHeight;
    // Dispatch synthetic scroll event to trigger lazy-loading
    container.dispatchEvent(new Event('scroll', { bubbles: true }));
    await sleep(200);
    attempts++;
  }
}
