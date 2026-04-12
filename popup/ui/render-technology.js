// popup/ui/render-technology.js  (solo SVG)
function escapeHtml(s=""){ const d=document.createElement("div"); d.textContent=s; return d.innerHTML; }

const ICONS = {
  shopify:"shopify", woocommerce:"woocommerce", wordpress:"wordpress", magento:"magento",
  prestashop:"prestashop", bigcommerce:"bigcommerce", squarespace:"squarespace", wix:"wix",
  vtex:"vtex", opencart:"opencart", ghost:"ghost", blogger:"blogger",
  amazon:"amazon", ebay:"ebay", etsy:"etsy", mercadolibre:"mercadolibre",
  facebook:"facebook", instagram:"instagram", tiktok:"tiktok",
};

function pickKey(tech=""){
  const t = String(tech||"").toLowerCase();
  return Object.keys(ICONS).find(k => t.includes(k)) || null;
}

let _stylesInjected = false;
function injectStyles(){
  if (_stylesInjected) return; _stylesInjected = true;
  const css = `
  .top-row{display:flex;gap:10px;align-items:flex-start;margin:6px 0 10px;}
  .tech-card{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:14px;border:1px solid #e5e7eb;background:#fff;margin:0;}
  .top-row .tech-card{margin:0;}
  .tech-left{display:flex;align-items:center;gap:10px;min-width:0;}
  .tech-logo-wrap{width:28px;height:28px;display:flex;align-items:center;justify-content:center;flex:0 0 28px;}
  .tech-logo-img{display:block;width:26px;height:26px;object-fit:contain;filter:none!important;background:transparent!important;border-radius:0!important;}
  /* TIPOGRAFÍA: ya la gobiernan las clases section-title / section-value con reglas globales */
  `;
  const s=document.createElement("style"); s.id="tech-svg-styles"; s.textContent=css; document.head.appendChild(s);
}


/** Candidatas SOLO SVG (varias carpetas) */
function candidateSvgPaths(fileBase){
  return [
    `icons/tech/${fileBase}.svg`,
    `icons/tech/svg/${fileBase}.svg`,
    `icons/social/${fileBase}.svg`,
  ];
}

/** <img> que prueba varias rutas svg hasta que una carga */
function buildTechImgEl(key){
  const file = ICONS[key] || key;
  const paths = candidateSvgPaths(file).map(p => chrome.runtime.getURL(p));
  const img = document.createElement("img");
  img.className = "tech-logo-img";
  img.alt = ""; // no mostrar texto roto si falla
  let i = 0;
  img.onerror = () => { if (++i < paths.length) img.src = paths[i]; };
  img.src = paths[i];
  return img;
}

/**
 * Bloque “Tecnología detectada” (SVG original, sin botón Abrir)
 * @param {HTMLElement} root
 * @param {string} tech
 * @param {{ siteName?: string }} opts
 */
export function renderTechnology(root, tech, opts = {}){
  injectStyles();

  // === Fila compartida (si no existe la crea) ===
  const ROW_ID = "top-row-cards";
  const host = root.querySelector("#"+ROW_ID) || (() => {
    const d = document.createElement("div");
    d.className = "top-row";
    d.id = ROW_ID;
    root.appendChild(d);
    return d;
  })();

  const key   = pickKey(tech || "");
  const title = tech || "No identificada";
  const site  = (opts.siteName || "").trim();

  const sec = document.createElement("section");
  sec.className = "card tech-card";
  sec.style.flex = "1"; // ocupa mitad de la fila

  const left = document.createElement("div");
  left.className = "tech-left";

  const wrap = document.createElement("div");
  wrap.className = "tech-logo-wrap";
  if (key) wrap.appendChild(buildTechImgEl(key));

  const info = document.createElement("div");
  info.innerHTML = `
    <div class="tech-label section-title">Tecnología detectada</div>
    <div class="tech-title section-value">${escapeHtml(title)}</div>
    ${site ? `<div class="site-name section-value">${escapeHtml(site)}</div>` : ``}
  `;


  left.appendChild(wrap);
  left.appendChild(info);
  sec.appendChild(left);

  // ⬇️ Ahora va a la fila
  host.appendChild(sec);
}
