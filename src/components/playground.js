import { marked } from '../utils/marked-instance.js';
import { JsonFormatter } from './json-formatter.js';
import { escapeHtml } from '../utils/escape-html.js';

const DEBOUNCE_MS = 300;

export class Playground {
  constructor() {
    this._mode = 'json';
    this._jsonFormatter = new JsonFormatter();
    this._debounceTimer = null;
    this._searchMatches = [];
    this._currentMatchIndex = -1;
  }

  render(container) {
    this._container = container;
    container.innerHTML = `
      <div class="playground">
        <div class="playground-header">
          <div class="playground-tabs">
            <button class="playground-tab active" data-mode="json">JSON</button>
            <button class="playground-tab" data-mode="markdown">Markdown</button>
          </div>
          <span class="playground-hint">粘贴内容即可实时预览，支持编辑</span>
        </div>
        <div class="playground-body">
          <div class="playground-input-wrap">
            <textarea
              class="playground-input"
              placeholder="${this._mode === 'json' ? '粘贴 JSON 字符串...' : '粘贴 Markdown 内容...'}"
              spellcheck="false"
            ></textarea>
          </div>
          <div class="resizer playground-resizer" id="playground-resizer"></div>
          <div class="playground-output" id="playground-output"></div>
        </div>
      </div>`;

    this._input = container.querySelector('.playground-input');
    this._output = container.querySelector('#playground-output');

    // Tab switching
    container.querySelectorAll('.playground-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        container.querySelectorAll('.playground-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        this._mode = tab.dataset.mode;
        this._input.placeholder =
          this._mode === 'json' ? '粘贴 JSON 字符串...' : '粘贴 Markdown 内容...';
        this._output.innerHTML = '';
        this._scheduleRender();
      });
    });

    // Live render on input & paste
    this._input.addEventListener('input', () => this._scheduleRender());
    this._input.addEventListener('paste', () => {
      // Paste may not trigger 'input' synchronously in all browsers;
      // schedule after a microtask so the textarea value is up-to-date.
      setTimeout(() => this._scheduleRender(), 0);
    });

    // Initial render
    this._scheduleRender();

    // Resizer
    this._setupResizer(container);
  }

  _setupResizer(container) {
    const resizer = container.querySelector('#playground-resizer');
    const first = container.querySelector('.playground-input-wrap');
    const second = container.querySelector('.playground-output');
    if (!resizer || !first || !second) return;

    const resizeHandler = () => {
      first.style.flex = '';
      second.style.flex = '';
    };
    window.addEventListener('resize', resizeHandler);
    this._pgResizeHandler = resizeHandler;

    let startX, startLeftWidth, startRightWidth;

    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startLeftWidth = first.getBoundingClientRect().width;
      startRightWidth = second.getBoundingClientRect().width;
      resizer.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (e) => {
        const dx = e.clientX - startX;
        const minSize = 240;
        const totalAvailable = startLeftWidth + startRightWidth;
        const maxLeft = totalAvailable - minSize;
        const newLeft = Math.min(maxLeft, Math.max(minSize, startLeftWidth + dx));
        const newRight = totalAvailable - newLeft;
        first.style.flex = `0 0 ${newLeft}px`;
        second.style.flex = `0 0 ${newRight}px`;
      };

      const onMouseUp = () => {
        resizer.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    resizer.addEventListener('dblclick', () => {
      first.style.flex = '';
      second.style.flex = '';
    });
  }

  _scheduleRender() {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      requestAnimationFrame(() => this._renderOutput());
    }, DEBOUNCE_MS);
  }

  _renderOutput() {
    const raw = this._input.value.trim();
    if (!raw) {
      this._output.innerHTML =
        '<div style="color:var(--text-muted);padding:40px;text-align:center;">在左侧输入内容即可预览</div>';
      return;
    }

    if (this._mode === 'json') {
      this._renderJson(raw);
    } else {
      this._renderMarkdown(raw);
    }
  }

  _renderJson(raw) {
    const MAX_JSON_SIZE = 500000;
    if (raw.length > MAX_JSON_SIZE) {
      this._output.innerHTML = `<div class="playground-warning">JSON 内容过长（${raw.length.toLocaleString()} 字符），超出 ${MAX_JSON_SIZE.toLocaleString()} 字符限制，请缩减后重试</div>`;
      return;
    }
    try {
      const data = JSON.parse(raw);
      this._jsonFormatter.render(data, this._output);
    } catch (err) {
      this._output.innerHTML = `<div class="playground-error">
        <div class="playground-error-title">JSON 解析错误</div>
        <div class="playground-error-msg">${escapeHtml(err.message)}</div>
      </div>`;
    }
    this._highlightOutputMatches();
  }

  _renderMarkdown(raw) {
    const MAX_RENDER_SIZE = 200000;
    try {
      let content = raw;
      let truncated = false;
      if (raw.length > MAX_RENDER_SIZE) {
        content = raw.substring(0, MAX_RENDER_SIZE);
        truncated = true;
      }
      const html = marked.parse(content);
      const warning = truncated
        ? `<div class="playground-warning">内容过长（${raw.length.toLocaleString()} 字符），仅渲染前 ${MAX_RENDER_SIZE.toLocaleString()} 字符</div>`
        : '';
      this._output.innerHTML = `${warning}<div class="markdown-body">${html}</div>`;
    } catch (err) {
      this._output.innerHTML = `<div class="playground-error">
        <div class="playground-error-title">Markdown 渲染错误</div>
        <div class="playground-error-msg">${escapeHtml(err.message)}</div>
      </div>`;
    }
    this._highlightOutputMatches();
  }

  // ── Search ────────────────────────────────────────────

  /**
   * Search within the Playground textarea content.
   * Returns { matches: Array<{index, length, text}>, total: number }
   */
  search(query) {
    const raw = this._input ? this._input.value : '';
    if (!query || !raw) {
      this._searchMatches = [];
      this._currentMatchIndex = -1;
      this._clearHighlights();
      return { matches: [], total: 0, current: -1 };
    }

    const queryLower = query.toLowerCase();
    const rawLower = raw.toLowerCase();
    this._searchMatches = [];

    let pos = 0;
    while (pos < rawLower.length) {
      const idx = rawLower.indexOf(queryLower, pos);
      if (idx === -1) break;
      this._searchMatches.push({
        index: idx,
        length: query.length,
        text: raw.substring(idx, idx + query.length),
      });
      pos = idx + 1;
    }

    this._currentMatchIndex = this._searchMatches.length > 0 ? 0 : -1;
    this._highlightMatches();
    return {
      matches: this._searchMatches,
      total: this._searchMatches.length,
      current: this._currentMatchIndex,
    };
  }

  /**
   * Navigate to the next/previous search match in the textarea.
   * Direction: 1 = next, -1 = previous
   */
  navigateMatch(direction) {
    if (this._searchMatches.length === 0) return;
    this._currentMatchIndex += direction;
    if (this._currentMatchIndex >= this._searchMatches.length) this._currentMatchIndex = 0;
    if (this._currentMatchIndex < 0) this._currentMatchIndex = this._searchMatches.length - 1;
    this._highlightMatches();
    this._scrollToCurrentMatch();
    this._updateCurrentOutputMark();
    return this._currentMatchIndex;
  }

  /**
   * Clear all search highlights and reset state.
   */
  clearSearch() {
    this._searchMatches = [];
    this._currentMatchIndex = -1;
    this._clearHighlights();
    this._clearOutputHighlights();
  }

  /**
   * Highlight search matches in the output (rendered) panel.
   * Walks text nodes in the output DOM and wraps matching substrings with <mark>.
   */
  _highlightOutputMatches() {
    if (!this._output || this._searchMatches.length === 0) return;

    const query = this._searchMatches[0]?.text;
    if (!query) return;

    const queryLower = query.toLowerCase();
    const outputMarks = this._output.querySelectorAll('.pg-output-mark');
    outputMarks.forEach((mark) => {
      const parent = mark.parentNode;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    });

    this._outputMarkNodes = [];
    const walker = document.createTreeWalker(
      this._output,
      NodeFilter.SHOW_TEXT,
      null,
    );
    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    for (const node of textNodes) {
      const text = node.textContent;
      const textLower = text.toLowerCase();
      let searchPos = 0;

      const fragments = [];
      let lastIdx = 0;

      while (searchPos < textLower.length) {
        const matchIdx = textLower.indexOf(queryLower, searchPos);
        if (matchIdx === -1) break;

        if (matchIdx > lastIdx) {
          fragments.push(document.createTextNode(text.substring(lastIdx, matchIdx)));
        }

        const markEl = document.createElement('mark');
        markEl.className = 'pg-output-mark';
        markEl.textContent = text.substring(matchIdx, matchIdx + query.length);
        fragments.push(markEl);
        this._outputMarkNodes.push(markEl);

        lastIdx = matchIdx + query.length;
        searchPos = matchIdx + 1;
      }

      if (fragments.length > 0) {
        if (lastIdx < text.length) {
          fragments.push(document.createTextNode(text.substring(lastIdx)));
        }
        const parent = node.parentNode;
        for (const frag of fragments) {
          parent.insertBefore(frag, node);
        }
        parent.removeChild(node);
      }
    }

    // Mark the current match with an extra class
    if (this._currentMatchIndex >= 0 && this._outputMarkNodes.length > 0) {
      // Map input matches to output marks — the nth mark in output corresponds to the nth match overall
      this._updateCurrentOutputMark();
    }
  }

  _clearOutputHighlights() {
    if (!this._output) return;
    const marks = this._output.querySelectorAll('.pg-output-mark');
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    });
    this._outputMarkNodes = [];
  }

  _updateCurrentOutputMark() {
    // Remove previous current highlight from all output marks
    this._outputMarkNodes.forEach((m) => m.classList.remove('current'));

    if (this._currentMatchIndex < 0 || this._outputMarkNodes.length === 0) return;

    // Find the output mark closest to the current match index
    // Each input match may map to 0, 1, or multiple output marks.
    // We pick the output mark whose text matches the same occurrence as the current input match.
    const currentInputMatch = this._searchMatches[this._currentMatchIndex];
    if (!currentInputMatch) return;

    const matchedTextLower = currentInputMatch.text.toLowerCase();
    for (const mark of this._outputMarkNodes) {
      if (mark.textContent.toLowerCase() === matchedTextLower) {
        mark.classList.add('current');
        // Scroll output to show this mark
        mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
    }
  }

  _highlightMatches() {
    this._clearHighlights();

    if (this._searchMatches.length === 0 || !this._input) return;

    // Create a mirrored overlay div for visual highlights over the textarea
    const wrap = this._input.parentElement;
    let overlay = wrap.querySelector('.playground-search-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'playground-search-overlay';
      wrap.appendChild(overlay);

      // Sync scroll position from textarea to overlay
      this._input.addEventListener('scroll', () => {
        overlay.scrollTop = this._input.scrollTop;
        overlay.scrollLeft = this._input.scrollLeft;
      });
    }

    // Build highlighted HTML from textarea content
    const raw = this._input.value;
    let html = '';
    let lastIdx = 0;

    for (let i = 0; i < this._searchMatches.length; i++) {
      const match = this._searchMatches[i];
      html += escapeHtml(raw.substring(lastIdx, match.index));
      const isCurrent = i === this._currentMatchIndex;
      html += `<mark class="playground-search-highlight${isCurrent ? ' current' : ''}">${escapeHtml(match.text)}</mark>`;
      lastIdx = match.index + match.length;
    }
    html += escapeHtml(raw.substring(lastIdx));

    overlay.innerHTML = html;

    this._scrollToCurrentMatch();
    this._highlightOutputMatches();
  }

  _clearHighlights() {
    const wrap = this._input ? this._input.parentElement : null;
    if (!wrap) return;
    const overlay = wrap.querySelector('.playground-search-overlay');
    if (overlay) overlay.innerHTML = '';
  }

  _scrollToCurrentMatch() {
    if (this._currentMatchIndex < 0 || !this._input) return;
    const match = this._searchMatches[this._currentMatchIndex];

    // Calculate approximate scroll position based on character index
    const textBeforeMatch = this._input.value.substring(0, match.index);
    const linesBeforeMatch = textBeforeMatch.split('\n').length - 1;
    const lineHeight = parseFloat(getComputedStyle(this._input).lineHeight) || 21;
    const scrollTop = linesBeforeMatch * lineHeight - this._input.clientHeight / 2;

    this._input.scrollTop = Math.max(0, scrollTop);

    // Also scroll the overlay
    const overlay = this._input.parentElement.querySelector('.playground-search-overlay');
    if (overlay) overlay.scrollTop = this._input.scrollTop;
  }

  destroy() {
    clearTimeout(this._debounceTimer);
    this._jsonFormatter._stringStore.clear();
    if (this._pgResizeHandler) {
      window.removeEventListener('resize', this._pgResizeHandler);
      this._pgResizeHandler = null;
    }
    if (this._container) {
      this._container.innerHTML = '';
    }
  }
}
