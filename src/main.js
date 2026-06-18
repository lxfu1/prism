import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { JsonFormatter } from './components/json-formatter.js';
import { ChatView } from './components/chat-view.js';
import { MarkdownPreview } from './components/markdown-preview.js';
import { Playground } from './components/playground.js';
import {
  initSidebar,
  renderEntryList,
  renderVisibleRange,
  scrollToEntry,
  getFilteredEntries,
} from './components/sidebar.js';
import {
  state,
  normalizeEntry,
  resetRenderedTabs,
  markTabRendered,
  isTabRendered,
} from './utils/state.js';
import { initResizers } from './utils/resizer.js';
import { initTheme } from './utils/theme.js';
import { saveMapping, DEFAULT_MAPPING } from './utils/settings.js';
import { getHistory, addToHistory } from './utils/history.js';
import { bus } from './utils/event-bus.js';
import { escapeHtml } from './utils/escape-html.js';

const jsonFormatter = new JsonFormatter();
const chatView = new ChatView();
const markdownPreview = new MarkdownPreview();
const playground = new Playground();
let playgroundActive = false;

// ── File opening ────────────────────────────────────────

async function openFile(path) {
  if (!path) {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'JSONL', extensions: ['jsonl', 'json', 'ndjson'] }],
    });
    if (!selected) return;
    path = selected;
  }

  try {
    if (typeof path === 'object' && path !== null) {
      path = path.path || path;
    }

    state.filePath = path;
    state.entries = await invoke('load_jsonl', { path, mapping: state.mapping });
    state._indexMap = new Map();
    state.entries.forEach((e, i) => state._indexMap.set(e, i));
    state.currentIndex = -1;
    state.currentEntry = null;

    document.getElementById('welcome-screen').classList.add('hidden');
    document.getElementById('file-name').textContent = path.split('/').pop();
    document.getElementById('file-name-wrap').classList.remove('hidden');
    document.getElementById('entry-count').textContent = `${state.entries.length} 条记录`;

    addToHistory(path);
    renderEntryList();
    updateStatusBar();

    if (state.entries.length > 0) {
      selectEntry(0);
    } else {
      const viewJson = document.getElementById('view-json');
      viewJson.innerHTML =
        '<div style="color:var(--text-muted);padding:40px;text-align:center;font-size:13px;">该文件没有有效条目<br><span style="font-size:11px;color:var(--text-secondary);">文件可能为空或所有行均无法解析</span></div>';
      markTabRendered('json');
    }

    bus.emit('file-opened', { entries: state.entries, filePath: state.filePath });
  } catch (err) {
    console.error('Failed to load file:', err);
    alert(`加载文件失败: ${err}`);
  }
}

// ── Entry selection ─────────────────────────────────────

let _requestId = 0;

async function selectEntry(index) {
  if (index < 0 || index >= state.entries.length) return;

  const reqId = ++_requestId;

  document.querySelectorAll('.entry-item').forEach((el) => {
    el.classList.toggle('active', parseInt(el.dataset.index) === index);
  });

  state.currentIndex = index;
  const entry = state.entries[index];

  const activeTab = document.querySelector('#center-panel .tab-btn.active')?.dataset?.tab;
  if (activeTab) {
    const viewEl = document.getElementById(`view-${activeTab}`);
    if (viewEl && !viewEl.querySelector('.loading-indicator')) {
      const loader = document.createElement('div');
      loader.className = 'loading-indicator';
      loader.textContent = '加载中...';
      viewEl.prepend(loader);
    }
  }

  try {
    const rawJson = await invoke('get_entry', {
      path: state.filePath,
      offset: entry.byte_offset,
      length: entry.byte_length,
    });
    if (reqId !== _requestId) return;

    state.currentEntry = normalizeEntry(JSON.parse(rawJson));
    resetRenderedTabs();

    renderActiveView();
    renderActivePreview();
    updateStatusBar();

    scrollToEntry(index);
    const container = document.getElementById('entry-list');
    renderVisibleRange(container);

    bus.emit('entry-changed', {
      currentEntry: state.currentEntry,
      currentIndex: state.currentIndex,
      totalEntries: state.entries.length,
    });
  } catch (err) {
    console.error(
      'Failed to load entry:',
      err,
      'offset:',
      entry.byte_offset,
      'length:',
      entry.byte_length,
    );
    const viewEl = activeTab && document.getElementById(`view-${activeTab}`);
    if (viewEl) {
      viewEl.innerHTML = `<div style="padding:20px;color:#ef4444;font-size:13px;">
        <div style="font-weight:600;margin-bottom:4px;">加载条目失败</div>
        <div style="font-size:12px;color:#fca5a5;">${escapeHtml(String(err))}</div>
      </div>`;
    }
  }
}

// ── Rendering ───────────────────────────────────────────

function renderActiveView() {
  if (!state.currentEntry) return;
  const activeTab = document.querySelector('#center-panel .tab-btn.active')?.dataset?.tab;
  if (!activeTab || isTabRendered(activeTab)) return;

  switch (activeTab) {
    case 'json':
      jsonFormatter.render(state.currentEntry, document.getElementById('view-json'));
      break;
    case 'chat':
      chatView.render(state.currentEntry, document.getElementById('view-chat'));
      break;
    case 'raw': {
      const pre = document.createElement('pre');
      pre.className = 'raw-content';
      pre.textContent = JSON.stringify(state.currentEntry, null, 2);
      document.getElementById('view-raw').replaceChildren(pre);
      break;
    }
  }
  markTabRendered(activeTab);
}

function renderActivePreview() {
  if (!state.currentEntry) return;
  const activeTab = document.querySelector('#preview-panel .tab-btn.active')?.dataset?.tab;
  if (!activeTab) return;

  const renderedView = document.getElementById('view-rendered');
  const wasFullscreen = renderedView.querySelector('.html-block-container.fullscreen') !== null;

  const previewKey = `preview-${activeTab}`;

  if (activeTab === 'source') {
    if (!isTabRendered(previewKey)) {
      markdownPreview.showSource(state.currentEntry, document.getElementById('view-source'));
      markTabRendered(previewKey);
    }
  } else {
    if (!isTabRendered(previewKey) || wasFullscreen) {
      markdownPreview.render(state.currentEntry, renderedView);
      markTabRendered(previewKey);
    }
  }

  if (wasFullscreen) {
    const firstBlock = renderedView.querySelector('.html-block-container');
    if (firstBlock) {
      firstBlock.classList.add('fullscreen');
      const btn = firstBlock.querySelector('[data-action="fullscreen"]');
      if (btn) btn.textContent = '退出全屏';
    }
  }
}

// ── Status bar ──────────────────────────────────────────

function updateStatusBar() {
  const entry = state.entries[state.currentIndex];
  if (entry) {
    document.getElementById('status-entry').textContent =
      `条目 ${state.currentIndex + 1}/${state.entries.length}`;
    document.getElementById('status-messages').textContent = `${entry.message_count} 消息`;
    document.getElementById('status-size').textContent = `${formatBytes(entry.byte_length)}`;
    const charCount = state.currentEntry ? JSON.stringify(state.currentEntry).length : 0;
    document.getElementById('status-chars').textContent =
      charCount > 0 ? `${formatBytes(charCount)}` : '';
  }
  updateNavButtons();
}

function updateNavButtons() {
  const total = state.entries.length;
  const cur = state.currentIndex;
  const hasEntries = total > 0;
  document.getElementById('btn-prev').disabled = !hasEntries || cur <= 0;
  document.getElementById('btn-next').disabled = !hasEntries || cur >= total - 1;
  document.getElementById('entry-nav-pos').textContent = hasEntries
    ? `${cur + 1} / ${total}`
    : '- / -';
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ── Tabs ────────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll('.panel-tabs').forEach((tabBar) => {
    tabBar.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        tabBar.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        if (tabBar.closest('#center-panel')) {
          document
            .querySelectorAll('#tab-content .view')
            .forEach((v) => v.classList.remove('active'));
          const target = document.getElementById(`view-${tab}`);
          if (target) {
            target.classList.add('active');
            renderActiveView();
          }
        }

        if (tabBar.closest('#preview-panel')) {
          document
            .querySelectorAll('#preview-panel .view')
            .forEach((v) => v.classList.remove('active'));
          const target = document.getElementById(`view-${tab}`);
          if (target) {
            target.classList.add('active');
            renderActivePreview();
          }
        }
      });
    });
  });
}

// ── Search ──────────────────────────────────────────────

function initSearch() {
  const input = document.getElementById('search-input');
  let debounceTimer;

  const deepDropdown = document.createElement('div');
  deepDropdown.id = 'deep-search-results';
  deepDropdown.className = 'deep-search-dropdown hidden';
  const searchBox = input.closest('.search-box');
  searchBox.style.position = 'relative';
  searchBox.appendChild(deepDropdown);

  document.addEventListener('click', (e) => {
    if (!deepDropdown.contains(e.target) && e.target !== input) {
      deepDropdown.classList.add('hidden');
    }
  });

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const query = input.value.trim().toLowerCase();
      renderEntryList(query || null);

      if (
        query &&
        getFilteredEntries().length === 0 &&
        state.entries.length > 0 &&
        state.filePath
      ) {
        try {
          const results = await invoke('search_entries', { query });
          if (results && results.length > 0) {
            deepDropdown.innerHTML =
              `<div class="deep-search-header">深度搜索 (${results.length} 条匹配)</div>` +
              results
                .map(
                  (r, i) =>
                    `<div class="deep-search-item" data-line="${r.line_number}" data-idx="${i}">
                  <span class="deep-search-line">#${r.line_number}</span>
                  <span class="deep-search-id">${escapeHtml(r.task_id)}</span>
                  <span class="deep-search-preview">${escapeHtml(r.matched_text)}</span>
                </div>`,
                )
                .join('');
            deepDropdown.querySelectorAll('.deep-search-item').forEach((item) => {
              item.addEventListener('click', () => {
                const lineNum = parseInt(item.dataset.line);
                const idx = state.entries.findIndex((e) => e.line_number === lineNum);
                if (idx !== -1) {
                  selectEntry(idx);
                  deepDropdown.classList.add('hidden');
                }
              });
            });
            deepDropdown.classList.remove('hidden');
          } else {
            deepDropdown.innerHTML = '<div class="deep-search-header">深度搜索: 无结果</div>';
            deepDropdown.classList.remove('hidden');
            setTimeout(() => {
              if (
                deepDropdown.querySelector('.deep-search-item') === null &&
                deepDropdown.textContent?.includes('无结果')
              ) {
                deepDropdown.classList.add('hidden');
              }
            }, 2000);
          }
        } catch (err) {
          console.error('Deep search failed:', err);
        }
      } else {
        deepDropdown.classList.add('hidden');
      }
    }, 200);
  });
}

// ── Keyboard shortcuts ──────────────────────────────────

function initShortcuts() {
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
      e.preventDefault();
      openFile();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      document.getElementById('search-input').focus();
    }
    if (e.key === 'ArrowUp' && !e.metaKey && !e.ctrlKey) {
      if (document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        if (state.currentIndex > 0) selectEntry(state.currentIndex - 1);
      }
    }
    if (e.key === 'ArrowDown' && !e.metaKey && !e.ctrlKey) {
      if (document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        if (state.currentIndex < state.entries.length - 1) selectEntry(state.currentIndex + 1);
      }
    }
    if (e.key === 't' && document.activeElement.tagName !== 'INPUT') {
      document.getElementById('btn-theme').click();
    }
  });
}

// ── Drag and drop ───────────────────────────────────────

function initDragDrop() {
  const overlay = document.createElement('div');
  overlay.className = 'drop-overlay';
  overlay.textContent = '释放以打开文件';
  document.body.appendChild(overlay);

  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    overlay.classList.add('visible');
  });
  document.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null) overlay.classList.remove('visible');
  });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    overlay.classList.remove('visible');
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.jsonl') || file.name.endsWith('.ndjson')) {
        openFile(file.path);
      }
    }
  });
}

// ── Settings ────────────────────────────────────────────

function initSettings() {
  const modal = document.getElementById('settings-modal');
  const btnSettings = document.getElementById('btn-settings');
  const btnSave = document.getElementById('btn-save-settings');
  const btnCancel = document.getElementById('btn-cancel-settings');
  const formatRadios = document.querySelectorAll('input[name="format"]');
  const chatFields = document.querySelectorAll('.field-chat');
  const promptFields = document.querySelectorAll('.field-prompt');

  function showFields(format) {
    chatFields.forEach((el) => el.classList.toggle('hidden', format !== 'chat'));
    promptFields.forEach((el) => el.classList.toggle('hidden', format !== 'prompt'));
  }

  formatRadios.forEach((radio) => {
    radio.addEventListener('change', () => showFields(radio.value));
  });

  btnSettings.addEventListener('click', () => {
    const m = state.mapping;
    document.querySelector(`input[name="format"][value="${m.format}"]`).checked = true;
    document.getElementById('set-task-id').value = m.task_id_field;
    document.getElementById('set-messages').value = m.messages_field;
    document.getElementById('set-prompt').value = m.prompt_field;
    document.getElementById('set-result').value = m.result_field;
    showFields(m.format);
    modal.classList.remove('hidden');
  });

  function restoreAndClose() {
    if (_settingsSnapshot) {
      document.querySelector(`input[name="format"][value="${_settingsSnapshot.format}"]`).checked = true;
      document.getElementById('set-task-id').value = _settingsSnapshot.task_id_field;
      document.getElementById('set-messages').value = _settingsSnapshot.messages_field;
      document.getElementById('set-prompt').value = _settingsSnapshot.prompt_field;
      document.getElementById('set-result').value = _settingsSnapshot.result_field;
      showFields(_settingsSnapshot.format);
    }
    modal.classList.add('hidden');
  }

  btnCancel.addEventListener('click', restoreAndClose);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) restoreAndClose();
  });

  btnSave.addEventListener('click', () => {
    const format = document.querySelector('input[name="format"]:checked').value;
    const mapping = {
      format,
      task_id_field:
        document.getElementById('set-task-id').value.trim() || DEFAULT_MAPPING.task_id_field,
      messages_field:
        document.getElementById('set-messages').value.trim() || DEFAULT_MAPPING.messages_field,
      prompt_field:
        document.getElementById('set-prompt').value.trim() || DEFAULT_MAPPING.prompt_field,
      result_field:
        document.getElementById('set-result').value.trim() || DEFAULT_MAPPING.result_field,
    };
    state.mapping = mapping;
    saveMapping(mapping);
    modal.classList.add('hidden');
  });

  let _settingsSnapshot = null;
  btnSettings.addEventListener('click', () => {
    _settingsSnapshot = {
      format: state.mapping.format,
      task_id_field: state.mapping.task_id_field,
      messages_field: state.mapping.messages_field,
      prompt_field: state.mapping.prompt_field,
      result_field: state.mapping.result_field,
    };
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      restoreAndClose();
    }
  });
}

// ── Recent files ────────────────────────────────────────

function renderRecentFiles() {
  const container = document.getElementById('recent-files');
  const list = document.getElementById('recent-files-list');
  const history = getHistory();

  if (history.length === 0) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  list.innerHTML = history
    .map(
      (entry) => `
    <div class="recent-file-item" data-path="${escapeHtml(entry.path)}">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M2 3h5l1.5 1.5H14v9.5H2V3z" stroke="currentColor" stroke-width="1.2" fill="none"/>
      </svg>
      <div class="recent-file-info">
        <div class="recent-file-name">${escapeHtml(entry.name)}</div>
        <div class="recent-file-path">${escapeHtml(entry.path)}</div>
      </div>
    </div>`,
    )
    .join('');

  list.querySelectorAll('.recent-file-item').forEach((el) => {
    el.addEventListener('click', () => openFile(el.dataset.path));
  });
}

function initRecentDropdown() {
  const dropdown = document.getElementById('recent-dropdown');
  const btn = document.getElementById('btn-recent');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const history = getHistory();
    if (history.length === 0) return;

    const currentPath = state.filePath;
    dropdown.innerHTML = history
      .map(
        (entry) =>
          `<div class="recent-dropdown-item${entry.path === currentPath ? ' current' : ''}" data-path="${escapeHtml(entry.path)}">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 3h5l1.5 1.5H14v9.5H2V3z" stroke="currentColor" stroke-width="1.2" fill="none"/>
            </svg>
            <div class="recent-file-info">
              <div class="recent-file-name">${escapeHtml(entry.name)}</div>
              <div class="recent-file-path">${escapeHtml(entry.path)}</div>
            </div>
          </div>`,
      )
      .join('');

    dropdown.querySelectorAll('.recent-dropdown-item').forEach((el) => {
      el.addEventListener('click', () => {
        const p = el.dataset.path;
        if (p && p !== state.filePath) openFile(p);
        dropdown.classList.add('hidden');
      });
    });

    dropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', () => dropdown.classList.add('hidden'));
}

// ── Playground ──────────────────────────────────────────

function initPlayground() {
  const btn = document.getElementById('btn-playground');
  const panel = document.getElementById('playground-panel');
  const mainContent = document.getElementById('main-content');

  btn.addEventListener('click', () => {
    playgroundActive = !playgroundActive;
    if (playgroundActive) {
      btn.classList.add('active');
      mainContent.classList.add('hidden');
      panel.classList.remove('hidden');
      // Defer render until after the browser has recalculated layout
      // (panel was display:none, needs a frame to get correct dimensions)
      requestAnimationFrame(() => playground.render(panel));
    } else {
      btn.classList.remove('active');
      playground.destroy();
      panel.classList.add('hidden');
      mainContent.classList.remove('hidden');
    }
  });
}

// ── Init ────────────────────────────────────────────────

function init() {
  initTabs();
  initSearch();
  initShortcuts();
  initResizers();
  initTheme();
  initSettings();
  initDragDrop();
  initPlayground();
  initSidebar(selectEntry);

  renderRecentFiles();
  initRecentDropdown();

  document.getElementById('btn-open').addEventListener('click', () => openFile());
  document.getElementById('btn-welcome-open').addEventListener('click', () => openFile());
  document.getElementById('btn-prev').addEventListener('click', () => {
    if (state.currentIndex > 0) selectEntry(state.currentIndex - 1);
  });
  document.getElementById('btn-next').addEventListener('click', () => {
    if (state.currentIndex < state.entries.length - 1) selectEntry(state.currentIndex + 1);
  });
}

bus.on('navigate', ({ index }) => selectEntry(index));

document.addEventListener('DOMContentLoaded', init);
