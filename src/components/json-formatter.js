export class JsonFormatter {
  constructor() {
    this.lineCount = 0;
    this._stringStore = new Map();
  }

  render(data, container) {
    this.lineCount = 0;
    this._stringStore.clear();
    this._charsPerLine = this._measureLineWidth(container);
    const html = this.formatValue(data, '', 0);
    container.innerHTML = `<div class="json-tree">${html}</div>`;
    this.bindFoldEvents(container);
  }

  _measureLineWidth(container) {
    const probe = document.createElement('span');
    probe.className = 'json-tree';
    probe.style.cssText = 'visibility:hidden;position:absolute;white-space:nowrap';
    probe.textContent = 'X';
    container.appendChild(probe);
    const charW = probe.getBoundingClientRect().width;
    container.removeChild(probe);
    if (!charW) return 80;
    const rect = container.getBoundingClientRect();
    const cs = getComputedStyle(container);
    const contentW = rect.width
      - parseFloat(cs.paddingLeft)
      - parseFloat(cs.paddingRight);
    return Math.max(40, Math.floor(contentW / charW));
  }

  formatValue(value, path, indent, depth, keyLen) {
    if (depth === undefined) depth = 0;
    if (depth > 200) {
      return '<span class="json-null">[嵌套过深]</span>';
    }
    if (value === null) return `<span class="json-null">null</span>`;
    if (typeof value === 'boolean') return `<span class="json-boolean">${value}</span>`;
    if (typeof value === 'number') return `<span class="json-number">${value}</span>`;
    if (typeof value === 'string') return this.formatString(value, path, indent, keyLen);
    if (Array.isArray(value)) return this.formatArray(value, path, indent, depth);
    if (typeof value === 'object') return this.formatObject(value, path, indent, depth);
    return String(value);
  }

  _wrapStringLines(escaped, indent, keyLen, tailReserve) {
    const padStr = '  '.repeat(indent) + '  ';
    const padLen = padStr.length;
    const totalChars = this._charsPerLine || 80;
    const usedByKey = indent * 2 + (keyLen || 0);
    const tail = tailReserve || 0;
    const firstLineMax = totalChars - usedByKey;

    if (escaped.length + 2 + tail <= firstLineMax) {
      return `<span class="json-string">"${escaped}"</span>`;
    }

    const restLineMax = totalChars - padLen;
    const parts = [];
    let pos = 0;
    const firstLen = Math.max(20, firstLineMax - 1);
    parts.push(escaped.substring(0, firstLen));
    pos = firstLen;
    const restLen = Math.max(20, restLineMax);
    while (pos < escaped.length) {
      const isLast = pos + restLen >= escaped.length;
      const len = isLast ? Math.max(20, restLen - tail) : restLen;
      parts.push(escaped.substring(pos, pos + len));
      pos += len;
    }

    return parts
      .map((part, i) => {
        const prefix = i === 0 ? '"' : '';
        const suffix = i === parts.length - 1 ? '"' : '';
        const span = `<span class="json-string">${prefix}${part}${suffix}</span>`;
        return i === 0 ? span : `\n${padStr}${span}`;
      })
      .join('');
  }

  formatString(value, path, indent, keyLen) {
    const escaped = this.escapeString(value);
    if (escaped.length > 500) {
      const id = `str-${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const short = escaped.substring(0, 200);
      const BTN_CHARS = 10;
      const shortWithHint = `${short}…(${escaped.length} chars)`;
      this._stringStore.set(id, {
        shortHtml: this._wrapStringLines(shortWithHint, indent, keyLen, BTN_CHARS),
        full: escaped,
        raw: value,
        indent,
        keyLen,
      });
      return (
        `<span class="json-string-wrap" id="${id}">` +
        this._wrapStringLines(shortWithHint, indent, keyLen, BTN_CHARS) +
        `</span>` +
        `<button class="str-expand-btn" data-str-id="${id}">展开</button>` +
        `<button class="str-copy-btn" data-str-id="${id}">复制</button>`
      );
    }
    return this._wrapStringLines(escaped, indent, keyLen);
  }

  formatArray(arr, path, indent, depth) {
    if (depth === undefined) depth = 0;
    if (arr.length === 0) return `<span class="json-bracket">[]</span>`;

    const id = `fold-${this.lineCount++}`;
    const indentStr = '  '.repeat(indent);
    const childIndent = '  '.repeat(indent + 1);

    let items = arr
      .map((item, i) => {
        const childPath = `${path}[${i}]`;
        const val = this.formatValue(item, childPath, indent + 1, depth + 1);
        const comma = i < arr.length - 1 ? ',' : '';
        return `${childIndent}${val}${comma}`;
      })
      .join('\n');

    return (
      `<span class="json-fold" data-fold="${id}">` +
      `<span class="json-fold-icon">▾</span>` +
      `<span class="json-bracket">[</span></span>` +
      `<span class="json-fold-content" id="${id}">\n${items}\n${indentStr}</span>` +
      `<span class="json-bracket">]</span>` +
      `<span class="json-collapsed-hint json-collapsed-content" id="${id}-hint"> [${arr.length} items]</span>`
    );
  }

  formatObject(obj, path, indent, depth) {
    if (depth === undefined) depth = 0;
    const keys = Object.keys(obj);
    if (keys.length === 0) return `<span class="json-bracket">{}</span>`;

    const id = `fold-${this.lineCount++}`;
    const indentStr = '  '.repeat(indent);
    const childIndent = '  '.repeat(indent + 1);

    let items = keys
      .map((key, i) => {
        const childPath = `${path}.${key}`;
        const kl = key.length + 4;
        const val = this.formatValue(obj[key], childPath, indent + 1, depth + 1, kl);
        const comma = i < keys.length - 1 ? ',' : '';
        return `${childIndent}<span class="json-key">"${this.escapeString(key)}"</span>: ${val}${comma}`;
      })
      .join('\n');

    return (
      `<span class="json-fold" data-fold="${id}">` +
      `<span class="json-fold-icon">▾</span>` +
      `<span class="json-bracket">{</span></span>` +
      `<span class="json-fold-content" id="${id}">\n${items}\n${indentStr}</span>` +
      `<span class="json-bracket">}</span>` +
      `<span class="json-collapsed-hint json-collapsed-content" id="${id}-hint"> {${keys.length} keys}</span>`
    );
  }

  bindFoldEvents(container) {
    // Remove previous handler if any
    if (container._jsonClickHandler) {
      container.removeEventListener('click', container._jsonClickHandler);
    }

    const handler = (e) => {
      // String copy
      const copyBtn = e.target.closest('.str-copy-btn');
      if (copyBtn) {
        const id = copyBtn.dataset.strId;
        const stored = this._stringStore.get(id);
        if (stored) {
          navigator.clipboard.writeText(stored.raw).then(() => {
            copyBtn.textContent = '已复制';
            setTimeout(() => { copyBtn.textContent = '复制'; }, 1500);
          });
        }
        return;
      }

      // String expand/collapse toggle
      const expandBtn = e.target.closest('.str-expand-btn');
      if (expandBtn) {
        const id = expandBtn.dataset.strId;
        const stored = this._stringStore.get(id);
        if (stored) {
          const wrap = container.querySelector(`#${id}`);
          if (wrap) {
            if (expandBtn.dataset.expanded === '1') {
              wrap.innerHTML = stored.shortHtml;
              expandBtn.textContent = '展开';
              expandBtn.dataset.expanded = '0';
            } else {
              wrap.innerHTML = this._wrapStringLines(stored.full, stored.indent, stored.keyLen, 10);
              expandBtn.textContent = '收起';
              expandBtn.dataset.expanded = '1';
              requestAnimationFrame(() => wrap.scrollIntoView({ block: 'start', behavior: 'smooth' }));
            }
          }
        }
        return;
      }

      // Fold toggle
      const fold = e.target.closest('.json-fold');
      if (fold) {
        const foldId = fold.dataset.fold;
        const content = container.querySelector(`#${foldId}`);
        const hint = container.querySelector(`#${foldId}-hint`);
        const icon = fold.querySelector('.json-fold-icon');

        if (content.style.display === 'none') {
          content.style.display = 'inline';
          if (hint) hint.style.display = 'none';
          icon.classList.remove('collapsed');
        } else {
          content.style.display = 'none';
          if (hint) hint.style.display = 'inline';
          icon.classList.add('collapsed');
        }
      }
    };

    container._jsonClickHandler = handler;
    container.addEventListener('click', handler);
  }

  escapeString(str) {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
