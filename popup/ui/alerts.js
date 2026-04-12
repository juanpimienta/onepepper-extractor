/**
 * Tipos soportados:
 *  - error   -> .alert-error  (role="alert")
 *  - success -> .alert-success (role="status")
 *  - info    -> .alert-info    (role="status")
 *  - warning -> .alert-warning (role="alert")
 */

const TYPE_CLASS = {
  error: "alert-error",
  success: "alert-success",
  info: "alert-info",
  warning: "alert-warning",
};

const TYPE_ROLE = {
  error: "alert",
  warning: "alert",
  success: "status",
  info: "status",
};

export function ensureAlertsContainer(parent = document.querySelector("main")) {
  if (!parent) parent = document.body;
  let el = parent.querySelector("#alerts");
  if (!el) {
    el = document.createElement("div");
    el.id = "alerts";
    el.style.marginBottom = "8px";
    parent.prepend(el);
  }
  return el;
}

export function createAlertElement(type, message, { closable = true } = {}) {
  const cls = TYPE_CLASS[type] || TYPE_CLASS.info;
  const role = TYPE_ROLE[type] || "status";

  const div = document.createElement("div");
  div.className = cls;
  div.setAttribute("role", role);
  div.setAttribute("aria-live", role === "alert" ? "assertive" : "polite");

  // Contenido
  const content = document.createElement("div");
  content.className = "alert-content";
  content.innerHTML = String(message || "");

  div.appendChild(content);

  // Botón cerrar (opcional)
  if (closable) {
    const btn = document.createElement("button");
    btn.className = "alert-close";
    btn.setAttribute("type", "button");
    btn.setAttribute("aria-label", "Cerrar alerta");
    btn.textContent = "✕";
    btn.addEventListener("click", () => div.remove());
    // Cerrar con Esc cuando el botón tenga foco
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Escape") div.remove();
    });
    div.appendChild(btn);
  }

  return div;
}

/**
 * Muestra una alerta.
 * @param {HTMLElement} container
 * @param {"error"|"success"|"info"|"warning"} type
 * @param {string} message
 * @param {Object} [opts]
 * @param {boolean} [opts.replace=false]
 * @param {number}  [opts.dismissAfter=0]
 * @param {boolean} [opts.scrollIntoView=true]
 * @param {boolean} [opts.closable=true]
 */
export function showAlert(container, type, message, opts = {}) {
  const {
    replace = false,
    dismissAfter = 0,
    scrollIntoView = true,
    closable = true,
  } = opts;

  if (!container) throw new Error("Debes pasar un contenedor de alertas.");

  if (replace) clearAlerts(container);

  const el = createAlertElement(type, message, { closable });
  container.prepend(el);

  if (scrollIntoView && typeof el.scrollIntoView === "function") {
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  if (dismissAfter > 0) {
    setTimeout(() => el.remove(), dismissAfter);
  }

  return el;
}

export function clearAlerts(container) {
  if (!container) return;
  Array.from(container.children).forEach((n) => n.remove());
}

export function toast(container, type, message, ms = 2000) {
  return showAlert(container, type, message, { dismissAfter: ms, closable: false });
}
