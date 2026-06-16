import { state } from '../utils/state.js';

const ITEM_HEIGHT = 72;
const BUFFER_COUNT = 6;

let filteredEntries = [];
let currentFilter = null;
let onSelectEntry = null;

let pool = [];
let sentinel = null;
let poolContainer = null;

function createItemNode() {
  const el = document.createElement('div');
  el.className = 'entry-item';
  el.style.cssText = 'position:absolute;left:0;right:0;width:100%';

  const line = document.createElement('div');
  line.className = 'entry-line';

  const mid = document.createElement('div');
  mid.className = 'entry-mid';

  const preview = document.createElement('div');
  preview.className = 'entry-preview';

  const meta = document.createElement('div');
  meta.className = 'entry-meta';
  const badge = document.createElement('span');
  badge.className = 'entry-badge';
  meta.appendChild(badge);

  el.appendChild(line);
  el.appendChild(mid);
  el.appendChild(preview);
  el.appendChild(meta);

  return { el, line, mid, preview, badge };
}

function updateItemNode(node, entry, realIdx, top) {
  node.el.style.top = top + 'px';
  node.el.dataset.index = realIdx;
  node.el.classList.toggle('active', realIdx === state.currentIndex);
  node.line.textContent = '#' + entry.line_number;
  const taskId = entry.task_id || '(no task_id)';
  node.mid.textContent = taskId;
  node.mid.title = taskId;
  node.preview.textContent = entry.preview || '';
  node.badge.textContent = entry.message_count + ' msgs';
}

export function initSidebar(selectEntryFn) {
  onSelectEntry = selectEntryFn;
  const container = document.getElementById('entry-list');

  sentinel = document.createElement('div');
  sentinel.style.cssText = 'position:relative;width:100%';
  container.appendChild(sentinel);
  poolContainer = sentinel;

  container.addEventListener('click', (e) => {
    const item = e.target.closest('.entry-item');
    if (item && item.dataset.index !== undefined) {
      onSelectEntry(parseInt(item.dataset.index));
    }
  });
}

export function renderEntryList(filter) {
  currentFilter = filter;
  const container = document.getElementById('entry-list');

  filteredEntries = filter
    ? state.entries.filter(
        (e) => e.task_id.toLowerCase().includes(filter) || e.preview.toLowerCase().includes(filter),
      )
    : state.entries;

  container.scrollTop = 0;
  renderVisibleRange(container);

  if (!container._scrollBound) {
    container._scrollBound = true;
    let rafId = null;
    container.addEventListener('scroll', () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        renderVisibleRange(container);
      });
    });
  }
}

export function renderVisibleRange(container) {
  const scrollTop = container.scrollTop;
  const viewHeight = container.clientHeight;
  const totalHeight = filteredEntries.length * ITEM_HEIGHT;

  sentinel.style.height = totalHeight + 'px';

  const startIdx = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER_COUNT);
  const endIdx = Math.min(
    filteredEntries.length,
    Math.ceil((scrollTop + viewHeight) / ITEM_HEIGHT) + BUFFER_COUNT,
  );

  const needed = endIdx - startIdx;
  const indexMap = state._indexMap;

  // Grow pool if needed
  while (pool.length < needed) {
    const node = createItemNode();
    pool.push(node);
    poolContainer.appendChild(node.el);
  }

  // Update visible nodes
  for (let i = 0; i < needed; i++) {
    const listIdx = startIdx + i;
    const entry = filteredEntries[listIdx];
    const realIdx = indexMap.get(entry);
    updateItemNode(pool[i], entry, realIdx, listIdx * ITEM_HEIGHT);
    pool[i].el.style.display = '';
  }

  // Hide excess pool nodes
  for (let i = needed; i < pool.length; i++) {
    pool[i].el.style.display = 'none';
  }
}

export function scrollToEntry(index) {
  const container = document.getElementById('entry-list');
  let pos;
  if (currentFilter == null) {
    pos = index;
  } else {
    const map = state._indexMap;
    pos = filteredEntries.findIndex((e) => map.get(e) === index);
  }
  if (pos === -1) return;

  const visibleStart = Math.floor(container.scrollTop / ITEM_HEIGHT);
  const visibleEnd = Math.ceil((container.scrollTop + container.clientHeight) / ITEM_HEIGHT);

  if (pos < visibleStart || pos >= visibleEnd) {
    container.scrollTop = pos * ITEM_HEIGHT - container.clientHeight / 2 + ITEM_HEIGHT / 2;
  }
}

export function getFilteredEntries() {
  return filteredEntries;
}

export function getCurrentFilter() {
  return currentFilter;
}
