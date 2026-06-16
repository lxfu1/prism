export class JsonFormatter {
  constructor() {
    this.lineCount = 0;
    this._stringStore = new Map();
  }

  render(data, container) {
    this.lineCount = 0;
    this._stringStore.clear();
    const html = this.formatValue(data, '', 0);
    container.innerHTML = `<div class="json-tree">${html}</div>`;
    this.bindFoldEvents(container);
  }

  formatValue(value, path, indent, depth) {
    if (depth === undefined) depth = 0;
    if (depth > 200) {
      return '<span class="json-null">[嵌套过深]</span>';
    }
    if (value === null) return `<span class="json-null">null</span>`;
    if (typeof value === 'boolean') return `<span class="json-boolean">${value}</span>`;
    if (typeof value === 'number') return `<span class="json-number">${value}</span>`;
    if (typeof value === 'string') return this.formatString(value, path, indent);
    if (Array.isArray(value)) return this.formatArray(value, path, indent, depth);
    if (typeof value === 'object') return this.formatObject(value, path, indent, depth);
    return String(value);
  }

  formatString(value, path, _indent) {
    const escaped = this.escapeString(value);
    if (escaped.length > 500) {
      const id = `str-${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const short = escaped.substring(0, 200);
      this._stringStore.set(id, {
        short: `"${short}`,
        full: `"${escaped}"`,
        hint: `…(${escaped.length} chars)`,
      });
      return `<span class="json-string" id="${id}">"${short}<span class="json-collapsed-hint">…(${escaped.length} chars)</span>"</span><button class="str-expand-btn" data-str-id="${id}">展开</button>`;
    }
    return `<span class="json-string">"${escaped}"</span>`;
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
      `<span class="json-fold" data-fold="${id}"><span class="json-fold-icon">▾</span><span class="json-bracket">[</span></span>` +
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
        const val = this.formatValue(obj[key], childPath, indent + 1, depth + 1);
        const comma = i < keys.length - 1 ? ',' : '';
        return `${childIndent}<span class="json-key">"${this.escapeString(key)}"</span>: ${val}${comma}`;
      })
      .join('\n');

    return (
      `<span class="json-fold" data-fold="${id}"><span class="json-fold-icon">▾</span><span class="json-bracket">{</span></span>` +
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
      // String expand/collapse toggle
      const expandBtn = e.target.closest('.str-expand-btn');
      if (expandBtn) {
        const id = expandBtn.dataset.strId;
        const stored = this._stringStore.get(id);
        if (stored) {
          const span = container.querySelector(`#${id}`);
          if (span) {
            if (expandBtn.dataset.expanded === '1') {
              // Collapse
              span.replaceChildren();
              span.appendChild(document.createTextNode(stored.short));
              const hint = document.createElement('span');
              hint.className = 'json-collapsed-hint';
              hint.textContent = stored.hint;
              span.appendChild(hint);
              span.appendChild(document.createTextNode('"'));
              expandBtn.textContent = '展开';
              expandBtn.dataset.expanded = '0';
            } else {
              // Expand
              span.textContent = stored.full;
              expandBtn.textContent = '收起';
              expandBtn.dataset.expanded = '1';
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
