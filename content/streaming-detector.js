/**
 * Streaming Detector for XportAI
 * Detects if an AI response is currently being generated.
 * Prevents export during active generation.
 */

import { PLATFORMS } from './platform-detector.js';

/**
 * Check if a response is currently streaming for the given platform.
 * @param {string} platform
 * @returns {boolean}
 */
export function isStreaming(platform) {
  switch (platform) {
    case PLATFORMS.CHATGPT:
      return isChatGPTStreaming();
    case PLATFORMS.GEMINI:
      return isGeminiStreaming();
    case PLATFORMS.CLAUDE:
      return isClaudeStreaming();
    default:
      return false;
  }
}

function isChatGPTStreaming() {
  // Primary: streaming class on scroll root
  const scrollRoot = document.querySelector('[data-scroll-root]');
  if (scrollRoot && scrollRoot.classList.contains('group-data-stream-active')) {
    return true;
  }

  // Stop button presence
  if (document.querySelector('button[data-testid="stop-button"]')) {
    return true;
  }

  // Check for processing indicator in the last turn
  const lastTurn = document.querySelector('article:last-child');
  if (lastTurn) {
    const turnRole = lastTurn.getAttribute('data-turn');
    if (turnRole === 'assistant') {
      // Check if there's a cursor/typing indicator
      const hasCursor = lastTurn.querySelector('.result-streaming');
      if (hasCursor) return true;
    }
  }

  return false;
}

function isGeminiStreaming() {
  // Processing state element
  if (document.querySelector('processing-state')) return true;

  // Loading indicators
  if (document.querySelector('mat-progress-bar')) return true;
  if (document.querySelector('.loading-indicator')) return true;

  // Check for animated progress in the last response
  const lastResponse = document.querySelector('model-response:last-child');
  if (lastResponse) {
    const progress = lastResponse.querySelector('[role="progressbar"]');
    if (progress) return true;
  }

  return false;
}

function isClaudeStreaming() {
  // data-is-streaming attribute
  const streamingEls = document.querySelectorAll('[data-is-streaming="true"]');
  if (streamingEls.length > 0) return true;

  // Check for stop/cancel button
  const stopBtn = document.querySelector('button[aria-label="Stop Response"]') ||
    document.querySelector('button[data-testid="stop-button"]');
  if (stopBtn) return true;

  return false;
}

/**
 * Wait until streaming stops.
 * @param {string} platform
 * @param {number} [pollMs=1000]
 * @param {number} [timeoutMs=120000]
 * @returns {Promise<void>}
 */
export async function waitForStreamingEnd(platform, pollMs = 1000, timeoutMs = 120000) {
  const start = Date.now();
  while (isStreaming(platform)) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Streaming timeout — took too long to finish');
    }
    await new Promise(r => setTimeout(r, pollMs));
  }
}
