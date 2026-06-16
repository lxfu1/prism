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
        this._scheduleRender();
      });
    });

    // Live render on input
    this._input.addEventListener('input', () => this._scheduleRender());

    // Resizer
    this._setupResizer(container);
  }

  _setupResizer(container) {
    const resizer = container.querySelector('#playground-resizer');
    const left = container.querySelector('.playground-input-wrap');
    const right = container.querySelector('.playground-output');
    if (!resizer || !left || !right) return;

    let leftRatio = null;
    const body = container.querySelector('.playground-body');

    function applyRatio() {
      if (leftRatio === null) return;
      const total = body.getBoundingClientRect().width;
      const resizerW = resizer.getBoundingClientRect().width;
      const available = total - resizerW;
      const newLeft = Math.max(240, available * leftRatio);
      const newRight = Math.max(240, available - newLeft);
      left.style.flex = `0 0 ${newLeft}px`;
      right.style.flex = `0 0 ${newRight}px`;
    }

    const resizeHandler = () => applyRatio();
    window.addEventListener('resize', resizeHandler);

    // Store the handler ref so we can clean up later if needed
    this._pgResizeHandler = resizeHandler;

    let startX, startLeftWidth, startRightWidth;

    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startLeftWidth = left.getBoundingClientRect().width;
      startRightWidth = right.getBoundingClientRect().width;
      resizer.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (e) => {
        const dx = e.clientX - startX;
        const minLeft = 240;
        const minRight = 240;
        const newLeft = Math.max(minLeft, startLeftWidth + dx);
        const containerWidth =
          startLeftWidth + startRightWidth + resizer.getBoundingClientRect().width;
        const newRight = containerWidth - newLeft - 4;
        if (newRight < minRight) return;
        left.style.flex = `0 0 ${newLeft}px`;
        right.style.flex = `0 0 ${newRight}px`;
      };

      const onMouseUp = () => {
        // Store the ratio for window resize
        const total = body.getBoundingClientRect().width;
        leftRatio = left.getBoundingClientRect().width / total;

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
      left.style.flex = '';
      right.style.flex = '';
      leftRatio = null;
    });
  }

  _scheduleRender() {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._renderOutput(), DEBOUNCE_MS);
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
    try {
      const html = marked.parse(raw);
      this._output.innerHTML = `<div class="markdown-body">${html}</div>`;
    } catch (err) {
      this._output.innerHTML = `<div class="playground-error">
        <div class="playground-error-title">Markdown 渲染错误</div>
        <div class="playground-error-msg">${escapeHtml(err.message)}</div>
      </div>`;
    }
  }

  destroy() {
    clearTimeout(this._debounceTimer);
    if (this._pgResizeHandler) {
      window.removeEventListener('resize', this._pgResizeHandler);
      this._pgResizeHandler = null;
    }
    if (this._container) {
      this._container.innerHTML = '';
    }
  }
}
