/**
 * Normalizer for XportAI
 * Converts raw adapter output into a clean, standardized ConversationModel.
 */

import { contentHash, deduplicateMessages } from '../utils/dom-helpers.js';
import { getPlatformName } from './platform-detector.js';

/**
 * @typedef {Object} ConversationModel
 * @property {string} platform
 * @property {string} platformName
 * @property {string} title
 * @property {string} url
 * @property {string} exportedAt
 * @property {number} messageCount
 * @property {Message[]} messages
 */

/**
 * @typedef {Object} Message
 * @property {'user'|'assistant'} role
 * @property {string} content
 * @property {string} html
 */

/**
 * Normalize raw extracted messages into a ConversationModel.
 * @param {string} platform - Platform constant
 * @param {string} title - Conversation title
 * @param {string} url - Conversation URL
 * @param {Array<{role: string, content: string, html: string}>} rawMessages
 * @returns {ConversationModel}
 */
export function normalize(platform, title, url, rawMessages) {
  const messages = rawMessages
    .filter(msg => msg && msg.content && msg.content.trim().length > 0)
    .map(msg => ({
      role: normalizeRole(msg.role),
      content: normalizeContent(msg.content),
      html: msg.html || msg.content,
    }));

  const deduped = deduplicateMessages(messages);
  const consecutiveRemoved = removeConsecutiveDuplicates(deduped);

  return {
    platform,
    platformName: getPlatformName(platform),
    title: normalizeTitle(title),
    url,
    exportedAt: new Date().toISOString(),
    messageCount: consecutiveRemoved.length,
    messages: consecutiveRemoved,
  };
}

/**
 * Normalize role to standard values.
 * @param {string} role
 * @returns {'user'|'assistant'}
 */
function normalizeRole(role) {
  const r = role.toLowerCase().trim();
  if (r === 'user' || r === 'human') return 'user';
  if (r === 'assistant' || r === 'bot' || r === 'model' || r === 'ai') return 'assistant';
  return 'user';
}

/**
 * Normalize message content.
 * @param {string} content
 * @returns {string}
 */
function normalizeContent(content) {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Normalize conversation title.
 * @param {string} title
 * @returns {string}
 */
function normalizeTitle(title) {
  if (!title) return 'Untitled Conversation';
  return title
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200);
}

/**
 * Remove consecutive duplicate messages (same role + same content).
 * @param {Message[]} messages
 * @returns {Message[]}
 */
function removeConsecutiveDuplicates(messages) {
  if (messages.length === 0) return messages;

  const result = [messages[0]];
  for (let i = 1; i < messages.length; i++) {
    const prev = result[result.length - 1];
    const curr = messages[i];

    // Skip if same role and same content hash
    if (prev.role === curr.role && contentHash(prev.content) === contentHash(curr.content)) {
      continue;
    }

    result.push(curr);
  }

  return result;
}
