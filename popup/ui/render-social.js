// popup/ui/render-social.js
let _socialStyles = false;

function css(){
  return `
  /* ====== Estilos existentes (se conservan) ====== */
  .section-card{ border:1px solid #e5e7eb; background:#fff; border-radius:16px; padding:10px; margin:10px 0; }
  .social-grid{ display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
  .social-btn{
    width:34px; height:34px; border-radius:10px; border:1px solid #e5e7eb; background:#fff;
    display:flex; align-items:center; justify-content:center;
    transition:background .15s ease, border-color .15s ease, transform .05s ease;
    flex:0 0 auto;
  }
  .social-btn:hover{ background:#f8fafc; border-color:#d1d5db; transform:translateY(-1px); }
  .social-btn img{ width:20px; height:20px; object-fit:contain; display:block; filter:none!important; background:transparent!important; }

  /* ====== Header “fantasma” (sin logo) ====== */
  .section-header{ margin:0 0 8px 0; }
  .section-header .tech-label{
    font-size:12px; font-weight:700; color:#667085; letter-spacing:.2px; line-height:1.1;
  }
  .section-header .tech-title{
    margin-top:1px; font-size:15px; font-weight:800; color:#0f172a; line-height:1.2;
  }
  `;
}
function inject(){
  if (_socialStyles) return; _socialStyles = true;
  const s = document.createElement("style");
  s.id = "social-v3-styles";
  s.textContent = css();
  document.head.appendChild(s);
}

// Carga desde tus SVG: icons/social/svg/*.svg
function icon(name){
  return chrome.runtime.getURL(`icons/social/svg/${name}.svg`);
}

export function renderSocial(mount, socialLinks = {}) {
  inject();

  // Orden visual y clave esperada en socialLinks
  const order = [
    ["facebook","facebook"],
    ["instagram","instagram"],
    ["youtube","youtube"],
    ["tiktok","tiktok"],
    ["twitter","twitter"],
    ["linkedin","linkedin"],
    ["pinterest","pinterest"],
    ["whatsapp","whatsapp"]
  ];

  // Precalcular cuántas redes hay para mostrar “—” si no hay ninguna
  const available = order
    .map(([key, file]) => ({ key, file, href: socialLinks?.[key] }))
    .filter(x => !!x.href);

  const sec = document.createElement("section");
  sec.className = "section-card";

  sec.innerHTML = `
    <div class="section-header">
      <div class="tech-label">Redes sociales</div>
      <div class="tech-title">${available.length ? "" : "—"}</div>
    </div>
    <div class="social-grid" id="social-grid"></div>
  `;
  mount.appendChild(sec);

  const grid = sec.querySelector("#social-grid");

  if (!available.length) {
    // Ya mostramos “—” arriba; aquí dejamos un texto auxiliar si quieres
    grid.innerHTML = `<div style="color:#6b7280;font-weight:600;">No se encontraron redes</div>`;
    return;
  }

  // Pintar botones con los SVG existentes
  available.forEach(({ key, file, href }) => {
    const a = document.createElement("a");
    a.className = "social-btn";
    a.href = href; a.target = "_blank"; a.rel = "noopener";
    a.title = key[0].toUpperCase() + key.slice(1);
    a.innerHTML = `<img src="${icon(file)}" alt="">`;
    grid.appendChild(a);
  });
}
