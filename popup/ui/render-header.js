// popup/ui/render-header.js
// Header compacto con dropdown overlay (INTL usa 🌍).
// Stats a la izquierda y descargas a la derecha.
// Título centrado + “semáforos” arriba + tira de peppers (rojo, amarillo, azul).

/* ------------------ Países ------------------ */
const COUNTRIES = [
  { iso:"INTL", name:"Mundo (Telefonos con indicativos)", cc:"", _world:true },

  // Norteamérica / Caribe
  { iso:"US", name:"Estados Unidos", cc:"1" }, { iso:"CA", name:"Canadá", cc:"1" },
  { iso:"MX", name:"México", cc:"52" }, { iso:"PR", name:"Puerto Rico", cc:"1" },
  { iso:"DO", name:"República Dominicana", cc:"1" }, { iso:"JM", name:"Jamaica", cc:"1" },
  { iso:"TT", name:"Trinidad y Tobago", cc:"1" }, { iso:"BS", name:"Bahamas", cc:"1" },
  { iso:"BB", name:"Barbados", cc:"1" }, { iso:"HT", name:"Haití", cc:"509" },

  // Latinoamérica
  { iso:"AR", name:"Argentina", cc:"54" }, { iso:"BO", name:"Bolivia", cc:"591" },
  { iso:"BR", name:"Brasil", cc:"55" }, { iso:"CL", name:"Chile", cc:"56" },
  { iso:"CO", name:"Colombia", cc:"57" }, { iso:"CR", name:"Costa Rica", cc:"506" },
  { iso:"CU", name:"Cuba", cc:"53" }, { iso:"EC", name:"Ecuador", cc:"593" },
  { iso:"SV", name:"El Salvador", cc:"503" }, { iso:"GT", name:"Guatemala", cc:"502" },
  { iso:"HN", name:"Honduras", cc:"504" }, { iso:"NI", name:"Nicaragua", cc:"505" },
  { iso:"PA", name:"Panamá", cc:"507" }, { iso:"PY", name:"Paraguay", cc:"595" },
  { iso:"PE", name:"Perú", cc:"51" }, { iso:"UY", name:"Uruguay", cc:"598" },
  { iso:"VE", name:"Venezuela", cc:"58" },

  // Europa Occidental
  { iso:"ES", name:"España", cc:"34" }, { iso:"PT", name:"Portugal", cc:"351" },
  { iso:"FR", name:"Francia", cc:"33" }, { iso:"IT", name:"Italia", cc:"39" },
  { iso:"DE", name:"Alemania", cc:"49" }, { iso:"GB", name:"Reino Unido", cc:"44" },
  { iso:"IE", name:"Irlanda", cc:"353" }, { iso:"NL", name:"Países Bajos", cc:"31" },
  { iso:"BE", name:"Bélgica", cc:"32" }, { iso:"LU", name:"Luxemburgo", cc:"352" },
  { iso:"CH", name:"Suiza", cc:"41" }, { iso:"AT", name:"Austria", cc:"43" },

  // Nórdicos
  { iso:"DK", name:"Dinamarca", cc:"45" }, { iso:"NO", name:"Noruega", cc:"47" },
  { iso:"SE", name:"Suecia", cc:"46" }, { iso:"FI", name:"Finlandia", cc:"358" },
  { iso:"IS", name:"Islandia", cc:"354" },

  // Centro / Este
  { iso:"PL", name:"Polonia", cc:"48" }, { iso:"CZ", name:"Chequia", cc:"420" },
  { iso:"SK", name:"Eslovaquia", cc:"421" }, { iso:"HU", name:"Hungría", cc:"36" },
  { iso:"RO", name:"Rumanía", cc:"40" }, { iso:"BG", name:"Bulgaria", cc:"359" },
  { iso:"GR", name:"Grecia", cc:"30" }, { iso:"CY", name:"Chipre", cc:"357" },
  { iso:"MT", name:"Malta", cc:"356" }, { iso:"SI", name:"Eslovenia", cc:"386" },
  { iso:"HR", name:"Croacia", cc:"385" }, { iso:"RS", name:"Serbia", cc:"381" },
  { iso:"BA", name:"Bosnia y Herzegovina", cc:"387" }, { iso:"MK", name:"Macedonia del Norte", cc:"389" },
  { iso:"AL", name:"Albania", cc:"355" }, { iso:"ME", name:"Montenegro", cc:"382" },
  { iso:"UA", name:"Ucrania", cc:"380" },

  // Puente
  { iso:"TR", name:"Turquía", cc:"90" }, { iso:"RU", name:"Rusia", cc:"7" },
];

export function getSupportedCountries(){ return COUNTRIES.slice(); }

/* ------------------ Helpers ------------------ */
function getCountryMeta(code){ return COUNTRIES.find(c=>c.iso===code) || COUNTRIES.find(c=>c.iso==="ES"); }
function byName(a,b){ return a.name.localeCompare(b.name,'es'); }
function flagUrl(iso, isWorld=false){
  const file = isWorld ? "world" : iso.toLowerCase();
  return chrome.runtime.getURL("icons/flags/" + file + ".svg");
}

/* ------------------ Estilos (inyectados) ------------------ */
function injectStylesOnce(){
  if (document.getElementById("hdr-safe-styles")) return;
  const css = ""
  + ":root{"
  + "--brand:#27cdf2;--text:#000;--border:#e5e7eb;--tileH:32px;"
  + "--ttl-size:12px; --ttl-weight:700; --ttl-color:#6b7280;"   // títulos
  + "--val-size:15px; --val-weight:800; --val-color:#0f172a;"   // valores
  + "}"
  + ".hdr{background:var(--brand);border-radius:16px;padding:8px 10px;margin:8px 10px;overflow:hidden;}"
  + ".hdr-title{color:var(--text);font-size:14px;font-weight:800;margin:0 0 4px;}"
  + ".hdr-grid{display:grid;grid-template-rows:auto auto;gap:6px;}"
  + ".row-top{display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:8px;}"
  + ".row-bottom{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:start;}"
  /* Selector overlay */
  + ".select{position:relative;width:max-content;}"
  + ".select-trigger{display:flex;align-items:center;gap:7px;background:#fff;border:1px solid var(--border);border-radius:12px;padding:4px 9px;min-height:32px;cursor:pointer;font-weight:700;box-sizing:border-box;}"
  + ".select-trigger img{width:18px;height:13px;border-radius:2px;box-shadow:0 0 0 1px var(--border);}"
  + ".select-trigger .emoji{font-size:16px;line-height:1;}"
  + ".select-trigger .cc{color:#4b5563;font-weight:600;}"
  + ".select-trigger .caret{margin-left:auto;color:#6b7280;}"
  + ".country-hint{color:#073b4c;font-size:12px;line-height:1.2;"
  + " font-weight:800;text-align:right;margin:0;}"
  + ".select-menu[hidden]{display:none;}"
  + ".select-menu{position:absolute;z-index:10000;top:calc(100% + 8px);left:0;min-width:280px;max-width:340px;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 12px 26px rgba(0,0,0,.12);overflow:hidden;}"
  + ".select-search{display:flex;gap:8px;padding:8px;border-bottom:1px solid var(--border);}"
  + ".select-search input{flex:1;border:none;outline:none;font-size:14px;}"
  + ".select-list{max-height:320px;overflow:auto;}"
  + ".select-item{display:flex;align-items:center;gap:10px;width:100%;padding:8px 12px;background:#fff;border:none;cursor:pointer;text-align:left;}"
  + ".select-item:hover,.select-item[aria-selected='true']{background:#e8f2ff;}"
  + ".select-item img{width:18px;height:14px;border-radius:2px;box-shadow:0 0 0 1px var(--border);}"
  + ".select-item .meta{margin-left:auto;color:#6b7280;font-size:12px;}"
  + "@media (max-width:520px){.row-top{grid-template-columns:1fr;} .country-hint{text-align:left;margin-top:4px;}}"
  /* Columnas inferiores */
  + ".stats,.exports{display:flex;flex-direction:column;gap:10px;align-items:stretch;}"
  /* Tarjetas iguales */
  + ".tile,.pill{width:100%;min-height:var(--tileH);background:#fff;border:1px solid var(--border);border-radius:14px;display:flex;align-items:center;justify-content:center;gap:6px;padding:6px 9px;font-weight:800;color:#000;box-sizing:border-box;}"
  + ".stat-flash{transition:box-shadow .2s ease, border-color .2s ease, background .2s ease;}"
  + ".stat-flash.is-pulse{box-shadow:0 0 0 4px rgba(39,205,242,.34), 0 0 24px rgba(39,205,242,.52);border-color:#27cdf2;background:#dff8ff;}"
  + ".stat-pop{display:inline-block;transform-origin:center;}"
  + ".stat-pop.is-pop{animation:stat-pop-bounce .42s ease;}"
  + "@keyframes stat-pop-bounce{0%{transform:scale(1);}35%{transform:scale(1.18);}100%{transform:scale(1);}}"
  + ".tile svg,.pill svg{width:14px;height:14px;}"
  + ".stat-row{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:8px;box-sizing:border-box;}"
  + ".btn[disabled]{opacity:.45;cursor:default;}"
  +  /* ——— layout fila superior: mensaje IZQ / selector DER ——— */
  +  ".row-top{display:grid;grid-template-columns:1fr auto;align-items:center;gap:8px;width:100%;}"
  +  ".select-outer{justify-self:end;}" /* pega el selector a la derecha */
  +  ".country-hint{font-weight:800;margin:0;text-align:left;font-size:11px;color:#073b4c;line-height:1.15;max-width:380px;}"
  +  "@media (max-width:560px){.row-top{grid-template-columns:1fr;} .select-outer{justify-self:start;margin-top:6px;}}"
  /* === Tipografía unificada === */
  + ".section-title{font-size:var(--ttl-size);font-weight:var(--ttl-weight);color:var(--ttl-color);line-height:1.1;letter-spacing:.2px;}"
  + ".section-value{font-size:var(--val-size);font-weight:var(--val-weight);color:var(--val-color);line-height:1.2;}"
  + ".tech-label{font-size:var(--ttl-size)!important;font-weight:var(--ttl-weight)!important;color:var(--ttl-color)!important;line-height:1.1;}"
  + ".tech-title{font-size:var(--val-size)!important;font-weight:var(--val-weight)!important;color:var(--val-color)!important;line-height:1.2;}"
  + ".site-name{font-size:var(--val-size);font-weight:var(--val-weight);color:var(--val-color);line-height:1.2;}"
  + ".card .card-title, .card h3 {font-size:var(--ttl-size);font-weight:var(--ttl-weight);color:var(--ttl-color);margin:0 0 6px;}"
  + ".card .item-strong, .card .list-item strong {font-size:var(--val-size);font-weight:var(--val-weight);color:var(--val-color);}";

  const s=document.createElement("style");
  s.id="hdr-safe-styles";
  s.textContent=css;
  document.head.appendChild(s);
}

/* ------------------ Decor del título (centrado + “semáforos”) ------------------ */
// popup/ui/render-header.js
(function ensureHeaderDecorCSS(){
  const ID = "hdr-centering-style";
  if (document.getElementById(ID)) return;
  const s = document.createElement("style");
  s.id = ID;
  s.textContent = `
    /* Fila superior: 3 columnas (spacer | título+peppers | spacer) */
    .hdr-row--title{
      display:grid;
      grid-template-columns: 1fr auto 1fr;
      align-items:center;
      margin-bottom:4px;
    }
    /* Caja central que agrupa título + peppers */
    .hdr-titlebox{
      justify-self:center;
      display:inline-flex;
      align-items:center;
      gap:8px;
    }
    .hdr-title{
      margin:1px 0 4px;
      font-weight:800;
      text-align:center;
      line-height:1.2;
    }
    .hdr-spacer{ height:1px; } /* vacío, sólo para balancear columnas */

    /* Peppers a la derecha del título */
    .pepper-strip{
      display:inline-flex;
      align-items:center;
      gap:4px;
      margin-left:6px;
    }
    .pepper-strip img{
      width:13px; height:13px; display:block; border-radius:50%;
    }

    /* Si quedaron restos de los antiguos "puntos", escóndelos */
    .hdr-dots, .hdr-dots-spacer{ display:none !important; }
  `;
  document.head.appendChild(s);
})();

const PEPPERS = {
  red:    "icons/peppers/pepper-rojo-16.png",
  yellow: "icons/peppers/pepper-amarillo-16.png",
  blue:   "icons/peppers/pepper-azul-16.png",
};

function addPepperStripToTitle(headerRoot){
  const titleEl =
    headerRoot.querySelector(".hdr-title") ||
    headerRoot.querySelector("h1, h2, .title, .header-title");
  if (!titleEl) return;

  // evita duplicar
  if (titleEl.querySelector(".pepper-strip")) return;

  const strip = document.createElement("span");
  strip.className = "pepper-strip";
  [PEPPERS.red, PEPPERS.yellow, PEPPERS.blue].forEach(p => {
    const img = new Image();
    img.src = chrome.runtime.getURL(p);
    img.alt = "";
    strip.appendChild(img);
  });
  titleEl.appendChild(strip);
}

export function decorateHeaderTitle(headerRoot){
  try{
    const scope = headerRoot || document.getElementById("header-root") || document;
    // Toma el título existente
    const titleEl =
      scope.querySelector(".hdr-title") ||
      scope.querySelector("h1, h2, .title, .header-title");
    if (!titleEl) return;

    // Evita duplicar
    if (scope.querySelector(".hdr-row--title")) return;

    // Asegura clase consistente
    titleEl.classList.add("hdr-title");

    // Localiza la grilla del header para insertar la fila por encima
    const headerEl = scope.querySelector(".hdr") || scope;
    const gridEl   = headerEl.querySelector(".hdr-grid") || headerEl.lastElementChild;

    // Crea fila: [spacer] [título+peppers] [spacer]
    const row   = document.createElement("div"); row.className = "hdr-row--title";
    const left  = document.createElement("div"); left.className  = "hdr-spacer";
    const right = document.createElement("div"); right.className = "hdr-spacer";
    const box   = document.createElement("div"); box.className   = "hdr-titlebox";

    // Tira de peppers (orden: rojo, amarillo, azul)
    const strip = document.createElement("span");
    strip.className = "pepper-strip";
    strip.innerHTML = `
      <img alt="" src="${chrome.runtime.getURL('icons/peppers/pepper-rojo-16.png')}">
      <img alt="" src="${chrome.runtime.getURL('icons/peppers/pepper-amarillo-16.png')}">
      <img alt="" src="${chrome.runtime.getURL('icons/peppers/pepper-azul-16.png')}">
    `;

    // Mueve el título dentro de la caja y añade los peppers
    box.appendChild(titleEl);
    box.appendChild(strip);

    // Monta la fila
    row.appendChild(left);
    row.appendChild(box);
    row.appendChild(right);

    // Inserta la fila encima de la grilla (o al inicio del header si no hay .hdr-grid)
    if (gridEl && gridEl.parentNode === headerEl) {
      headerEl.insertBefore(row, gridEl);
    } else {
      headerEl.insertBefore(row, headerEl.firstChild);
    }
  }catch(e){
    console.warn("[header] decorateHeaderTitle:", e);
  }
}

/* ------------------ Dropdown overlay ------------------ */
function attachCountryDropdown(elDiv, opts){
  const countries = opts.countries;
  const currentISO = opts.valueISO || "ES";
  const current = countries.find(c=>c.iso===currentISO) || countries[0];
  const isIntl = current && current.iso === "INTL";

  elDiv.className = "select";
  elDiv.innerHTML =
    '<button type="button" class="select-trigger" id="sel-trigger" aria-haspopup="listbox" aria-expanded="false">' +
      (isIntl ? '<span class="emoji" id="sel-flag">🌍</span>' : '<img id="sel-flag" alt="" src="' + flagUrl(current.iso, !!current._world) + '">') +
      '<span id="sel-name">' + current.name + '</span>' +
      '<span class="cc" id="sel-cc">' + (current.cc ? ('+' + current.cc) : '') + '</span>' +
      '<span class="caret">▾</span>' +
    '</button>' +
    '<div class="select-menu" id="sel-menu" hidden>' +
      '<div class="select-search">' +
        '<input id="sel-search" placeholder="Buscar país, ISO o +código...">' +
      '</div>' +
      '<div class="select-list" id="sel-list"></div>' +
    '</div>';

  const trigger = elDiv.querySelector("#sel-trigger");
  const menu    = elDiv.querySelector("#sel-menu");
  const input   = elDiv.querySelector("#sel-search");
  const list    = elDiv.querySelector("#sel-list");
  let rows = [];

  function renderList(q){
    const s = (q||"").trim().toLowerCase();
    rows = countries.filter(c =>
      !s || c.name.toLowerCase().includes(s) ||
      c.iso.toLowerCase().includes(s) ||
      (c.cc && ('+' + c.cc).includes(s.replace(/^\+?/, "+"))) ||
      (s === "intl" && c.iso === "INTL")
    ).sort(byName);

    list.innerHTML = rows.map(function(c){
      return (
        '<button class="select-item" data-iso="' + c.iso + '" role="option">' +
          (c.iso==="INTL" ? '<span class="emoji">🌍</span>' : '<img alt="" src="' + flagUrl(c.iso, !!c._world) + '">') +
          '<span>' + c.name + '</span>' +
          '<span class="meta">' + c.iso + (c.cc ? (' · +' + c.cc) : '') + '</span>' +
        '</button>'
      );
    }).join("") || '<div style="padding:10px;color:#6b7280;">Sin resultados</div>';
  }

  function open(){
    menu.hidden=false; trigger.setAttribute("aria-expanded","true");
    renderList(""); input.value=""; input.focus();
    setTimeout(function(){ document.addEventListener("click", onDoc, { once:true }); },0);
  }
  function close(){ menu.hidden=true; trigger.setAttribute("aria-expanded","false"); }
  function onDoc(e){ if (!elDiv.contains(e.target)) close(); }

  trigger.addEventListener("click", function(e){ e.stopPropagation(); menu.hidden ? open() : close(); });
  input.addEventListener("input", function(){ renderList(input.value); });
  list.addEventListener("click", function(e){
    const item = e.target.closest(".select-item"); if(!item) return;
    const iso = item.getAttribute("data-iso");
    const m = countries.find(c=>c.iso===iso);
    const isIntlNow = iso==="INTL";
    const flagEl = elDiv.querySelector("#sel-flag");
    if (isIntlNow){
      if (flagEl && flagEl.tagName === "IMG") flagEl.outerHTML = '<span class="emoji" id="sel-flag">🌍</span>';
      else if (flagEl) flagEl.textContent = "🌍";
    } else {
      if (flagEl && flagEl.tagName !== "IMG") flagEl.outerHTML = '<img id="sel-flag" alt="" src="' + flagUrl(m.iso, !!m._world) + '">';
      else if (flagEl) flagEl.src = flagUrl(m.iso, !!m._world);
    }
    elDiv.querySelector("#sel-name").textContent = m.name;
    elDiv.querySelector("#sel-cc").textContent   = m.cc ? ('+' + m.cc) : '';
    close();
    if (typeof opts.onChange === "function") opts.onChange(iso);
  });

  return { open:function(){}, close:close };
}

/* ------------------ Iconos (SVG inline) ------------------ */
const Ico = {
  registros: function(){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="10" width="4" height="10"></rect><rect x="10" y="6" width="4" height="14"></rect><rect x="17" y="3" width="4" height="17"></rect></svg>'; },
  correo:    function(){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"></path><path d="M22 6l-10 7L2 6"></path></svg>'; },
  phone:     function(){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.89.32 1.76.59 2.6a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.48-1.12a2 2 0 0 1 2.11-.45c.84.27 1.71.47 2.6.59A2 2 0 0 1 22 16.92z"></path></svg>'; },
  excel:     function(){ return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 3h9a1 1 0 0 1 1 1v3h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H10l-5-5V4a1 1 0 0 1 1-1z"></path><path fill="#fff" d="M8 13l1.8-3L8 7h2l1 2 1-2h2l-1.8 3 1.8 3h-2l-1-2-1 2H8z"></path></svg>'; },
  csv:       function(){ return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 3h16v18H4z"></path><text x="6" y="16" font-size="8" fill="#fff">CSV</text></svg>'; }
};

/* ------------------ Render principal ------------------ */
export function renderHeader(
  container,
  {
    country = "ES",
    stats = { registros: 0, emails: 0, phones: 0 },
    onCountryChange,
    onChangeCountry,
    onExcel = function(){},
    onCSV = function(){},
  } = {}
){
  injectStylesOnce();

  const meta = getCountryMeta(country);
  const notifyCountryChange = function(iso){
    const fn = (typeof onCountryChange === "function") ? onCountryChange : onChangeCountry;
    if (typeof fn === "function") return fn(iso);
  };

  container.innerHTML =
    '<header class="hdr" role="region" aria-label="Cabecera del extractor">' +
      '<h1 class="hdr-title">Extractor de correos y teléfonos</h1>' +
      '<div class="hdr-grid">' +
        // Fila 1
        '<div class="row-top">' +
          '<p class="country-hint">Elige país o usa 🌍 <strong>Mundo</strong> para teléfonos con indicativo.</p>' +
          '<div id="country-select" class="select"></div>' +
          '</div>' +
        // Fila 2: IZQ descargas | DER stats
        '<div class="row-bottom">' +
          // IZQUIERDA (EXPORTS)
          '<div class="exports">' +
            '<button id="btn-excel" class="tile btn">' + Ico.excel() + ' <span>Descargar registros en Excel</span></button>' +
            '<button id="btn-csv"   class="tile btn">' + Ico.csv()   + ' <span>Descargar registros en CSV</span></button>' +
          '</div>' +

          // DERECHA (STATS)
          '<div class="stats" aria-label="Estadísticas">' +
            '<div class="tile stat-flash" id="stat-reg-card" title="Dominios únicos">' +
              Ico.registros() + ' <span><b id="stat-reg" class="stat-pop">' + (stats.registros || 0) + '</b> Registros</span>' +
            '</div>' +
            '<div class="stat-row">' +
              '<div class="pill stat-flash" id="stat-mail-card" title="Emails únicos">' + Ico.correo() + ' <span id="stat-mail" class="stat-pop">' + (stats.emails || 0) + '</span></div>' +
              '<div class="pill stat-flash" id="stat-phone-card" title="Teléfonos únicos">' + Ico.phone()  + ' <span id="stat-phone" class="stat-pop">' + (stats.phones || 0) + '</span></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
    '</header>';

  // Centra título + añade semáforos + peppers
  decorateHeaderTitle(container);

  // Dropdown de país
  attachCountryDropdown(
    container.querySelector("#country-select"),
    {
      countries: COUNTRIES,
      valueISO: meta.iso,
      onChange: function(iso){ try{ notifyCountryChange(iso); }catch(e){ console.warn(e); } }
    }
  );

  // Botones descargas
  const b1 = container.querySelector("#btn-excel");
  const b2 = container.querySelector("#btn-csv");
  if (b1) b1.addEventListener("click", function(){ onExcel(); });
  if (b2) b2.addEventListener("click", function(){ onCSV();  });

}

/* ------------------ Update counters ------------------ */
export function updateHeaderStats(container, data){
  data = data || {};
  const reg = container.querySelector("#stat-reg");
  const em  = container.querySelector("#stat-mail");
  const ph  = container.querySelector("#stat-phone");
  const regCard = container.querySelector("#stat-reg-card");
  const emCard  = container.querySelector("#stat-mail-card");
  const phCard  = container.querySelector("#stat-phone-card");

  const pulse = (el) => {
    if (!el) return;
    el.classList.remove("is-pulse");
    void el.offsetWidth;
    el.classList.add("is-pulse");
    setTimeout(() => el.classList.remove("is-pulse"), 700);
  };
  const pop = (el) => {
    if (!el) return;
    el.classList.remove("is-pop");
    void el.offsetWidth;
    el.classList.add("is-pop");
    setTimeout(() => el.classList.remove("is-pop"), 500);
  };

  const updateValue = (node, card, nextValue) => {
    if (!node || typeof nextValue !== "number") return;
    const prev = Number(node.textContent || "0");
    node.textContent = nextValue;
    if (nextValue > prev) {
      pulse(card);
      pop(node);
    }
  };

  updateValue(reg, regCard, data.registros);
  updateValue(em, emCard, data.emails);
  updateValue(ph, phCard, data.phones);
}

(function autoHeaderHeight(){
  const el =
    document.querySelector('#header-root') ||
    document.querySelector('.hdr-wrap') ||
    document.querySelector('.hdr');
  if (!el) return;

  const set = () => {
    const h = Math.ceil(el.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--headerH', h + 'px');
  };
  // set inicial y en cambios de tamaño
  set();
  new ResizeObserver(set).observe(el);
})();

function mountDeepProgressUI() {
  const wrap = document.getElementById("deep-progress");
  const line = document.getElementById("deep-progress-line");
  const meter = document.getElementById("deep-progress-meter");

  const brandCyan = "#27cdf2";
  const brandYellow = "#f2bb13";
  const brandGreen = "#28a745";

  function paint(state) {
    if (!wrap || !line || !meter) return;
    const { running, index=0, total=0, url="", emails=0, phones=0, lastError="" } = state || {};
    const pct = total ? Math.min(100, Math.round(index*100/total)) : 0;

    wrap.style.display = (running || total) ? "block" : "none";
    meter.style.width = pct + "%";
    meter.style.background = running ? brandYellow : brandGreen;

    const urlShort = url ? (url.length>48 ? url.slice(0,45)+"…" : url) : "—";
    line.textContent = running
      ? `Profunda: ${index}/${total} • ${pct}% • Emails ${emails} | Teléfonos ${phones} • ${urlShort}`
      : `Profunda finalizada • ${emails} emails • ${phones} teléfonos`;

    if (lastError) {
      line.textContent += ` • ⚠ ${lastError}`;
    }
  }

  // Estado inicial
  chrome.storage.local.get({ deepProgress: {} }, ({ deepProgress }) => paint(deepProgress));

  // Suscripción a cambios
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.deepProgress) paint(changes.deepProgress.newValue || {});
  });
}

// Llama a mountDeepProgressUI() tras montar el header
document.addEventListener("DOMContentLoaded", () => {
  try { mountDeepProgressUI(); } catch {}
});
