const div = document.createElement('div');

export function escapeHtml(str) {
  div.textContent = str;
  return div.innerHTML;
}
