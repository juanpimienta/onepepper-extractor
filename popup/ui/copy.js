// popup/ui/copy.js
let _copyHandlersInstalled = false;

function injectCopyStylesOnce(){
  if (document.getElementById("copy-styles-v2")) return;
  const css = `
  /* estilo base opcional para el botón */
  .btn-copy{
    border:1px solid #e5e7eb; border-radius:999px; padding:6px 12px;
    background:#f8fafc; color:#111827; font-weight:600; cursor:pointer;
    transition:background .15s ease, color .15s ease, border-color .15s ease;
  }
  .btn-copy:hover{ background:#eef2ff; }

  /* estado al copiar -> AZUL */
  .btn-copy.copied{
    background:#dbeafe !important;
    border-color:#93c5fd !important;
    color:#1d4ed8 !important;
  }
  `;
  const s = document.createElement("style");
  s.id = "copy-styles-v2"; s.textContent = css;
  document.head.appendChild(s);
}

async function doCopy(text){
  if (!text) return false;
  try{
    await navigator.clipboard.writeText(text);
    return true;
  }catch(_){
    try{
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      return true;
    }catch(__){
      return false;
    }
  }
}

/** Busca el valor a copiar desde el botón o su fila (muy tolerante) */
function resolveCopyTextFromButton(btn){
  // 1) data directo del botón
  const direct = btn.getAttribute("data-copy-text") || btn.dataset.copy || "";
  if (direct) return direct.trim();

  // 2) selector opcional
  const sel = btn.getAttribute("data-copy-selector");
  if (sel){
    const el = btn.closest("*")?.querySelector(sel) || document.querySelector(sel);
    if (el) {
      const v = el.getAttribute("data-copy-value") || el.textContent || "";
      return v.trim();
    }
  }

  // 3) heurística de fila: busca elemento con el valor
  const row = btn.closest("[data-contact-row]") || btn.closest(".contact-row") || btn.parentElement;
  if (row){
    // Prioriza elementos "value"
    const valueEl = row.querySelector("[data-copy-value], .value, .val, .text, .label, span");
    if (valueEl){
      const v = valueEl.getAttribute("data-copy-value") || valueEl.textContent || "";
      if (v.trim()) return v.trim();
    }
    // Si no, intenta detectar email/teléfono del texto de la fila
    const all = (row.textContent || "").replace(/\s+/g, " ").trim();
    const email = all.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (email) return email[0];
    const phone = all.match(/\+?\d[\d\s\-().·\u00A0\u202F]{6,}\d/);
    if (phone) return phone[0].replace(/\s+$/,"");
  }

  // 4) último recurso: texto previo del botón
  const prevText = btn.previousSibling && btn.previousSibling.nodeType === 3 ? btn.previousSibling.nodeValue : "";
  if (prevText && /\S/.test(prevText)) return prevText.trim();

  return "";
}

export function installCopyHandlers(root=document){
  if (_copyHandlersInstalled) return;
  _copyHandlersInstalled = true;
  injectCopyStylesOnce();

  root.addEventListener("click", async (ev)=>{
    const btn = ev.target.closest("button[data-copy-text], button[data-copy-selector], .btn-copy, [data-action='copy']");
    if (!btn) return;

    const txt = resolveCopyTextFromButton(btn);
    if (!txt) return;

    const ok = await doCopy(txt);
    if (ok){
      const prev = btn.getAttribute("data-label-orig") ?? btn.textContent;
      btn.setAttribute("data-label-orig", prev);
      btn.textContent = "Copiado";
      btn.classList.add("copied");
      setTimeout(()=>{
        btn.classList.remove("copied");
        btn.textContent = btn.getAttribute("data-label-orig");
      }, 1200);
    }
  }, true);
}
