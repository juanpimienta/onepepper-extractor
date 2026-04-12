// ================================
// content/main.js
// ================================

// --- util: precarga sigilosa para UIs virtualizadas (sin “scroll visible”)
async function autoScrollStealth({ ms = 1600, stepMul = 0.9, mode = "hide" } = {}) {
  const html = document.documentElement;
  const body = document.body || html;

  const prevScroll = { x: window.scrollX, y: window.scrollY };
  const prevStyles = {
    behavior: html.style.scrollBehavior || "",
    visibility: html.style.visibility || ""
  };

  html.style.scrollBehavior = "auto";
  if (mode === "hide") html.style.visibility = "hidden";

  try {
    const H = Math.max(body.scrollHeight, html.scrollHeight);
    const step = Math.max(200, Math.floor(window.innerHeight * stepMul));
    const t0 = performance.now();
    let y = prevScroll.y;

    while (performance.now() - t0 < ms) {
      y = Math.min(H, y + step);
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 40));
      if (y >= H - window.innerHeight * 1.2) break;
    }
    await new Promise(r => setTimeout(r, 120));
  } finally {
    window.scrollTo(prevScroll.x, prevScroll.y);
    html.style.scrollBehavior = prevStyles.behavior;
    if (mode === "hide") html.style.visibility = prevStyles.visibility;
  }
}

async function hoverEmailsHints() {
  const nodes = document.querySelectorAll('[data-hovercard-id],[email],[aria-label*="@"]');
  for (const n of nodes) {
    try {
      const r = n.getBoundingClientRect();
      const ev = new MouseEvent('mouseover', { bubbles: true, clientX: r.left + 2, clientY: r.top + 2 });
      n.dispatchEvent(ev);
      await new Promise(r => setTimeout(r, 40));
    } catch {}
  }
}

// === Carga dinámica de módulos (evita "Cannot use import ... outside a module")
async function loadModules() {
  const base = (p) => chrome.runtime.getURL(p);

  const emailsMod = await import(base("content/extractors/emails.js"));
  const phonesMod = await import(base("content/extractors/phones/index.js")); // router por país
  const deepMod   = await import(base("content/extractors/deep-scan.js"));
  const linksMod  = await import(base("content/extractors/links.js"));
  const socialMod = await import(base("content/extractors/social.js"));
  const techMod   = await import(base("content/extractors/technology.js"));

  return {
    extractEmails: emailsMod.extractEmails,
    extractPhones: phonesMod.extractPhones, // <- nombre correcto
    deepScanUrls: deepMod.deepScanUrls,
    extractKeyLinks: linksMod.extractKeyLinks,
    sameOriginDeepScanCandidates: linksMod.sameOriginDeepScanCandidates,
    extractSocial: socialMod.extractSocial,
    detectTechnology: techMod.detectTechnology,
  };
}

// === Persistencia + normalización canónica de URL (global) ===
function normUrlForStore(href, base = location.href) {
  try {
    let u = new URL(href, base);

    // Desenrollar redirecciones típicas (Google/Facebook/Twitter)
    const host0 = u.hostname.toLowerCase().replace(/^www\./, "");
    if (host0 === "google.com" && u.pathname === "/url" && u.searchParams.get("q")) {
      u = new URL(u.searchParams.get("q"));
    }
    if ((host0 === "l.facebook.com" || host0 === "lm.facebook.com") && u.pathname === "/l.php" && u.searchParams.get("u")) {
      u = new URL(u.searchParams.get("u"));
    }
    if (host0 === "t.co" && u.searchParams.get("url")) {
      u = new URL(u.searchParams.get("url"));
    }

    // Solo http/https
    if (!/^https?:$/.test(u.protocol)) return null;

    // Host sin www., minúsculas
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");

    // AMAZON: cortar ruido tras /ref=
    if (/\.amazon\./i.test(u.hostname)) {
      const cut = u.pathname.split("/ref=")[0] || "/";
      u.pathname = cut;
    }

    // Sin query, sin hash
    u.search = "";
    u.hash = "";

    // Sin "/" final (salvo raíz)
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }

    return u.toString();
  } catch {
    return null;
  }
}

async function loadVisitedSet() {
  try {
    const { visitedUrls = [] } = await chrome.storage.local.get("visitedUrls");
    return new Set(visitedUrls);
  } catch { return new Set(); }
}

async function saveVisitedUrl(nUrl) {
  if (!nUrl) return;
  try {
    const cur = await loadVisitedSet();
    if (!cur.has(nUrl)) {
      cur.add(nUrl);
      await chrome.storage.local.set({ visitedUrls: Array.from(cur) });
    }
  } catch {}
}

// Enviar estado al background (usa tu background.js)
const setIcon = (state) => chrome.runtime.sendMessage({ action: `icon:${state}` });


/* ============================================================
   ANTI-FAKES TELÉFONOS — ES específico + GLOBAL para otros países
   (PÉGALO donde tienes tu bloque "Anti-fakes teléfonos ES")
   ============================================================ */

/* ====== ESPECÍFICO ESPAÑA (sin cambios de lógica) ====== */
function _onlyDigits(s){ return String(s||"").replace(/[^\d]/g,""); }

function _normalizeES(num){
  const d = _onlyDigits(num);
  if (d.length === 11 && d.startsWith("34")) return "+34" + d.slice(2); // +34xxxxxxxxx
  if (d.length === 9) return d;                                         // 9 dígitos
  return null;
}

function _isFakePatternES(num){
  const d = _onlyDigits(num);
  if (d.length < 9 || d.length > 11) return true;

  // 5+ iguales seguidas (666666..., 000000...)
  if (/(.)\1{4,}/.test(d)) return true;

  // Secuencias típicas
  if (/012345678|123456789|987654321/.test(d)) return true;

  // Muy poca variedad (≤2 dígitos diferentes)
  const uniq = new Set(d.split(""));
  if (uniq.size <= 2) return true;

  return false;
}

function filterPhonesES(list, country) {
  // Solo aplicamos ES estricto si el selector es ES; para otros países solo quitamos duplicados evidentes
  if ((country || "ES").toUpperCase() !== "ES") {
    const seen = new Set();
    return (list||[]).filter(x=>{
      const k = _onlyDigits(x);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  const good = new Set();
  for (const raw of (list || [])) {
    const norm = _normalizeES(raw);
    if (!norm) continue;
    if (_isFakePatternES(norm)) continue;

    // Debe empezar por 6/7/8/9 (tras normalizar)
    const d = _onlyDigits(norm).slice(-9);
    if (!/^[6789]\d{8}$/.test(d)) continue;

    // Guarda normalizado (con +34 si venía con prefijo, o 9 dígitos)
    good.add(norm);
  }
  return Array.from(good);
}

/* ====== GLOBAL (para TODOS los demás países) ====== */
function _digits(s){ return String(s||"").replace(/[^\d]/g,""); }
function _uniqCount(s){ return new Set(String(s||"").split("")).size; }
const _BAD_RUN = /(.)\1{4,}/; // 5+ iguales seguidas
const _ASC_DESC = /012345678|123456789|987654321/;

// Reglas por país (longitudes locales y reglas de inicio simples)
const PHONE_RULES = {
  // NANP (US, CA, PR, DO, etc.) – 10 dígitos locales, NXX-NXX-XXXX con N=2-9
  US:{local:[10], start:/^[2-9]/}, CA:{local:[10], start:/^[2-9]/}, PR:{local:[10], start:/^[2-9]/},
  DO:{local:[10], start:/^[2-9]/}, JM:{local:[10], start:/^[2-9]/}, TT:{local:[10], start:/^[2-9]/},
  BS:{local:[10], start:/^[2-9]/}, BB:{local:[10], start:/^[2-9]/},
  // LATAM
  MX:{local:[10]}, AR:{local:[10]}, BR:{local:[10,11]}, CL:{local:[9]}, CO:{local:[10]},
  PE:{local:[9]},  UY:{local:[8,9]}, VE:{local:[10]}, EC:{local:[9]}, BO:{local:[8,9]},
  PY:{local:[9]},  CR:{local:[8]},   SV:{local:[8]},   GT:{local:[8]},  HN:{local:[8]},
  NI:{local:[8]},  PA:{local:[7,8,9]},  CU:{local:[8]},
  // EUROPA occ./norte
  ES:{local:[9],  start:/^[6789]/}, PT:{local:[9]}, FR:{local:[9,10]}, IT:{local:[9,10,11]},
  DE:{local:[10,11]}, GB:{local:[10,11]}, IE:{local:[9]}, NL:{local:[9,10]}, BE:{local:[8,9]},
  LU:{local:[8,9]}, CH:{local:[9]}, AT:{local:[10]}, DK:{local:[8]}, NO:{local:[8]},
  SE:{local:[9,10]}, FI:{local:[9,10]}, IS:{local:[7]},
  // EUROPA centro/este
  PL:{local:[9]}, CZ:{local:[9]}, SK:{local:[9]}, HU:{local:[9]},
  RO:{local:[9,10]}, BG:{local:[9]}, GR:{local:[10]}, CY:{local:[8]},
  MT:{local:[8]}, SI:{local:[8,9]}, HR:{local:[9]}, RS:{local:[9]}, BA:{local:[8,9]},
  MK:{local:[8,9]}, AL:{local:[9]}, ME:{local:[8,9]}, UA:{local:[9]}
};

// países NANP para validar prefijos +1
const NANP = new Set(["US","CA","PR","DO","JM","TT","BS","BB"]);

// Normaliza a local o +cc… según lo que venga
function _normalizePhone(raw, iso="ES", cc=""){
  const d = _digits(raw);
  if (!d) return null;

  // Si viene con prefijo internacional tipo +CC o 00CC
  const ccClean = String(cc||"").replace(/\D/g,"");
  if (/^\+?\d{1,3}/.test(raw) || /^00\d+/.test(raw)) {
    // quita 00
    const d2 = d.startsWith("00") ? d.slice(2) : d;
    // si empieza por CC del país, quita CC para validar local
    if (ccClean && d2.startsWith(ccClean)) {
      const nsn = d2.slice(ccClean.length);
      return { e164: `+${ccClean}${nsn}`, local: nsn, hasCC:true };
    }
    // si es NANP y empieza por 1 (US/CA/PR/DO…)
    if (NANP.has(iso) && d2.startsWith("1") && d2.length===11) {
      return { e164: `+1${d2.slice(1)}`, local: d2.slice(1), hasCC:true };
    }
    // fallback e164 si 8–15 dígitos
    if (d2.length>=8 && d2.length<=15) return { e164: `+${d2}`, local: d2, hasCC:true };
    return null;
  }

  // Sin prefijo → local
  return { e164: (ccClean? `+${ccClean}${d}` : null), local: d, hasCC:false };
}

function _isFakePattern(numDigits){
  if (numDigits.length < 7) return true;
  if (_BAD_RUN.test(numDigits)) return true;
  if (_ASC_DESC.test(numDigits)) return true;
  if (_uniqCount(numDigits) <= 2) return true; // 666666666, 808080808, etc.
  return false;
}

function filterPhonesGlobal(list, iso="ES", cc=""){
  const rule = PHONE_RULES[iso] || null;
  const seen = new Set();
  const out  = [];

  for (const raw of (list||[])){
    const norm = _normalizePhone(raw, iso, cc);
    if (!norm) continue;

    const local = norm.local;                 // solo dígitos
    const e164  = norm.e164 || null;
    if (_isFakePattern(local)) continue;

    // Validación por país (si hay reglas)
    let pass = true;
    if (rule) {
      if (!rule.local.includes(local.length)) pass = false;
      if (pass && rule.start) {
        if (!rule.start.test(local[0])) pass = false;
      }
    } else {
      // Fallback genérico: 8–12 dígitos locales
      if (local.length < 8 || local.length > 12) pass = false;
    }
    if (!pass) continue;

    // Clave de unicidad: prioriza E.164 cuando haya
    const key = e164 ? e164 : `${iso}:${local}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push(e164 || local);
  }
  return out;
}

// 🔵/🔴 Pintar icono al cargar la página (sin esperar a “Extract”)
(async () => {
  const n = normUrlForStore(location.href);
  const visited = await loadVisitedSet();
  if (n && visited.has(n)) {
    setIcon("saved");   // AZUL
  } else {
    setIcon("never");   // ROJO
  }
})();

// ================================
// Listener principal
// ================================
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.action === "ping") { sendResponse({ ok: true }); return; }
  if (msg?.action !== "extract") return;

  // Al iniciar cualquier extracción (profunda o no), muestra amarillo
  setIcon("loading");

  (async () => {
    try {
      // 1) Cargar módulos
      const {
        extractEmails,
        extractPhones,
        deepScanUrls,
        extractKeyLinks,
        sameOriginDeepScanCandidates,
        extractSocial,
        detectTechnology
      } = await loadModules();

      // 2) País desde options
      const country = msg?.options?.country || "ES";

      // 2.1) Flag de deep scan — ¡declarar SOLO una vez!
      const deepScanEnabled = Boolean(msg?.options?.deepScan);


      // === Fallback con iframe (misma-origen) para páginas que requieren JS ===
      async function extractViaIframe(url, { extractEmails, extractPhones, country }) {
        return new Promise(async (resolve) => {
          let ifr;
          const done = (out) => { try { if (ifr && ifr.remove) ifr.remove(); } catch {} resolve(out); };

          try {
            ifr = document.createElement("iframe");
            ifr.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:800px;height:800px;opacity:0;pointer-events:none;";
            // mismo origen → acceso al DOM
            ifr.setAttribute("sandbox", "allow-same-origin allow-scripts");
            ifr.src = url;
            document.documentElement.appendChild(ifr);

            ifr.onload = async () => {
              try {
                const doc = ifr.contentDocument;
                if (!doc) return done({ emails: [], phones: [] });

                // Ejecuta extractores contra el DOM del iframe
                const emails = (extractEmails({ root: doc }) || []).filter(Boolean);

                const phonesRes = await extractPhones(country, {
                  root: doc,
                  worldOnly: country === "INTL",
                  returnMeta: false
                });
                const phones = Array.isArray(phonesRes) ? phonesRes : (phonesRes?.list || []);

                done({ emails, phones });
              } catch {
                done({ emails: [], phones: [] });
              }
            };

            // timeout de seguridad
            setTimeout(() => done({ emails: [], phones: [] }), 6000);
          } catch {
            done({ emails: [], phones: [] });
          }
        });
      }

      // 3) Pre-carga opcional (solo si hay deep scan)
      if (deepScanEnabled) {
        await autoScrollStealth({ ms: 1200, mode: "hide" });
        // await hoverEmailsHints();
      }

      // 4) H1 básico
      const h1El = document.querySelector("h1, .page-title, .site-title");
      const h1 = h1El ? (h1El.textContent || "").trim().slice(0, 140) : "";

      // 5) Emails (array) y teléfonos desde el extractor por país
      const emails0 = extractEmails({});
      const phonesRes = await extractPhones(country, {
        worldOnly: country === "INTL",
        returnMeta: false
      });
      const phonesFromExtractor = Array.isArray(phonesRes) ? phonesRes : (phonesRes?.list || []);

      // 6) Enlaces + social + tecnología
      const bestLinks   = extractKeyLinks();
      const socialLinks = extractSocial();
      const technology  = detectTechnology(location.href);

      // 7) PREPARA los sets *fuera* del if, para poder usarlos en toda la función
      let emailsSet = new Set(Array.isArray(emails0) ? emails0 : []);
      let phonesSet = new Set(Array.isArray(phonesFromExtractor) ? phonesFromExtractor : []);

      // 👉 aquí guardaremos las URLs realmente visitadas en el deep scan
      const visitedUrlsSet = new Set();

      // ===== Helpers =====
      const stripDia = (s) => String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const normText = (s) => stripDia(s).toLowerCase().replace(/\s+/g, " ").trim();
      const normPath = (p) => {
        try { p = decodeURIComponent(p); } catch {}
        p = String(p||"").replace(/[-_\/]+/g, " ");
        return normText(p).replace(/[–—]/g,'-').replace(/[\u2019\u2018\u2032]/g,"'");
      };
      function matchesAny(str, list) {
        const n = normText(String(str||"").replace(/[-_\/]+/g, " "));
        return list.some(p => n.includes(p));
      }
      const TLD_LANG = { fr:"fr", es:"es", mx:"es", ar:"es", cl:"es", pe:"es", uy:"es", py:"es", bo:"es",
                         it:"it", pt:"pt", br:"pt", us:"en", uk:"en", co:"es", ve:"es", do:"es", de:"en" };

      function detectPageLang(doc, url) {
        const htmlLang = (doc.documentElement.getAttribute("lang") || doc.documentElement.getAttribute("xml:lang") || "").toLowerCase();
        if (htmlLang) { const base = htmlLang.slice(0,2); if (["fr","es","it","pt","en"].includes(base)) return base; }
        const metaLang = (doc.querySelector('meta[http-equiv="content-language"]')?.getAttribute("content") || "").toLowerCase();
        if (metaLang) { const base = metaLang.slice(0,2); if (["fr","es","it","pt","en"].includes(base)) return base; }
        try { const u = new URL(url); const tld = (u.hostname.split(".").pop() || "").toLowerCase(); if (TLD_LANG[tld]) return TLD_LANG[tld]; } catch {}
        const bodyText = normText(doc.body?.innerText || "");
        const sets = {
          fr: ["mentions legales","politique de confidentialite","donnees personnelles","cgu","cgv","assistance","aide","service client","nous contacter"],
          es: ["aviso legal","politica de privacidad","proteccion de datos","terminos","condiciones","soporte","ayuda","contacto"],
          it: ["informativa sulla privacy","dati personali","note legali","termini","condizioni","assistenza","aiuto","contatti"],
          pt: ["politica de privacidade","dados pessoais","aviso legal","termos","condicoes","suporte","ajuda","contato","contacto"],
          en: ["privacy policy","personal data","legal notice","terms","support","help","contact","imprint"]
        };
        let best="en", bestScore=-1;
        for (const [k, arr] of Object.entries(sets)) {
          let s=0; for (const w of arr) if (bodyText.includes(normText(w))) s++;
          if (s>bestScore){ bestScore=s; best=k; }
        }
        return best;
      }

      function buildCatPatterns(lang="en") {
        const P = { contact:[], privacy:[], legal:[], terms:[], cookies:[], returns:[], shipping:[] };
        P.contact.push("contact","support","help","assistance","customer service","get in touch","talk to us");
        P.privacy.push("privacy policy","privacy","personal data","data protection","gdpr");
        P.legal.push("legal notice","imprint");
        P.terms.push("terms","terms and conditions","terms of service","conditions");
        P.cookies.push("cookies","cookie policy");
        P.returns.push("returns","return policy","refund policy","refunds","exchanges");
        P.shipping.push("shipping","delivery","shipping policy","delivery information");

        if (lang==="fr") {
          P.contact.push("contact","contactez nous","contactez-nous","nous contacter","service client","assistance","aide","sav","infos-support","infos support");
          P.privacy.push("politique de confidentialite","donnees personnelles","protection des donnees","rgpd");
          P.legal.push("mentions legales");
          P.terms.push("cgu","cgv","conditions generales","conditions generales de vente","conditions dutilisation");
          P.cookies.push("politique des cookies");
          P.returns.push("retours","remboursement","politique de remboursement","echanges");
          P.shipping.push("livraison","expedition");
        }
        if (lang==="es") {
          P.contact.push("contacto","soporte","ayuda","asistencia","atencion al cliente","servicio al cliente","habla con nosotros","escribenos","escríbenos");
          P.privacy.push("politica de privacidad","privacidad","datos personales","proteccion de datos","rgpd");
          P.legal.push("aviso legal");
          P.terms.push("terminos","terminos y condiciones","condiciones","condiciones de uso","condiciones generales de venta");
          P.cookies.push("politica de cookies");
          P.returns.push("devoluciones","política de devolución","reembolso","cambios");
          P.shipping.push("envio","envíos","entrega","política de envío");
        }
        if (lang==="it") {
          P.contact.push("contatti","assistenza","aiuto","servizio clienti","scrivici");
          P.privacy.push("informativa sulla privacy","dati personali");
          P.legal.push("note legali");
          P.terms.push("termini","termini e condizioni","condizioni d'uso");
          P.cookies.push("cookie policy");
          P.returns.push("resi","rimborso","cambi");
          P.shipping.push("spedizione","consegna");
        }
        if (lang==="pt") {
          P.contact.push("contato","contacto","suporte","ajuda","assistencia","atendimento","fale conosco");
          P.privacy.push("politica de privacidade","dados pessoais","protecao de dados","rgpd");
          P.legal.push("aviso legal");
          P.terms.push("termos","condicoes","termos de uso");
          P.cookies.push("politica de cookies");
          P.returns.push("devolucoes","reembolso","trocas");
          P.shipping.push("envio","entrega","politica de envio");
        }
        for (const k of Object.keys(P)) P[k] = P[k].map(normText);
        return P;
      }

      function classifyLink(href, text, PATS) {
        const p = normPath(new URL(href, location.href).pathname);
        const t = normText(text || "");
        const inBoth = (list) => matchesAny(p, list) || matchesAny(t, list);
        let found = null;
        if (inBoth(PATS.contact))  found = "contact";
        else if (inBoth(PATS.privacy))  found = "privacy";
        else if (inBoth(PATS.legal))    found = "legal";
        else if (inBoth(PATS.terms))    found = "terms";
        return found;
      }

      function isAllowedDeepUrl(href, PATS, rootUrl = location.href) {
        try {
          const u = new URL(href, rootUrl);
          const r = new URL(rootUrl);
          if (u.hostname !== r.hostname) return false; // mismo dominio
          if (!/^https?:$/.test(u.protocol)) return false;

          const cleanPath = normPath(u.pathname);
          if (ALLOW_ALWAYS_RE.test(cleanPath)) return true;
          if (ECOMMERCE_SKIP_RE.test(cleanPath)) return false;

          for (const key of u.searchParams.keys()) {
            if (BAD_QUERY_KEYS.has(String(key).toLowerCase())) return false;
          }
        } catch { return false; }
        const cat = classifyLink(href, "", PATS);
        return Boolean(cat);
      }

      const ALLOW_ALWAYS_RE = /\/policies\/(contact-information|privacy-policy|terms-of-service|legal|legal-notice|impressum)\b/i;
      const ECOMMERCE_SKIP_RE =
        /\/(?:products?|collections?|cart|checkout|account|wishlist|login|register|sign[-_ ]?in|sign[-_ ]?up|search|track[-_ ]?order|compare|quick[-_ ]?view|add[-_ ]?to[-_ ]?cart)\b/i;
      const BAD_QUERY_KEYS = new Set([
        "variant","sku","add","quantity","size","color","attribute","option",
        "utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid","fbclid"
      ]);

      function normalizeUrl(base, href) {
        try {
          const u = new URL(href, base);
          if (!/^https?:$/.test(u.protocol)) return null;
          ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid","fbclid"].forEach(k => u.searchParams.delete(k));
          u.hash = "";
          return u.toString();
        } catch { return null; }
      }

      function getCandidateAnchors() {
        const sels = [
          "footer a[href]", ".footer a[href]", "#footer a[href]", ".site-footer a[href]", "[role='contentinfo'] a[href]",
          "header a[href]", "#header a[href]", ".site-header a[href]", "[role='banner'] a[href]",
          "nav a[href]", "nav[role='navigation'] a[href]", ".main-menu a[href]", ".menu a[href]"
        ];
        const nodes = new Set();
        sels.forEach(sel => document.querySelectorAll(sel).forEach(a => nodes.add(a)));
        if (nodes.size === 0) {
          document.querySelectorAll("a[href]").forEach(a => {
            const cs = getComputedStyle(a);
            const hidden = (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0");
            const r = a.getBoundingClientRect();
            if (!hidden && !(r.width === 0 && r.height === 0) && !(r.bottom < 0)) nodes.add(a);
          });
        }
        const out = [];
        const seen = new Set();
        for (const a of nodes) {
          const href = a.getAttribute("href") || "";
          const txt  = a.textContent || a.getAttribute("aria-label") || a.title || "";
          const key  = `${href}::${normText(txt)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(a);
        }
        return out;
      }

      // 7) Deep scan (mismo origen) si está habilitado — solo ACTUALIZA los sets
      if (deepScanEnabled) {
                // 🧩 NUEVO: leer el DOM real (renderizado) antes de explorar
        let htmlInPage = "";
        try {
          htmlInPage = document.documentElement.outerHTML;
          const domDoc = new DOMParser().parseFromString(htmlInPage, "text/html");
          // extrae emails del DOM actual antes de hacer fetch
          const eNow = extractEmails({ root: domDoc }) || [];
          eNow.forEach(v => emailsSet.add(v));
        } catch (err) {
          console.warn("[DeepScan Hybrid] No se pudo leer DOM renderizado:", err);
        }

        const lang = detectPageLang(document, location.href);
        const PATS = buildCatPatterns(lang);
        const maxTotal = 5;

        const planActualRaw = Array.isArray(msg?.options?.planActual) ? msg.options.planActual : [];
        const planActual = Array.from(new Set(
          planActualRaw.map(u => normalizeUrl(location.href, u)).filter(Boolean)
        )).filter(u => isAllowedDeepUrl(u, PATS, location.href));

        const seedsRaw = sameOriginDeepScanCandidates(bestLinks) || [];
        const seeds = Array.from(new Set(
          seedsRaw.map(u => normalizeUrl(location.href, u)).filter(Boolean)
        )).filter(u => isAllowedDeepUrl(u, PATS, location.href));

        const base = new URL(location.href);
        const anchors = getCandidateAnchors().map(a => {
          const full = normalizeUrl(location.href, a.getAttribute("href") || "");
          if (!full) return null;
          try {
            const u = new URL(full);
            if (u.origin !== base.origin) return null;
            if (!isAllowedDeepUrl(full, PATS, location.href)) return null;
            const label = a.textContent || a.getAttribute("aria-label") || a.title || "";
            const cat = classifyLink(full, label, PATS);
            if (!cat) return null;
            return { href: full, cat };
          } catch { return null; }
        }).filter(Boolean);

        // POOL + scoring
        const weights = { contact: 90, privacy: 80, legal: 75, terms: 72 };
        const scoreCategorized = (u, baseUrl, category) => {
          let s = weights[category] || 0;
          const b = new URL(baseUrl); const x = new URL(u, baseUrl);
          if (x.origin === b.origin) s += 10;
          const depth = x.pathname.split("/").filter(Boolean).length;
          s += Math.max(0, 6 - Math.min(depth, 6));
          return s;
        };
        const POOL = new Map();
        const add = (href, cat) => {
          const sc = scoreCategorized(href, location.href, cat);
          const prev = POOL.get(href);
          if (!prev || sc > prev.score) POOL.set(href, { href, cat, score: sc });
        };
        for (const u of seeds)     { const cat = classifyLink(u, "", PATS); if (cat) add(u, cat); }
        for (const u of planActual){ const cat = classifyLink(u, "", PATS); if (cat) add(u, cat); }
        for (const it of anchors)  add(it.href, it.cat);

        const catOrder = ["contact","privacy","legal","terms"];
        let finalPlan = Array.from(POOL.values())
          .sort((a,b) => {
            const pa = catOrder.indexOf(a.cat), pb = catOrder.indexOf(b.cat);
            if (pa !== pb) return pa - pb;
            return (b.score - a.score) || a.href.localeCompare(b.href);
          })
          .map(x => x.href);

        finalPlan = finalPlan.filter(u => isAllowedDeepUrl(u, PATS, location.href));

        const allowFallback = msg?.options?.allowFallback ?? true;
        if (allowFallback && finalPlan.length < maxTotal) {
          const extras = new Set(finalPlan);
          const fallbackCandidates = [
            ...seeds.map(u => u),
            ...anchors.map(it => it.href)
          ]
            .filter(href => href && !extras.has(href))
            .filter(href => isAllowedDeepUrl(href, PATS, location.href));

          for (const href of fallbackCandidates) {
            finalPlan.push(href);
            if (finalPlan.length >= maxTotal) break;
          }
        }
        finalPlan = finalPlan.slice(0, maxTotal);

        // Ejecutar deep scan
        const hud = createDeepProgressBar();
        await deepProgressSet({
          running: true, index: 0, total: finalPlan.length, url: "",
          emails: emailsSet.size, phones: phonesSet.size,
          startedAt: Date.now(), finishedAt: 0, lastError: ""
        });
        setIcon("loading");

        try {
          // 1) Paso rápido: deepScan por fetch/HTML estático
          const { emails: e2, phones: p2 } = await deepScanUrls(finalPlan, {
            origin: location.href,
            country,
            cc: (msg?.options?.cc || ""),
            extractEmailsFn: extractEmails,
            extractPhonesFn: extractPhones,
            onProgress: ({ index, total, url, emailsFound, phonesFound, status }) => {
              if (url) {
                visitedUrlsSet.add(url);
                try {
                  chrome.runtime.sendMessage(
                    { action: "deepScan:visitedUrl", url, index, total },
                    () => { void chrome.runtime?.lastError; }
                  );
                } catch {}
              }
              hud.update({ index, total, url });
              deepProgressSet({
                running: true,
                index, total, url,
                emails: (emailsSet.size + (emailsFound || 0)),
                phones: (phonesSet.size + (phonesFound || 0)),
                lastError: (status && status.type === "error") ? status.message : ""
              });
            }
          });

          (Array.isArray(e2) ? e2 : []).forEach(v => emailsSet.add(v));
          (Array.isArray(p2) ? p2 : []).forEach(v => phonesSet.add(v));

          // 2) Fallback: si no hubo emails con el fetch, intenta con iframe (misma-origen)
          if (emailsSet.size === 0) {
            for (const url of finalPlan) {
              try {
                const { emails, phones } = await extractViaIframe(url, { extractEmails, extractPhones, country });
                (emails || []).forEach(e => emailsSet.add(e));
                (phones || []).forEach(p => phonesSet.add(p));
                if (emailsSet.size > 0) break; // ya tenemos alguno; puedes seguir si quieres más
              } catch {}
            }
          }

        } catch (err) {
          await deepProgressSet({ lastError: (err?.message || String(err)) });
        }

        // Cierre HUD / estado (antes estaba en finally)
        await deepProgressSet({
          running: false,
          index: finalPlan.length,
          total: finalPlan.length,
          url: "",
          emails: emailsSet.size,
          phones: phonesSet.size,
          finishedAt: Date.now()
        });

        try {
          chrome.runtime.sendMessage(
            { action: "deepScan:complete", visited: Array.from(visitedUrlsSet), total: finalPlan.length },
            () => { void chrome.runtime?.lastError; }
          );
        } catch {}
        const n = normUrlForStore(location.href);
        await saveVisitedUrl(n);
        setIcon("saved");
        hud.finish();
        setTimeout(() => { deepProgressReset(); }, 30_000);
        
      }

      // 🧩 Fallback final dentro del scope (verifica DOM actual si no hay emails)
      if (emailsSet.size === 0) {
        try {
          const htmlNow = document.documentElement.outerHTML;
          const docNow = new DOMParser().parseFromString(htmlNow, "text/html");
          const eAgain = extractEmails({ root: docNow }) || [];
          eAgain.forEach(v => emailsSet.add(v));
          console.log("[Hybrid Scan] Correos añadidos tras fallback DOM:", eAgain);
        } catch (err) {
          console.warn("[Hybrid Scan] Error al analizar DOM final:", err);
        }
      }

      // 8) Respuesta final (con filtros)
      const ccFromPopup = (msg?.options?.cc || "").replace(/\D/g,"");
      const phonesStep1 = filterPhonesES([...phonesSet], country);
      const phonesClean = (country || "ES").toUpperCase() === "ES"
        ? phonesStep1
        : filterPhonesGlobal([...phonesSet], (country||"ES").toUpperCase(), ccFromPopup);

      // Guardar SIEMPRE la URL actual (aunque no haya deep scan) y dejar icono en azul
      try {
        const n = normUrlForStore(location.href);
        await saveVisitedUrl(n);
        setIcon("saved");
      } catch (e) {
        console.debug("[EL] saveVisitedUrl (shallow) failed:", e);
      }

      sendResponse({
        h1,
        emails: [...emailsSet],
        phones: phonesClean,
        bestLinks,
        socialLinks,
        technology,
        visitedUrls: Array.from(visitedUrlsSet)
      });

    } catch (e) {
      console.error("[Extractor] Error en content/main.js:", e);
      sendResponse({
        error:
          "Error al extraer: " +
          (e?.message || String(e)) +
          " — revisa que existan los archivos en content/extractors/* y estén permitidos en web_accessible_resources.",
      });
    }
  })();

  return true; // asíncrono
});



function createDeepProgressBar() {
  const id = "el-deep-hud";
  let mount = document.getElementById(id);
  if (mount) mount.remove();

  mount = document.createElement("div");
  mount.id = id;
  mount.setAttribute("style", `
    position: fixed; left: 12px; bottom: 12px; z-index: 2147483647;
    min-width: 260px; max-width: 360px; padding: 10px 12px;
    background: rgba(0,0,0,.78); color: #fff; font: 12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    border-radius: 12px; box-shadow: 0 6px 16px rgba(0,0,0,.35); backdrop-filter: blur(4px);
  `);

  const title = document.createElement("div");
  title.textContent = "Exploración profunda";
  title.style.fontWeight = "600";
  title.style.marginBottom = "6px";
  title.style.color = "#27cdf2"; // tu cian de marca

  const urlLine = document.createElement("div");
  urlLine.textContent = "Visitando: —";
  urlLine.style.margin = "4px 0 6px 0";
  urlLine.style.wordBreak = "break-all";

  const meterWrap = document.createElement("div");
  meterWrap.style.height = "8px";
  meterWrap.style.background = "rgba(255,255,255,.18)";
  meterWrap.style.borderRadius = "999px";
  meterWrap.style.overflow = "hidden";

  const meter = document.createElement("div");
  meter.style.height = "100%";
  meter.style.width = "0%";
  meter.style.background = "#f2bb13"; // amarillo
  meter.style.transition = "width .25s ease";
  meterWrap.appendChild(meter);

  const stats = document.createElement("div");
  stats.textContent = "0 / 0 páginas (0%)";
  stats.style.marginTop = "6px";
  stats.style.opacity = ".9";

  const close = document.createElement("button");
  close.textContent = "Ocultar";
  close.style.cssText = `
    margin-top: 8px; border: 0; padding: 6px 10px; cursor: pointer; border-radius: 10px;
    background: #f24738; color: #fff; font-weight: 600;
  `;
  close.onclick = () => mount.remove();

  mount.appendChild(title);
  mount.appendChild(urlLine);
  mount.appendChild(meterWrap);
  mount.appendChild(stats);
  mount.appendChild(close);
  document.documentElement.appendChild(mount);

  return {
    update({ index, total, url }) {
      const done = Math.max(0, index);
      const tot = Math.max(0, total);
      const pct = tot ? Math.min(100, Math.round((done / tot) * 100)) : 0;

      if (url) urlLine.textContent = `Visitando: ${url}`;
      meter.style.width = `${pct}%`;
      stats.textContent = `${done} / ${tot} páginas (${pct}%)`;
      if (typeof arguments[1] !== "undefined") {
        const ef = arguments[1]?.emailsFound ?? null;
        const pf = arguments[1]?.phonesFound ?? null;
        if (ef !== null || pf !== null) {
          stats.textContent += ` • +${ef ?? 0} emails • +${pf ?? 0} teléfonos`;
        }
      }
    },
    finish() {
      stats.textContent += " • Completado";
      meter.style.background = "#28a745"; // verde ✅
      // auto-ocultar después de 3 segundos
      setTimeout(() => { try { mount.remove(); } catch {} }, 1500);
    }
  };
}

// === Estado de progreso global (para el popup) ===
async function deepProgressSet(patch) {
  const prev = (await chrome.storage.local.get({ deepProgress: {} })).deepProgress || {};
  const next = { ...prev, ...patch };
  await chrome.storage.local.set({ deepProgress: next });
  return next;
}
async function deepProgressReset() {
  await chrome.storage.local.set({ deepProgress: {
    running: false, index: 0, total: 0, url: "", emails: 0, phones: 0, startedAt: 0, finishedAt: 0, lastError: ""
  }});
}
