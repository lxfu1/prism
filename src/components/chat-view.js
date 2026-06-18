import { escapeHtml } from '../utils/escape-html.js';

function _fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

export class ChatView {
  render(data, container) {
    this._data = data;
    const messages = data?.messages || [];
    if (messages.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);padding:20px;">无消息内容</div>';
      return;
    }

    container.innerHTML = messages.map((msg, i) => this.renderMessage(msg, i)).join('');

    this.bindEvents(container);
  }

  renderMessage(msg, index) {
    const role = msg.role || 'unknown';
    const raw = msg.content;
    const content = typeof raw === 'string' ? raw : raw != null ? JSON.stringify(raw) : '';
    const reasoning = msg.reasoning_content || '';
    const charCount = content.length;
    const tokenEstimate = Math.ceil(charCount / 4);
    const isLong = charCount > 1000;
    const displayContent = isLong ? content.substring(0, 800) : content;

    let reasoningHtml = '';
    if (reasoning) {
      reasoningHtml = `
        <details class="reasoning-block">
          <summary>思考过程 (${reasoning.length} chars)</summary>
          <div class="reasoning-content">${escapeHtml(reasoning)}</div>
        </details>`;
    }

    return `<div class="chat-message role-${role}">
      <div class="chat-role ${role}">
        <span class="chat-role-dot"></span>
        ${role}
      </div>
      ${reasoningHtml}
      <div class="chat-content" data-index="${index}" data-full="${isLong ? '1' : '0'}">${escapeHtml(displayContent)}${isLong ? '...' : ''}</div>
      ${isLong ? `<button class="chat-toggle" data-index="${index}">显示全部 (${charCount} chars)</button>` : ''}
      <div class="chat-message-footer">
        <div class="chat-meta">${charCount} 字符 · ~${tokenEstimate} tokens</div>
        <button class="chat-copy-btn" data-index="${index}">复制</button>
      </div>
    </div>`;
  }

  bindEvents(container) {
    container.querySelectorAll('.chat-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const index = btn.dataset.index;
        const contentEl = container.querySelector(`.chat-content[data-index="${index}"]`);
        if (!contentEl) return;

        const messages = this._data?.messages;
        if (!messages) return;

        const full = messages[index]?.content || '';
        if (contentEl.dataset.expanded === '1') {
          contentEl.textContent = full.substring(0, 800) + '...';
          contentEl.dataset.expanded = '0';
          btn.textContent = `显示全部 (${full.length} chars)`;
        } else {
          contentEl.textContent = full;
          contentEl.dataset.expanded = '1';
          btn.textContent = '收起';
        }
      });
    });

    container.querySelectorAll('.chat-copy-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const index = btn.dataset.index;
        const messages = this._data?.messages;
        if (!messages?.[index]) return;
        const text = messages[index].content || '';
        const onDone = () => {
          btn.textContent = '已复制';
          setTimeout(() => {
            btn.textContent = '复制';
          }, 1500);
        };
        if (navigator.clipboard?.writeText) {
          navigator.clipboard
            .writeText(text)
            .then(onDone)
            .catch(() => {
              _fallbackCopy(text);
              onDone();
            });
        } else {
          _fallbackCopy(text);
          onDone();
        }
      });
    });
  }
}
