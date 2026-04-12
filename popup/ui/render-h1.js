// popup/ui/render-h1.js
let _h1StylesInjected = false;

function injectStyles() {
  if (_h1StylesInjected) return;
  _h1StylesInjected = true;

  // NOTA: NO tocamos .tech-logo (tamaño/medidas) para heredar lo mismo que usan
  // las tarjetas de Tecnología. Solo afinamos el texto y el <img> interno.
  const css = `
  .card.tech-card.h1-card {
    border:1px solid #e5e7eb; border-radius:16px; background:#fff;
    padding:8px 10px; margin:0;
  }
  .card.h1-card .tech-row { display:flex; align-items:center; gap:8px; }
  .card.h1-card .tech-logo img, .card.h1-card .tech-logo svg {
    width:100%; height:100%; display:block; object-fit:contain; background:transparent!important; border-radius:0!important; filter:none!important;
  }
`;


  const s = document.createElement("style");
  s.id = "h1-techlike-styles";
  s.textContent = css;
  document.head.appendChild(s);
}

export function renderH1(mount, title = "") {
  injectStyles();

  // === Fila compartida (si no existe la crea) ===
  const ROW_ID = "top-row-cards";
  const host = mount.querySelector("#"+ROW_ID) || (() => {
    const d = document.createElement("div");
    d.className = "top-row";
    d.id = ROW_ID;
    mount.appendChild(d);
    return d;
  })();

  const sec = document.createElement("section");
  sec.className = "card tech-card h1-card";
  sec.setAttribute("data-no-copy", "true");
  sec.style.flex = "1"; // ocupa mitad de la fila

  const iconUrl = chrome.runtime.getURL("icons/ui/h1.svg");

  sec.innerHTML = `
    <div class="tech-row">
      <span class="tech-logo" style="width:28px;height:28px;flex:0 0 28px;">
        <img src="${iconUrl}" alt="Nombre encontrado">
      </span>
      <div class="tech-info">
        <div class="tech-label section-title">Nombre encontrado</div>
        ${
          title && !/no se encontr/i.test(title)
            ? `<div class="tech-title section-value" title="${escapeHtml(title)}">${escapeHtml(title)}</div>`
            : `<div class="tech-title section-value">—</div>`
        }
      </div>
    </div>
  `;


  // ⬇️ Ahora va a la fila
  host.appendChild(sec);
}

function escapeHtml(s="") {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
