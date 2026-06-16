export function initResizers() {
  const mainContent = document.getElementById('main-content');
  const sidebar = document.getElementById('sidebar');
  const centerPanel = document.getElementById('center-panel');
  const previewPanel = document.getElementById('preview-panel');

  if (!mainContent || !sidebar || !centerPanel || !previewPanel) return;

  let sidebarRatio = null;
  let previewRatio = null;

  function applyRatios() {
    if (sidebarRatio === null && previewRatio === null) return;

    const total = mainContent.getBoundingClientRect().width;

    if (sidebarRatio !== null) {
      sidebar.style.width = Math.max(180, total * sidebarRatio) + 'px';
    }

    if (previewRatio !== null) {
      previewPanel.style.width = Math.max(280, total * previewRatio) + 'px';
    }

    // Let center panel fill the remaining space
    centerPanel.style.flex = '';
    centerPanel.style.width = '';
  }

  window.addEventListener('resize', applyRatios);

  setupResizer('resizer-left', 'sidebar', 'center-panel', 'left');
  setupResizer('resizer-right', 'center-panel', 'preview-panel', 'right');

  function setupResizer(resizerId, leftId, rightId, side) {
    const resizer = document.getElementById(resizerId);
    const leftPanel = document.getElementById(leftId);
    const rightPanel = document.getElementById(rightId);
    if (!resizer || !leftPanel || !rightPanel) return;

    let startX, startLeftWidth, startRightWidth;

    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startLeftWidth = leftPanel.getBoundingClientRect().width;
      startRightWidth = rightPanel.getBoundingClientRect().width;
      resizer.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    resizer.addEventListener('dblclick', () => {
      leftPanel.style.width = '';
      rightPanel.style.width = '';
      rightPanel.style.flex = '';
      if (side === 'left') {
        sidebarRatio = null;
      } else {
        previewRatio = null;
      }
      applyRatios();
    });

    function onMouseMove(e) {
      const dx = e.clientX - startX;
      const minWidth = 180;

      if (side === 'left') {
        const newLeft = Math.max(minWidth, startLeftWidth + dx);
        leftPanel.style.width = newLeft + 'px';
      } else {
        const newLeft = Math.max(300, startLeftWidth + dx);
        const newRight = Math.max(280, startRightWidth - dx);
        leftPanel.style.flex = `0 0 ${newLeft}px`;
        rightPanel.style.width = newRight + 'px';
      }
    }

    function onMouseUp() {
      // Store the panel width ratio for window resize
      const total = mainContent.getBoundingClientRect().width;
      if (side === 'left') {
        sidebarRatio = leftPanel.getBoundingClientRect().width / total;
      } else {
        previewRatio = rightPanel.getBoundingClientRect().width / total;
      }

      resizer.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
  }
}
