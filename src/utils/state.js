import { getMapping } from './settings.js';

export const state = {
  filePath: null,
  entries: [],
  currentIndex: -1,
  currentEntry: null,
  mapping: getMapping(),
  _indexMap: new Map(),
  _renderedTabs: new Set(),
};

export function normalizeEntry(raw) {
  const m = state.mapping;
  if (raw[m.messages_field] && Array.isArray(raw[m.messages_field])) {
    return { ...raw, messages: raw[m.messages_field] };
  }
  if (raw[m.messages_field] === undefined) {
    const promptVal = raw[m.prompt_field];
    const resultVal = raw[m.result_field];
    if (promptVal !== undefined || resultVal !== undefined) {
      const messages = [];
      if (promptVal) {
        messages.push({ role: 'user', content: promptVal });
      }
      if (resultVal) {
        messages.push({ role: 'assistant', content: resultVal });
      }
      return { ...raw, messages };
    }
  }
  return raw;
}

export function resetRenderedTabs() {
  state._renderedTabs.clear();
}

export function markTabRendered(tab) {
  state._renderedTabs.add(tab);
}

export function isTabRendered(tab) {
  return state._renderedTabs.has(tab);
}
