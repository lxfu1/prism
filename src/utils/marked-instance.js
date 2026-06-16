import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import { escapeHtml } from './escape-html.js';

const MAX_HIGHLIGHT_SIZE = 20000;

export const marked = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      if (code.length > MAX_HIGHLIGHT_SIZE) {
        return escapeHtml(code);
      }
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch {
          /* ignore highlight errors */
        }
      }
      return escapeHtml(code);
    },
  }),
);

marked.setOptions({ gfm: true, breaks: false });
