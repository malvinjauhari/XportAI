/**
 * Markdown Exporter for XportAI
 * Converts a normalized ConversationModel to Markdown format.
 * Uses Turndown.js for HTML→Markdown conversion.
 */

/**
 * Turndown Service - lightweight inline implementation.
 * Handles code blocks, lists, links, tables, and basic formatting.
 */
class TurndownService {
  constructor() {
    this.rules = [];
  }

  /**
   * Convert HTML string to Markdown.
   * @param {string} html
   * @returns {string}
   */
  turndown(html) {
    if (!html) return '';

    const div = document.createElement('div');
    div.innerHTML = html;

    return this._processNode(div).trim();
  }

  _processNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return this._escapeText(node.textContent);
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();
    const children = Array.from(node.childNodes)
      .map(child => this._processNode(child))
      .join('');

    switch (tag) {
      case 'h1': return `\n\n# ${children.trim()}\n\n`;
      case 'h2': return `\n\n## ${children.trim()}\n\n`;
      case 'h3': return `\n\n### ${children.trim()}\n\n`;
      case 'h4': return `\n\n#### ${children.trim()}\n\n`;
      case 'h5': return `\n\n##### ${children.trim()}\n\n`;
      case 'h6': return `\n\n###### ${children.trim()}\n\n`;

      case 'p': return `\n\n${children.trim()}\n\n`;
      case 'br': return '\n';
      case 'hr': return '\n\n---\n\n';

      case 'strong':
      case 'b': return `**${children.trim()}**`;
      case 'em':
      case 'i': return `*${children.trim()}*`;
      case 'u': return `<u>${children.trim()}</u>`;
      case 'del':
      case 's': return `~~${children.trim()}~~`;
      case 'code':
        if (node.parentElement?.tagName.toLowerCase() === 'pre') {
          return children;
        }
        return `\`${children.trim()}\``;
      case 'a': {
        const href = node.getAttribute('href');
        const text = children.trim();
        if (href && text) return `[${text}](${href})`;
        return text;
      }
      case 'img': {
        const src = node.getAttribute('src');
        const alt = node.getAttribute('alt') || '';
        return src ? `![${alt}](${src})` : '';
      }

      case 'pre': {
        const codeEl = node.querySelector('code');
        const lang = codeEl?.getAttribute('class')?.match(/language-(\w+)/)?.[1] || '';
        const code = codeEl ? codeEl.textContent : node.textContent;
        return `\n\n\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
      }

      case 'ul': return '\n\n' + this._processList(node, false) + '\n';
      case 'ol': return '\n\n' + this._processList(node, true) + '\n';
      case 'li': {
        const parent = node.parentElement;
        const isOrdered = parent?.tagName.toLowerCase() === 'ol';
        const index = isOrdered
          ? Array.from(parent.children).filter(c => c.tagName.toLowerCase() === 'li').indexOf(node) + 1
          : 0;
        const prefix = isOrdered ? `${index}. ` : '- ';
        return `${prefix}${children.trim()}\n`;
      }

      case 'table': return '\n\n' + this._processTable(node) + '\n\n';

      case 'blockquote': return `\n\n> ${children.trim()}\n\n`;

      case 'div':
      case 'section':
      case 'article':
      case 'span':
      case 'mark':
      case 'small':
      case 'sub':
      case 'sup':
        return children;

      case 'svg':
      case 'path':
      case 'button':
      case 'input':
      case 'select':
      case 'textarea':
        return '';

      default: return children;
    }
  }

  _processList(listEl, ordered) {
    const items = Array.from(listEl.children).filter(
      c => c.tagName.toLowerCase() === 'li'
    );
    return items
      .map((item, i) => {
        const prefix = ordered ? `${i + 1}. ` : '- ';
        const content = Array.from(item.childNodes)
          .map(child => this._processNode(child))
          .join('')
          .trim();
        return `${prefix}${content}\n`;
      })
      .join('');
  }

  _processTable(tableEl) {
    const rows = Array.from(tableEl.querySelectorAll('tr'));
    if (rows.length === 0) return '';

    const result = [];
    for (let i = 0; i < rows.length; i++) {
      const cells = Array.from(rows[i].querySelectorAll('th, td'));
      const row = '| ' + cells.map(c => c.textContent.trim()).join(' | ') + ' |';
      result.push(row);

      if (i === 0) {
        result.push('| ' + cells.map(() => '---').join(' | ') + ' |');
      }
    }

    return result.join('\n');
  }

  _escapeText(text) {
    if (!text) return '';
    return text
      .replace(/\\/g, '\\\\')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_');
  }
}

const turndown = new TurndownService();

/**
 * Export a ConversationModel to Markdown string.
 * @param {import('./normalizer.js').ConversationModel} conversation
 * @returns {string}
 */
export function exportMarkdown(conversation) {
  const lines = [];

  // Header
  lines.push(`# ${conversation.title}`);
  lines.push('');
  lines.push(`**Platform:** ${conversation.platformName}`);
  lines.push(`**Exported:** ${formatDate(conversation.exportedAt)}`);
  lines.push(`**Messages:** ${conversation.messageCount}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Messages
  for (const msg of conversation.messages) {
    const label = msg.role === 'user' ? '## User' : '## Assistant';
    lines.push(label);
    lines.push('');

    // For assistant messages, try HTML→Markdown conversion
    if (msg.role === 'assistant' && msg.html && msg.html !== msg.content) {
      try {
        const md = turndown.turndown(msg.html);
        if (md && md.trim().length > 0) {
          lines.push(md.trim());
        } else {
          lines.push(msg.content);
        }
      } catch {
        lines.push(msg.content);
      }
    } else {
      lines.push(msg.content);
    }

    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate filename for markdown export.
 * @param {import('./normalizer.js').ConversationModel} conversation
 * @returns {string}
 */
export function getMarkdownFilename(conversation) {
  return `${sanitizeFilename(conversation.title, conversation.platform)}.md`;
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
