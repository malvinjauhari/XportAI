/**
 * Claude Adapter for XportAI
 * Extracts conversations from claude.ai
 * Handles virtualized DOM with progressive scroll collection.
 */

import { BaseAdapter } from './base-adapter.js';
import { safeText, safeHTML } from '../../utils/dom-helpers.js';
import { PLATFORMS } from '../platform-detector.js';

export class ClaudeAdapter extends BaseAdapter {
  get platform() {
    return PLATFORMS.CLAUDE;
  }

  get platformName() {
    return 'Claude';
  }

  isReady() {
    return !!(
      document.querySelector('[data-testid="user-message"]') ||
      document.querySelector('[data-is-streaming]') ||
      document.querySelector('.font-claude-response') ||
      this._getConversationContainer()
    );
  }

  _getConversationContainer() {
    return (
      document.querySelector('.overflow-y-scroll.flex-1') ||
      document.querySelector('.overflow-y-scroll.overflow-x-hidden.pt-6.flex-1') ||
      document.querySelector('[data-testid="chat-history"]')
    );
  }

  getTitle() {
    // Try page title first
    const title = document.title?.replace(/\s*\|\s*Claude\s*$/i, '').trim();
    if (title && title !== 'Claude' && title !== 'Claude AI') return title;

    // Try first user message as title
    const firstUser = document.querySelector('[data-testid="user-message"]');
    if (firstUser) {
      const text = safeText(firstUser);
      return text.substring(0, 100) || 'Claude Conversation';
    }

    return 'Claude Conversation';
  }

  getScrollContainer() {
    return this._getConversationContainer() || document.documentElement;
  }

  isStreaming() {
    // Check for streaming attribute on assistant messages
    const streamingEls = document.querySelectorAll('[data-is-streaming="true"]');
    if (streamingEls.length > 0) return true;

    // Check last assistant container for streaming state
    const lastResponse = document.querySelector(
      '.font-claude-response:last-child'
    )?.closest('[data-is-streaming]');
    if (lastResponse && lastResponse.getAttribute('data-is-streaming') === 'true') {
      return true;
    }

    return false;
  }

  isSupported() {
    return (
      window.location.pathname.startsWith('/chat/') ||
      window.location.pathname.startsWith('/new') ||
      !!document.querySelector('[data-testid="user-message"]') ||
      !!document.querySelector('[data-is-streaming]')
    );
  }

  extract() {
    const messages = [];

    // Claude uses paired turn containers
    const turnContainers = document.querySelectorAll('[data-test-render-count]');

    if (turnContainers.length > 0) {
      for (const container of turnContainers) {
        const userMsg = container.querySelector('[data-testid="user-message"]');
        if (userMsg) {
          const content = safeText(userMsg);
          if (content) {
            messages.push({ role: 'user', content, html: content });
          }
        }

        // Assistant response is a sibling or child after user message
        const assistantEl = container.querySelector('[data-is-streaming]') ||
          container.querySelector('.font-claude-response')?.closest('[class*="group"]');
        if (assistantEl) {
          const { content, html } = this._extractAssistantContent(assistantEl);
          if (content) {
            messages.push({ role: 'assistant', content, html });
          }
        }
      }
      return messages;
    }

    // Fallback: extract all user messages and assistant responses separately
    const userMsgs = document.querySelectorAll('[data-testid="user-message"]');
    for (const msg of userMsgs) {
      const content = safeText(msg);
      if (content) {
        messages.push({ role: 'user', content, html: content });
      }
    }

    const assistantMsgs = document.querySelectorAll('[data-is-streaming]');
    for (const msg of assistantMsgs) {
      const { content, html } = this._extractAssistantContent(msg);
      if (content) {
        messages.push({ role: 'assistant', content, html });
      }
    }

    return messages;
  }

  _extractAssistantContent(el) {
    // Primary: standard-markdown
    const contentEl = el.querySelector('.standard-markdown') ||
      el.querySelector('.progressive-markdown') ||
      el.querySelector('.font-claude-response');

    if (!contentEl) return { content: safeText(el), html: safeHTML(el) };

    // Clone to clean up
    const clone = contentEl.cloneNode(true);

    // Remove thinking blocks (but keep the label)
    clone.querySelectorAll('button[aria-expanded]').forEach(btn => {
      const parent = btn.closest('.transition-all');
      if (parent) {
        const label = btn.textContent?.trim();
        if (label) {
          parent.replaceWith(document.createTextNode(`[Thinking: ${label}]\n\n`));
        } else {
          parent.remove();
        }
      }
    });

    // Remove action buttons
    clone.querySelectorAll('button').forEach(el => el.remove());

    const content = safeText(clone);
    const html = safeHTML(clone);

    return { content, html };
  }
}
