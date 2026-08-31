type Params = { onClose: () => void; enabled?: boolean; threshold?: number };

export function swipeSheet(node: HTMLElement, params: Params) {
  let enabled = params.enabled ?? true;
  let onClose = params.onClose;
  let threshold = params.threshold ?? 80;

  let startY = 0;
  let currentY = 0;
  let dragging = false;
  let pointerId: number | null = null;
  let history: { y: number; t: number }[] = [];
  let dragHandle: HTMLElement | null = null;

  function isMobile() {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
  }

  function findScrollEl(): HTMLElement | null {
    return node.querySelector('[class*="overflow-y-auto"], form') as HTMLElement | null;
  }
  function onPointerDown(e: PointerEvent) {
    if (!enabled || !isMobile()) return;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const isHandle = !!target.closest('[data-sheet-handle]');
    if (!isHandle) {
      const scrollEl = findScrollEl();
      if (scrollEl && scrollEl.scrollTop > 0) return;
    }
    if (target.closest('input, textarea, select, button, [role="combobox"], [data-button-root]')) {
      if (!isHandle) return;
    }
    dragging = true;
    pointerId = e.pointerId;
    startY = e.clientY;
    currentY = startY;
    history = [{ y: startY, t: performance.now() }];
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    node.style.willChange = 'transform';
    node.style.transition = 'none';
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging || e.pointerId !== pointerId) return;
    currentY = e.clientY;
    const delta = currentY - startY;
    history.push({ y: currentY, t: performance.now() });
    if (history.length > 6) history.shift();
    if (delta < 0) {
      // rubber-band向上拖动阻尼
      const r = (delta * 0.15);
      node.style.transform = `translateY(${r}px)`;
      return;
    }
    // follow finger 1:1
    node.style.transform = `translateY(${delta}px)`;
    // fade overlay proportionally
    const overlay = document.querySelector('.admin-new-overlay, .route-sheet-overlay') as HTMLElement | null;
    if (overlay) overlay.style.opacity = String(Math.max(0, 1 - delta / 300));
    if (delta > 10) e.preventDefault();
  }

  function velocity(): number {
    if (history.length < 2) return 0;
    const first = history[0];
    const last = history[history.length - 1];
    const dt = (last.t - first.t) / 1000;
    if (dt === 0) return 0;
    return (last.y - first.y) / dt; // px/s
  }

  function onPointerUp(e: PointerEvent) {
    if (!dragging || e.pointerId !== pointerId) return;
    dragging = false;
    if (pointerId !== null) {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(pointerId); } catch {}
    }
    pointerId = null;
    const delta = currentY - startY;
    const v = velocity();
    history = [];
    const overlay = document.querySelector('.admin-new-overlay, .route-sheet-overlay') as HTMLElement | null;
    if (overlay) overlay.style.opacity = '';

    // Decide: close if dragged far enough or flung down fast
    const shouldClose = delta > threshold || (delta > 20 && v > 600);
    if (shouldClose) {
      // project a bit with velocity for fluid feel
      const extra = Math.min(40, Math.max(0, v * 0.08));
      node.style.transition = 'transform 340ms cubic-bezier(0.32,0.72,0,1)';
      node.style.transform = `translateY(calc(100% + ${extra}px))`;
      if (overlay) {
        overlay.style.transition = 'opacity 200ms ease';
        overlay.style.opacity = '0';
      }
      setTimeout(() => {
        node.style.transition = '';
        node.style.transform = '';
        node.style.willChange = '';
        if (overlay) { overlay.style.transition = ''; overlay.style.opacity = ''; }
        onClose();
      }, 300);
    } else {
      // snap back with critically damped spring feel
      node.style.transition = 'transform 360ms cubic-bezier(0.32,0.72,0,1)';
      node.style.transform = 'translateY(0)';
      setTimeout(() => {
        node.style.transition = '';
        node.style.transform = '';
        node.style.willChange = '';
      }, 360);
    }
  }

  function onPointerCancel(e: PointerEvent) { onPointerUp(e); }

  // attach to handle if present, otherwise whole node
  dragHandle = node.querySelector('[data-sheet-handle]') as HTMLElement | null;
  const target: HTMLElement = dragHandle ?? node;
  target.addEventListener('pointerdown', onPointerDown, { passive: false } as any);
  target.addEventListener('pointermove', onPointerMove, { passive: false } as any);
  target.addEventListener('pointerup', onPointerUp);
  target.addEventListener('pointercancel', onPointerCancel);
  // ensure handle shows grab cursor
  if (dragHandle) dragHandle.style.touchAction = 'none';
  else node.style.touchAction = 'pan-y';

  return {
    update(newParams: Params) {
      enabled = newParams.enabled ?? true;
      onClose = newParams.onClose;
      threshold = newParams.threshold ?? 80;
    },
    destroy() {
      target.removeEventListener('pointerdown', onPointerDown as any);
      target.removeEventListener('pointermove', onPointerMove as any);
      target.removeEventListener('pointerup', onPointerUp as any);
      target.removeEventListener('pointercancel', onPointerCancel as any);
    }
  };
}
