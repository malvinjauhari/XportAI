/**
 * Text Exporter for XportAI
 * Converts a normalized ConversationModel to plain text format.
 */

/**
 * Export a ConversationModel to plain text string.
 * @param {import('./normalizer.js').ConversationModel} conversation
 * @returns {string}
 */
export function exportText(conversation) {
  const lines = [];

  // Header
  lines.push(conversation.title);
  lines.push('='.repeat(conversation.title.length));
  lines.push('');
  lines.push(`Platform:  ${conversation.platformName}`);
  lines.push(`Exported:  ${formatDate(conversation.exportedAt)}`);
  lines.push(`Messages:  ${conversation.messageCount}`);
  lines.push('');
  lines.push('-'.repeat(60));
  lines.push('');

  // Messages
  for (const msg of conversation.messages) {
    const label = msg.role === 'user' ? 'USER' : 'ASSISTANT';
    lines.push(`[${label}]`);
    lines.push('');
    lines.push(msg.content);
    lines.push('');
    lines.push('-'.repeat(60));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate filename for text export.
 * @param {import('./normalizer.js').ConversationModel} conversation
 * @returns {string}
 */
export function getTextFilename(conversation) {
  return `${sanitizeFilename(conversation.title, conversation.platform)}.txt`;
}

function sanitizeFilename(title, platform) {
  const date = new Date().toISOString().split('T')[0];
  const safe = title
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
  return `${platform}-${safe || 'conversation'}-${date}`;
}

function formatDate(isoString) {
  try {
    return new Date(isoString).toLocaleString();
  } catch {
    return isoString;
  }
}
