/**
 * Gemini Adapter for XportAI
 * Extracts conversations from gemini.google.com
 */

import { BaseAdapter } from './base-adapter.js';
import { safeText, safeHTML } from '../../utils/dom-helpers.js';
import { PLATFORMS } from '../platform-detector.js';

export class GeminiAdapter extends BaseAdapter {
  get platform() {
    return PLATFORMS.GEMINI;
  }

  get platformName() {
    return 'Gemini';
  }

  isReady() {
    return !!(
      document.querySelector('user-query') ||
      document.querySelector('model-response')
    );
  }

  getTitle() {
    // Try page title first
    const title = document.title?.replace(/\s*-\s*Gemini\s*$/i, '').trim();
    if (title && title !== 'Gemini') return title;

    // Try first user query text
    const firstQuery = document.querySelector('user-query .query-text-line');
    if (firstQuery) {
      const text = safeText(firstQuery);
      return text.substring(0, 100) || 'Gemini Conversation';
    }

    return 'Gemini Conversation';
  }

  getScrollContainer() {
    return (
      document.querySelector('infinite-scroller[data-test-id="chat-history-container"]') ||
      document.querySelector('.chat-history') ||
      document.querySelector('main') ||
      document.documentElement
    );
  }

  isStreaming() {
    // Check for processing state
    if (document.querySelector('processing-state')) return true;

    // Check for loading indicators in the last model response
    const lastResponse = document.querySelector('model-response:last-child');
    if (lastResponse) {
      if (lastResponse.querySelector('.loading-indicator')) return true;
      if (lastResponse.querySelector('mat-progress-bar')) return true;
    }

    return false;
  }

  isSupported() {
    return (
      !!document.querySelector('user-query') ||
      !!document.querySelector('model-response')
    );
  }

  extract() {
    const messages = [];

    // Gemini uses paired custom elements: user-query + model-response
    const userQueries = document.querySelectorAll('user-query');
    const modelResponses = document.querySelectorAll('model-response');

    // Process user queries
    for (const query of userQueries) {
      const content = this._extractUserContent(query);
      if (content) {
        messages.push({ role: 'user', content, html: content });
      }
    }

    // Process model responses
    for (const response of modelResponses) {
      const { content, html } = this._extractAssistantContent(response);
      if (content) {
        messages.push({ role: 'assistant', content, html });
      }
    }

    // Interleave messages in order by DOM position
    return this._interleaveByPosition(messages);
  }

  _extractUserContent(query) {
    const textEl = query.querySelector('.query-text-line');
    if (textEl) return safeText(textEl);

    // Fallback: copy button aria-label contains the text
    const copyBtn = query.querySelector('button[aria-label*="Copy prompt"]');
    if (copyBtn) {
      const label = copyBtn.getAttribute('aria-label');
      const match = label.match(/Copy prompt[:\s]*(.*)/i);
      if (match) return match[1].trim();
    }

    return safeText(query);
  }

  _extractAssistantContent(response) {
    // Primary: structured-content-container
    const contentEl = response.querySelector(
      'structured-content-container.model-response-text'
    ) || response.querySelector('.model-response-text') ||
      response.querySelector('.response-content');

    if (!contentEl) return { content: '', html: '' };

    // Clone to strip UI artifacts
    const clone = contentEl.cloneNode(true);

    // Remove citations and avatars
    clone.querySelectorAll(
      'source-footnote, source-inline-chip, sources-carousel-inline, bard-avatar, .cdk-visually-hidden'
    ).forEach(el => el.remove());

    // Remove hidden screen reader text
    clone.querySelectorAll('[aria-hidden="true"]').forEach(el => el.remove());

    const content = safeText(clone);
    const html = safeHTML(clone);

    return { content, html };
  }

  _interleaveByPosition(messages) {
    // Get all turn elements with their positions
    const turns = [];

    document.querySelectorAll('user-query').forEach(el => {
      turns.push({ el, role: 'user' });
    });
    document.querySelectorAll('model-response').forEach(el => {
      turns.push({ el, role: 'assistant' });
    });

    // Sort by DOM position
    turns.sort((a, b) => {
      const pos = a.el.compareDocumentPosition(b.el);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    // Rebuild messages in correct order
    const result = [];
    const msgByRole = { user: [], assistant: [] };
    for (const msg of messages) {
      msgByRole[msg.role].push(msg);
    }

    for (const turn of turns) {
      const queue = msgByRole[turn.role];
      if (queue.length > 0) {
        result.push(queue.shift());
      }
    }

    return result;
  }
}
