import { bus } from '../utils/event-bus.js';
import { escapeHtml } from '../utils/escape-html.js';

/**
 * Extract code blocks from raw markdown text using regex.
 */
function extractCodeBlocks(content) {
  const blocks = [];
  // Match fenced code blocks: ```lang\n...code...\n```
  const regex = /```(\w*)\r?\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const lang = match[1] || '';
    const code = match[2];
    const trimmed = code.trim();
    const isHtml =
      lang === 'html' ||
      trimmed.startsWith('<!DOCTYPE') ||
      trimmed.startsWith('<html') ||
      (trimmed.includes('<head') && trimmed.includes('<body'));
    blocks.push({ lang, code, isHtml });
  }
  return blocks;
}

export class MarkdownPreview {
  constructor() {
    this._currentIndex = -1;
    this._totalEntries = 0;
    this._navContainers = new Set();
    this._lastFingerprint = '';
    bus.on('entry-changed', ({ currentIndex, totalEntries }) => {
      this._currentIndex = currentIndex;
      this._totalEntries = totalEntries;
      this._navContainers.forEach((c) => this._updateNavState(c));
    });
    // Delegate close button for error panels
    if (!MarkdownPreview._errorHandlerBound) {
      MarkdownPreview._errorHandlerBound = true;
      document.addEventListener('click', (e) => {
        const close = e.target.closest('.close-error-panel');
        if (close) close.parentElement.remove();
      });
    }
  }

  _emptyHtml(title, hint) {
    return `<html><head><style>
      body{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#94a3b8;}
      h3{font-size:15px;font-weight:500;margin:0 0 6px;color:#64748b;}
      p{font-size:12px;margin:0;color:#475569;}
    </style></head><body><h3>${title}</h3><p>${hint}</p></body></html>`;
  }

  _extractHtmlBlocks(data) {
    const messages = data?.messages || [];
    const assistantMsgs = messages.filter((m) => m.role === 'assistant');
    const blocks = [];
    for (const msg of assistantMsgs) {
      const content = msg.content || '';
      const codeBlocks = extractCodeBlocks(content);
      for (const b of codeBlocks) {
        if (b.isHtml && b.code.trim().length > 100 && b.code.trim().charAt(0) === '<') {
          blocks.push(b);
        }
      }
    }
    return { blocks, assistantMsgs };
  }

  render(data, container) {
    const { blocks: allHtmlBlocks, assistantMsgs } = this._extractHtmlBlocks(data);

    // Skip re-render if blocks are identical to last render
    const fingerprint = JSON.stringify(allHtmlBlocks.map((b) => b.code));
    if (fingerprint === this._lastFingerprint && fingerprint !== '') {
      this._navContainers.add(container);
      this._updateNavState(container);
      return;
    }
    this._lastFingerprint = fingerprint;

    let emptyTitle, emptyHint;
    if (assistantMsgs.length === 0) {
      emptyTitle = '无 assistant 消息';
      emptyHint = '该条目没有 assistant 角色的回复内容';
    } else if (allHtmlBlocks.length === 0) {
      emptyTitle = '无可预览的 HTML 内容';
      emptyHint = '可切换到 Chat 视图查看对话内容';
    }

    if (emptyTitle) {
      const html = this._emptyHtml(emptyTitle, emptyHint);
      const fakeBlocks = [{ lang: '', code: html, isHtml: true }];
      const output = this.buildHtmlPreviewSection(fakeBlocks);
      container.innerHTML = `<div class="markdown-body">${output}</div>`;
      this.activateHtmlPreviews(container, fakeBlocks);
      this.bindCodeBlockActions(container, fakeBlocks);
      return;
    }

    const output = this.buildHtmlPreviewSection(allHtmlBlocks);
    container.innerHTML = `<div class="markdown-body">${output}</div>`;
    this.activateHtmlPreviews(container, allHtmlBlocks);
    this.bindCodeBlockActions(container, allHtmlBlocks);
  }

  showSource(data, container) {
    const messages = data?.messages || [];
    const source = messages
      .filter((m) => m.role === 'assistant')
      .map((msg) => msg.content || '')
      .join('\n\n');
    container.innerHTML = `<pre class="raw-content">${escapeHtml(source)}</pre>`;
  }

  buildHtmlPreviewSection(blocks) {
    let html = '<div class="html-extract-section">';

    blocks.forEach((block, i) => {
      html += `<div class="html-block-container" id="html-container-${i}">`;
      html += `<div class="html-block-toolbar">`;
      html += `<span class="html-block-lang">${block.lang || 'html'} · ${(block.code.length / 1024).toFixed(1)} KB</span>`;
      html += `<div class="html-block-actions">`;
      html += `<button class="html-nav-btn" data-action="prev" title="上一条 (←)"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
      html += `<span class="html-nav-pos"></span>`;
      html += `<span class="html-block-spacer"></span>`;
      html += `<button class="html-nav-btn" data-action="next" title="下一条 (→)"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
      html += `<button data-action="copy" data-index="${i}">复制代码</button>`;
      html += `<button data-action="refresh" data-index="${i}">刷新</button>`;
      html += `<button data-action="fullscreen" data-index="${i}">全屏</button>`;
      html += `</div></div>`;
      html += `<div class="html-preview-slot" id="html-slot-${i}"></div>`;
      html += `</div>`;
    });

    html += '</div>';
    return html;
  }

  activateHtmlPreviews(container, blocks) {
    if (blocks.length > 0) {
      this._showIframePreview(container, blocks[0].code, 0);
    }
  }

  _showIframePreview(container, code, index) {
    const slot = container.querySelector(`#html-slot-${index}`);
    if (!slot) return;

    // Toggle off if already shown
    const existing = slot.querySelector('iframe');
    if (existing) {
      existing.remove();
      return false;
    }

    const iframe = document.createElement('iframe');
    iframe.className = 'html-preview-frame';
    iframe.sandbox = 'allow-scripts';
    iframe.srcdoc = code;
    slot.appendChild(iframe);

    // Catch errors from the iframe (works for same-origin srcdoc scripts)
    iframe.addEventListener('load', () => {
      iframe.classList.add('loaded');
      try {
        const win = iframe.contentWindow;
        if (!win) return;
        const errors = [];
        win.addEventListener('error', (ev) => {
          errors.push({
            message: ev.message || 'Unknown error',
            filename: ev.filename || '',
            lineno: ev.lineno || 0,
            colno: ev.colno || 0,
            stack: (ev.error && ev.error.stack) || '',
          });
          this._renderIframeErrors(iframe, errors);
        });
        win.addEventListener('unhandledrejection', (ev) => {
          errors.push({
            message: 'Unhandled rejection: ' + String(ev.reason),
            filename: '',
            lineno: 0,
            colno: 0,
            stack: (ev.reason && ev.reason.stack) || '',
          });
          this._renderIframeErrors(iframe, errors);
        });
      } catch {
        // Cross-origin iframe — can't attach error handlers
      }
    });

    return true;
  }

  _renderIframeErrors(iframe, errors) {
    // Show errors as overlay on the iframe parent slot
    const slot = iframe.parentElement;
    if (!slot) return;
    let panel = slot.querySelector('.shadow-error-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'shadow-error-panel';
      panel.style.cssText =
        'position:absolute;bottom:0;left:0;right:0;max-height:35vh;overflow:auto;' +
        'background:#1e1e1e;border-top:2px solid #ef4444;color:#fca5a5;' +
        'font:12px/1.5 monospace;z-index:99999;padding:10px 14px;';
      slot.style.position = 'relative';
      slot.appendChild(panel);
    }

    const items = errors
      .map((e, i) => {
        let h = `<div style="margin-bottom:5px;padding-bottom:5px;border-bottom:1px solid #333">`;
        h += `<b style="color:#ef4444">#${i + 1}</b> `;
        h += `<span style="color:#fca5a5">${escapeHtml(e.message)}</span>`;
        if (e.filename) {
          h += `<div style="color:#888;margin-top:2px">${escapeHtml(e.filename)}:${e.lineno}:${e.colno}</div>`;
        }
        if (e.stack) {
          h += `<pre style="color:#555;font-size:10px;margin:3px 0 0;white-space:pre-wrap;word-break:break-all">${escapeHtml(e.stack)}</pre>`;
        }
        h += `</div>`;
        return h;
      })
      .join('');

    panel.innerHTML =
      `<div style="display:flex;justify-content:space-between;margin-bottom:6px">` +
      `<b style="color:#ef4444">JS 错误 (${errors.length})</b>` +
      `<span style="color:#666;cursor:pointer" class="close-error-panel">关闭</span>` +
      `</div>${items}`;
  }

  bindCodeBlockActions(container, blocks) {
    // Remove previous handler if any
    if (container._blockClickHandler) {
      container.removeEventListener('click', container._blockClickHandler);
    }

    // Escape key exits fullscreen
    if (!this._escBound) {
      this._escBound = true;
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const fullscreenBlock = document.querySelector('.html-block-container.fullscreen');
        if (!fullscreenBlock) return;
        fullscreenBlock.classList.remove('fullscreen');
        const btn = fullscreenBlock.querySelector('[data-action="fullscreen"]');
        if (btn) btn.textContent = '全屏';
      });
    }

    // Update nav state (position and button disabled)
    this._navContainers.add(container);
    this._updateNavState(container);

    const handler = (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;

      // prev/next don't need a block reference
      if (action === 'prev') {
        bus.emit('navigate', { index: this._currentIndex - 1 });
        return;
      }
      if (action === 'next') {
        bus.emit('navigate', { index: this._currentIndex + 1 });
        return;
      }

      const index = parseInt(btn.dataset.index);
      const block = blocks[index];
      if (!block) return;

      switch (action) {
        case 'copy': {
          navigator.clipboard.writeText(block.code).then(() => {
            btn.textContent = '已复制!';
            setTimeout(() => (btn.textContent = '复制代码'), 1500);
          });
          break;
        }
        case 'refresh': {
          const slot = container.querySelector(`#html-slot-${index}`);
          if (slot) {
            slot.innerHTML = '';
            this._showIframePreview(container, block.code, index);
          }
          break;
        }
        case 'fullscreen': {
          const box = container.querySelector(`#html-container-${index}`);
          if (box) {
            box.classList.toggle('fullscreen');
            btn.textContent = box.classList.contains('fullscreen') ? '退出全屏' : '全屏';
          }
          break;
        }
      }
    };

    container._blockClickHandler = handler;
    container.addEventListener('click', handler);
  }

  _updateNavState(container) {
    const total = this._totalEntries || 0;
    const cur = this._currentIndex >= 0 ? this._currentIndex : -1;

    const pos = container.querySelector('.html-nav-pos');
    if (pos) {
      pos.textContent = total > 0 ? `${cur + 1} / ${total}` : '';
    }

    const btnPrev = container.querySelector('[data-action="prev"]');
    const btnNext = container.querySelector('[data-action="next"]');
    if (btnPrev) btnPrev.disabled = total === 0 || cur <= 0;
    if (btnNext) btnNext.disabled = total === 0 || cur >= total - 1;
  }
}
