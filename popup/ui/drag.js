/**
 * Convierte un elemento en arrastrable dentro del viewport.
 * @param {HTMLElement} el            Elemento a arrastrar (se le asigna position: fixed)
 * @param {Object} [opts]
 * @param {HTMLElement} [opts.handle] Elemento que actúa como “asa” (si no se pasa, todo el elemento lo es)
 * @param {number} [opts.margin=8]    Margen interior respecto a los bordes del popup
 * @param {boolean} [opts.constrainToViewport=true] Limitar dentro del viewport
 */
export function makeDraggable(el, opts = {}) {
  if (!el) return;
  const {
    handle = el,
    margin = 8,
    constrainToViewport = true,
  } = opts;

  // Asegura posición fija superpuesta y capa superior
  const prevPosition = getComputedStyle(el).position;
  el.style.position = "fixed";
  el.style.zIndex = "9999";
  if (prevPosition === "static") {
    // Coloca donde esté actualmente
    const rect = el.getBoundingClientRect();
    el.style.top = rect.top + "px";
    el.style.left = rect.left + "px";
  } else {
    // Si ya tenía top/left, los respetamos
    if (!el.style.top) el.style.top = "16px";
    if (!el.style.left) el.style.left = "16px";
  }

  let startX = 0, startY = 0;
  let origX = 0, origY = 0;
  let dragging = false;

  const onPointerDown = (e) => {
    const isTouch = e.type === "touchstart";
    const point = isTouch ? e.touches[0] : e;
    dragging = true;
    startX = point.clientX;
    startY = point.clientY;
    origX = parseFloat(el.style.left || 0);
    origY = parseFloat(el.style.top || 0);

    // Evita selección de texto durante el drag
    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";
  };

  const onPointerMove = (e) => {
    if (!dragging) return;
    const isTouch = e.type === "touchmove";
    const point = isTouch ? e.touches[0] : e;

    let nextLeft = origX + (point.clientX - startX);
    let nextTop = origY + (point.clientY - startY);

    if (constrainToViewport) {
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      const rect = el.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      nextLeft = Math.max(margin, Math.min(nextLeft, vw - w - margin));
      nextTop = Math.max(margin, Math.min(nextTop, vh - h - margin));
    }

    el.style.left = `${nextLeft}px`;
    el.style.top = `${nextTop}px`;
  };

  const onPointerUp = () => {
    dragging = false;
    document.body.style.userSelect = "";
    document.body.style.webkitUserSelect = "";
  };

  // Listeners (mouse + touch)
  handle.addEventListener("mousedown", onPointerDown);
  window.addEventListener("mousemove", onPointerMove);
  window.addEventListener("mouseup", onPointerUp);

  handle.addEventListener("touchstart", onPointerDown, { passive: true });
  window.addEventListener("touchmove", onPointerMove, { passive: false });
  window.addEventListener("touchend", onPointerUp);

  // Devuelve función para desmontar
  return () => {
    handle.removeEventListener("mousedown", onPointerDown);
    window.removeEventListener("mousemove", onPointerMove);
    window.removeEventListener("mouseup", onPointerUp);

    handle.removeEventListener("touchstart", onPointerDown);
    window.removeEventListener("touchmove", onPointerMove);
    window.removeEventListener("touchend", onPointerUp);
  };
}
