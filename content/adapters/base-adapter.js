/**
 * Base Adapter for XportAI
 * Abstract interface that all platform adapters must implement.
 */

export class BaseAdapter {
  /** @returns {string} Platform constant */
  get platform() {
    throw new Error('Adapter must implement platform getter');
  }

  /** @returns {string} Platform display name */
  get platformName() {
    throw new Error('Adapter must implement platformName getter');
  }

  /**
   * Check if the adapter is ready (conversation DOM exists).
   * @returns {boolean}
   */
  isReady() {
    throw new Error('Adapter must implement isReady()');
  }

  /**
   * Wait for the conversation to be ready.
   * @param {number} [timeoutMs=15000]
   * @returns {Promise<void>}
   */
  async waitForReady(timeoutMs = 15000) {
    const start = Date.now();
    while (!this.isReady()) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`${this.platformName} conversation not ready after ${timeoutMs}ms`);
      }
      await new Promise(r => setTimeout(r, 500));
    }
  }

  /**
   * Extract the conversation title.
   * @returns {string}
   */
  getTitle() {
    throw new Error('Adapter must implement getTitle()');
  }

  /**
   * Get the current URL.
   * @returns {string}
   */
  getUrl() {
    return window.location.href;
  }

  /**
   * Get the scrollable container element.
   * @returns {Element|null}
   */
  getScrollContainer() {
    throw new Error('Adapter must implement getScrollContainer()');
  }

  /**
   * Check if a response is currently streaming/generating.
   * @returns {boolean}
   */
  isStreaming() {
    throw new Error('Adapter must implement isStreaming()');
  }

  /**
   * Extract all messages from the conversation.
   * Must be called after scroll collection has loaded all messages.
   * @returns {Array<{role: 'user'|'assistant', content: string, html: string}>}
   */
  extract() {
    throw new Error('Adapter must implement extract()');
  }

  /**
   * Check if the current page is a conversation (not a landing page).
   * @returns {boolean}
   */
  isSupported() {
    throw new Error('Adapter must implement isSupported()');
  }
}
