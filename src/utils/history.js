const STORAGE_KEY = 'fileHistory';
const MAX_ENTRIES = 10;

export function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

export function addToHistory(filePath) {
  const history = getHistory();
  const name = filePath.split('/').pop() || filePath;
  // Remove existing entry for same path
  const filtered = history.filter((e) => e.path !== filePath);
  // Add to front
  filtered.unshift({ path: filePath, name });
  // Trim to max
  if (filtered.length > MAX_ENTRIES) filtered.length = MAX_ENTRIES;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    /* quota exceeded or private browsing */
  }
}

export function removeFromHistory(filePath) {
  const history = getHistory().filter((e) => e.path !== filePath);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    /* quota exceeded or private browsing */
  }
}
