// Lets readers drag the left navigation's edge to resize it (desktop widths only).
// The chosen width is kept in localStorage; the inline script in astro.config.mjs restores it before first paint.
// Double-click the handle, or press Escape while it has focus, to go back to the default width.
(() => {
  const KEY = 'sl-sidebar-width';
  const VAR = '--user-sidebar-width';
  const root = document.documentElement;
  const nav = document.querySelector('nav.sidebar');
  const pane = document.querySelector('.sidebar-pane');
  if (!nav || !pane) return;

  const rem = () => parseFloat(getComputedStyle(root).fontSize) || 16;
  // Keep in step with the clamp() on --sl-sidebar-width in custom.css.
  const bounds = () => ({ min: 15 * rem(), max: Math.min(36 * rem(), innerWidth * 0.45) });
  const width = () => pane.getBoundingClientRect().width;

  const handle = document.createElement('div');
  handle.className = 'sidebar-resizer';
  handle.tabIndex = 0;
  handle.title = 'Drag to resize. Double-click to reset.';
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-controls', 'starlight__sidebar');
  handle.setAttribute('aria-label', 'Resize navigation');

  const describe = () => {
    const { min, max } = bounds();
    handle.setAttribute('aria-valuemin', String(Math.round(min)));
    handle.setAttribute('aria-valuemax', String(Math.round(max)));
    handle.setAttribute('aria-valuenow', String(Math.round(width())));
  };
  const save = (px) => {
    try {
      if (px == null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, String(px));
    } catch {}
  };
  const set = (px) => {
    const { min, max } = bounds();
    const w = Math.round(Math.min(max, Math.max(min, px)));
    root.style.setProperty(VAR, `${w}px`);
    describe();
    return w;
  };
  const reset = () => {
    root.style.removeProperty(VAR);
    save(null);
    describe();
  };

  let startX = 0;
  let startW = 0;
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    startX = e.clientX;
    startW = width();
    handle.setPointerCapture(e.pointerId);
    root.classList.add('is-resizing-sidebar');
  });
  handle.addEventListener('pointermove', (e) => {
    if (handle.hasPointerCapture(e.pointerId)) set(startW + e.clientX - startX);
  });
  const end = (e) => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    handle.releasePointerCapture(e.pointerId);
    root.classList.remove('is-resizing-sidebar');
    if (root.style.getPropertyValue(VAR)) save(Math.round(width()));
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  handle.addEventListener('dblclick', reset);
  handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 64 : 16;
    const { min, max } = bounds();
    const next = { ArrowLeft: width() - step, ArrowRight: width() + step, Home: min, End: max }[e.key];
    if (e.key === 'Escape') reset();
    else if (next !== undefined) save(set(next));
    else return;
    e.preventDefault();
  });
  addEventListener('resize', describe);

  describe();
  nav.append(handle);
})();
