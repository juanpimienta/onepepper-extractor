// popup/ui/render-deep-scan.js
import { detectMarketplaceFromURL } from "../../content/extractors/marketplace.js";
import { showInfoModal } from "./modal.js";

let _deepScanStylesInjected = false;

function injectStyles() {
  if (_deepScanStylesInjected) return;
  _deepScanStylesInjected = true;

  const css = `
  /* Barra compacta: toggle IZQ — refrescar DER */
  .deepbar{
    width:100%;
    display:flex; align-items:center; justify-content:space-between;
    gap:12px; margin-top:8px; padding:6px 6px 10px;
  }
  .deepbar .deep-left{ display:flex; align-items:center; gap:8px; min-width:0; }
  .deepbar .deep-label{ font-size:14px; font-weight:600; white-space:nowrap; }
  .deepbar .premium-badge{
    display:inline-flex; align-items:center; justify-content:center;
    padding:3px 8px; border-radius:999px; font-size:11px; font-weight:800;
    color:#9f1239; background:#ffe4e6; border:1px solid #fecdd3;
  }

  /* Toggle pequeño */
  .deepbar .switch{
    position:relative; width:44px; height:24px; border:none; border-radius:999px;
    background:#d1d5db; padding:0; cursor:pointer; transition:background .2s ease;
  }
  .deepbar .switch .knob{
    position:absolute; top:2px; left:2px; width:20px; height:20px; border-radius:999px;
    background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.14); transition:left .2s ease;
  }
  .deepbar .switch.on{ background:#22c55e; }
  .deepbar .switch.on .knob{ left:22px; }
  .deepbar .switch:disabled{ opacity:.5; cursor:not-allowed; }

  /* Botón Refrescar pequeño, a la derecha */
  .deepbar .btn-refresh{
    margin-left:auto;
    border:1px solid #e5e7eb; background:#f1f5f9; color:#111827;
    font-weight:700; font-size:14px; padding:6px 12px; border-radius:12px;
    cursor:pointer; transition:background .15s ease, border-color .15s ease;
  }
  .deepbar .btn-refresh:hover{ background:#e2e8f0; border-color:#d1d5db; }

  /* Aviso bajo la barra cuando está deshabilitado por marketplace/red */
  .deepbar-warning{
    width:100%;
    margin:4px 0 0;
    font-size:12px;
    color:#f24738; /* rojo de tu paleta */
    line-height:1.4;
  }

  /* Modal mínimo inline (fallback si no usas modal.js) */
  .modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:99999;}
  .modal{background:#fff;border:1px solid #e5e7eb;border-radius:16px;max-width:540px;width:92%;padding:16px;box-shadow:0 20px 50px rgba(0,0,0,.18);}
  .modal h3{font-size:16px;font-weight:800;margin:0 0 8px;color:#0f172a;}
  .modal p{font-size:14px;line-height:1.45;color:#111827;margin:0 0 14px;}
  .modal .actions{display:flex;gap:10px;justify-content:flex-end;margin-top:12px;}
  .modal .btn{border:1px solid #e5e7eb;border-radius:12px;padding:8px 12px;background:#f8fafc;cursor:pointer;font-weight:700;}
  .modal .btn.primary{background:#27cdf2;color:#fff;border-color:#27cdf2;}
  
  /* Aún más compacto en móviles estrechos */
  @media (max-width:420px){
    .deepbar{ gap:10px; padding:6px 4px 8px; }
    .deepbar .deep-label{ font-size:13px; }
    .deepbar .btn-refresh{ font-size:13px; padding:6px 10px; }
    .deepbar .switch{ width:40px; height:22px; }
    .deepbar .switch .knob{ width:18px; height:18px; top:2px; }
    .deepbar .switch.on .knob{ left:20px; }
  }`;
  const s = document.createElement("style");
  s.id = "deep-scan-bar-styles";
  s.textContent = css;
  document.head.appendChild(s);
}

/**
 * Renderiza la barra de “Exploración profunda” + “Refrescar”.
 * - Lee y guarda el estado en chrome.storage.local (clave deepScanEnabled) como PREFERENCIA.
 * - En marketplaces/redes, se desactiva solo de forma EFECTIVA para esa URL, sin tocar la preferencia.
 *
 * @param {HTMLElement} mount
 * @param {{enabled?:boolean, locked?:boolean, onChange?:(v:boolean)=>void, onRefreshNow?:()=>void, onLockedAttempt?:()=>void}} opts
 */
export async function renderDeepScanToggle(mount, { enabled=false, locked=false, onChange, onRefreshNow, onLockedAttempt } = {}) {
  injectStyles();

  // 1) Preferencia persistente (default=false)
  const st = await chrome.storage.local.get("deepScanEnabled");
  if (typeof st.deepScanEnabled === "boolean") enabled = st.deepScanEnabled;

  // 2) Contexto actual (URL) y estado EFECTIVO
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentUrl = tab?.url || "";
  const marketName = detectMarketplaceFromURL(currentUrl); // null o nombre
  const effective = enabled && !marketName; // preferencia AND no marketplace

  // UI
  // contenedor
  const el = document.createElement("div");
  el.className = "deepbar";
  el.innerHTML = `
    <div class="deep-left">
      <button type="button" class="switch" aria-pressed="${enabled}" aria-label="Exploración profunda">
        <span class="knob"></span>
      </button>
      <span class="deep-label">Exploración profunda</span>
      ${locked ? '<span class="premium-badge">Premium</span>' : ''}
    </div>
    <button type="button" class="btn-refresh">Refrescar</button>
  `;
  mount.appendChild(el);


  // refs
  const sw  = el.querySelector(".switch");
  const btn = el.querySelector(".btn-refresh");

  // estado visual inicial (EFECTIVO)
  function setVisual(v){
    sw.classList.toggle("on", !!v);
    sw.setAttribute("aria-pressed", String(!!v));
  }
  setVisual(locked ? false : effective);

  // 🚫 Si es marketplace/red: deshabilitar switch y avisar (sin tocar storage)
  if (marketName) {
    sw.setAttribute("disabled", "disabled");
    sw.title = `Desactivado temporalmente en ${marketName}`;
    const warning = document.createElement("div");
    warning.className = "deepbar-warning";
    warning.textContent = `Exploración profunda desactivada en ${marketName}. Al volver a una web normal, tu preferencia se mantiene activa.`;
    // Ponemos el aviso debajo de la barra
    mount.appendChild(warning);
  }

  // Eventos
  sw.addEventListener("click", async () => {
    if (locked) {
      try { onLockedAttempt && onLockedAttempt(); } catch (e) { console.warn(e); }
      return;
    }
    if (sw.hasAttribute("disabled")) return; // seguridad por si el DOM no se actualizó todavía

    const willEnable = !enabled; // alterna la PREFERENCIA
    if (willEnable) {
      const ok = await showInfoModal({
        title: "Exploración profunda",
        message: "Activa la extracción profunda solo en tiendas (no en marketplaces). Recorre enlaces como Legal, Privacidad y Contacto; tarda unos segundos más.",
        okText: "Entendido"
      });
      if (!ok) return;
    }

    // Guardar preferencia y refrescar visual según URL actual
    enabled = willEnable;
    await chrome.storage.local.set({ deepScanEnabled: enabled });
    setVisual(enabled && !marketName);
    try { onChange && onChange(enabled); } catch(e) {}
  });

  btn.addEventListener("click", () => {
    try { onRefreshNow && onRefreshNow(); } catch(e) { console.warn(e); }
  });
}
