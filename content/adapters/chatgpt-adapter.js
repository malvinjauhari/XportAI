/**
 * ChatGPT Adapter for XportAI
 * Extracts conversations from chatgpt.com
 */

import { BaseAdapter } from './base-adapter.js';
import { safeText, safeHTML, waitForElement } from '../../utils/dom-helpers.js';
import { PLATFORMS } from '../platform-detector.js';

export class ChatGPTAdapter extends BaseAdapter {
  get platform() {
    return PLATFORMS.CHATGPT;
  }

  get platformName() {
    return 'ChatGPT';
  }

  isReady() {
    return !!(
      document.querySelector('article[data-turn]') ||
      document.querySelector('[data-message-author-role]')
    );
  }

  getTitle() {
    // Try page title first
    const title = document.title?.replace(/\s*\|\s*ChatGPT\s*$/i, '').trim();
    if (title && title !== 'ChatGPT') return title;

    // Try first user message as title
    const firstUser = document.querySelector(
      'article[data-turn="user"] .whitespace-pre-wrap'
    );
    if (firstUser) {
      const text = safeText(firstUser);
      return text.substring(0, 100) || 'ChatGPT Conversation';
    }

    return 'ChatGPT Conversation';
  }

  getScrollContainer() {
    return (
      document.querySelector('[data-scroll-root]') ||
      document.querySelector('main') ||
      document.documentElement
    );
  }

  isStreaming() {
    // Check for streaming indicator
    const scrollRoot = document.querySelector('[data-scroll-root]');
    if (scrollRoot) {
      // ChatGPT adds streaming-related classes to the scroll root
      if (scrollRoot.classList.contains('group-data-stream-active')) return true;
    }

    // Check for stop generation button (present only while streaming)
    if (document.querySelector('button[data-testid="stop-button"]')) return true;

    // Check for thinking/loading indicators in the last turn
    const lastTurn = document.querySelector('article:last-child');
    if (lastTurn) {
      const thinking = lastTurn.querySelector('.relative.my-1.min-h-6');
      const hasContent = lastTurn.querySelector(
        '[data-message-author-role="assistant"] .markdown.prose'
      );
      if (thinking && !hasContent) return true;
    }

    return false;
  }

  isSupported() {
    // Must be on a conversation page
    return (
      window.location.pathname.startsWith('/c/') ||
      !!document.querySelector('article[data-turn]') ||
      !!document.querySelector('[data-message-author-role]')
    );
  }

  extract() {
    const messages = [];

    // Primary: use article[data-turn] with data-turn attribute
    const articles = document.querySelectorAll('article[data-turn]');
    if (articles.length > 0) {
      for (const article of articles) {
        const role = article.getAttribute('data-turn');
        if (role !== 'user' && role !== 'assistant') continue;

        const { content, html } = this._extractFromArticle(article, role);
        if (content) {
          messages.push({ role, content, html });
        }
      }
      return messages;
    }

    // Fallback: use data-message-author-role
    const roleElements = document.querySelectorAll('[data-message-author-role]');
    for (const el of roleElements) {
      const role = el.getAttribute('data-message-author-role');
      if (role !== 'user' && role !== 'assistant') continue;

      const content = safeText(el);
      const html = safeHTML(el);
      if (content) {
        messages.push({ role, content, html });
      }
    }

    return messages;
  }

  _extractFromArticle(article, role) {
    if (role === 'user') {
      const contentEl = article.querySelector('.whitespace-pre-wrap') ||
        article.querySelector('[data-message-author-role="user"]');
      return {
        content: safeText(contentEl),
        html: safeHTML(contentEl),
      };
    }

    // Assistant
    const contentEl = article.querySelector('.markdown.prose') ||
      article.querySelector('[data-message-author-role="assistant"]');
    return {
      content: safeText(contentEl),
      html: safeHTML(contentEl),
    };
  }
}
