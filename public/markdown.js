import { Marked } from './vendor/markdown/marked.js';
import DOMPurify from './vendor/markdown/purify.js';

const escapeHTML = text => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const parser = new Marked({
  gfm: true,
  renderer: { html: ({ text }) => escapeHTML(text) },
});

DOMPurify.addHook('afterSanitizeAttributes', node => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
  if (node.tagName === 'IMG') {
    node.setAttribute('loading', 'lazy');
    node.setAttribute('referrerpolicy', 'no-referrer');
  }
});

export function renderMarkdown(body) {
  if (!body.trim()) return '<p class="markdown-empty">写下第一句话，思考就有了起点。</p>';
  return DOMPurify.sanitize(parser.parse(body), {
    ALLOWED_TAGS: ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'em', 'strong', 'del', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'input'],
    ALLOWED_ATTR: ['href', 'title', 'src', 'alt', 'class', 'type', 'checked', 'disabled', 'start', 'align'],
  });
}
