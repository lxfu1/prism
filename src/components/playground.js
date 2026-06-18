import { marked } from '../utils/marked-instance.js';
import { JsonFormatter } from './json-formatter.js';
import { escapeHtml } from '../utils/escape-html.js';

const DEBOUNCE_MS = 300;

export class Playground {
  constructor() {
    this._mode = 'json';
    this._jsonFormatter = new JsonFormatter();
    this._debounceTimer = null;
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
