// popup/ui/render-links.js
let _linksStyles = false;

function inject(){
  if (_linksStyles) return; _linksStyles = true;
  const s = document.createElement("style");
  s.id = "links-inline-v1";
  s.textContent = `
  .links-card{ border:1px solid #e5e7eb; background:#fff; border-radius:16px; padding:10px; margin:10px 0; }

  /* Header fantasma (sin logo) */
  .links-header{ margin:0 0 8px 0; }
  .links-header .tech-label{
    font-size:12px; font-weight:700; color:#667085;
    letter-spacing:.2px; line-height:1.1;
  }
  .links-header .tech-title{
    margin-top:1px; font-size:15px; font-weight:800;
    color:#0f172a; line-height:1.2;
  }

  /* clases únicas -> sin choques con .chips del header */
  .links-inline{
    display:flex !important;
    flex-wrap:wrap !important;
    gap:8px !important;
    align-items:center !important;
    justify-content:flex-start !important;
    text-align:left !important;
  }
  .link-chip{
    display:inline-flex !important;
    align-items:center; justify-content:center;
    padding:6px 10px; border-radius:999px;
    font-weight:700; font-size:12px;
    background:#eef2ff; color:#111827;
    border:1px solid #e5e7eb; text-decoration:none;
    flex:0 0 auto !important;  /* nunca ocupar toda la fila */
    margin:0 !important;
    white-space:nowrap;
  }
  .link-chip:hover{ background:#e0e7ff; }
  `;
  document.head.appendChild(s);
}

export function renderLinks(mount, bestLinks = {}) {
  inject();
  const sec = document.createElement("section");
  sec.className = "links-card";

  // Calcular cuántos enlaces hay
  const map = [
    ["privacy","Privacidad"],
    ["legal","Legal"],
    ["contact","Contacto"],
    ["terms","Condiciones"]
  ];
  const available = map.filter(([k]) => !!bestLinks?.[k]);

  sec.innerHTML = `
    <div class="links-header">
      <div class="tech-label">Enlaces destacados</div>
      <div class="tech-title">${available.length ? "" : "—"}</div>
    </div>
    <div class="links-inline" id="links-inline"></div>
  `;
  mount.appendChild(sec);

  const wrap = sec.querySelector("#links-inline");
  if (!available.length){
    wrap.innerHTML = `<div style="color:#6b7280;font-weight:600;">No se encontraron enlaces</div>`;
    return;
  }

  available.forEach(([k, label])=>{
    const href = bestLinks?.[k];
    if (!href) return;
    const a = document.createElement("a");
    a.className = "link-chip";
    a.href = href; a.target="_blank"; a.rel="noopener";
    a.textContent = label;
    wrap.appendChild(a);
  });
}
