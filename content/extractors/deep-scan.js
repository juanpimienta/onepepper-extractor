// content/extractors/deep-scan.js
import { decodeHtmlEntities, deobfuscateAtDot } from "./obfuscation.js";

/* =================== Flag en storage (segura para MV3 y tests) =================== */
async function isDeepScanEnabled(){
  try{
    const { deepScanEnabled } = (await chrome?.storage?.local?.get?.("deepScanEnabled")) || {};
    return !!deepScanEnabled;
  }catch{
    return false;
  }
}

/* =================== Páginas candidatas típicas (multilenguaje; export público) =================== */
export const HINTS = [
  // Contacto / Ayuda / Soporte
  "/contacto","/contact","/contact-us","/contacts","/support","/soporte","/ayuda","/help","/assistance",
  "/contactez-nous","/contato","/suporte","/ajuda","/contatti","/assistenza","/aiuto",
  // Legal
  "/aviso-legal","/aviso_legal","/legal","/legal-notice","/impressum",
  "/mentions-legales","/mentions-l%C3%A9gales","/note-legali","/note%20legali",
  // Privacidad / Privacy
  "/privacy","/privacy-policy","/politica-de-privacidad","/politica-privacidad","/politica%20de%20privacidad",
  "/politique-de-confidentialite","/politique-de-confidentialit%C3%A9","/politique-confidentialite",
  "/politica-de-privacidade","/politica%20de%20privacidade",
  "/informativa-privacy","/informativa-sulla-privacy","/informativa%20sulla%20privacy",
  // Términos / Condiciones
  "/terminos","/terminos-y-condiciones","/terminos%20y%20condiciones",
  "/terms","/terms-and-conditions","/terms-of-service","/tos","/conditions","/conditions-generales",
  "/conditions-g%C3%A9n%C3%A9rales","/conditions-d-utilisation","/conditions-d%E2%80%99utilisation",
  "/termos","/termos-e-condicoes","/termos-de-uso",
  "/termini-e-condizioni","/condizioni-d-uso","/condizioni%20d'uso",
  // Cookies
  "/cookies","/cookie","/cookie-policy","/politica-de-cookies","/politica%20de%20cookies",
  "/politique-de-cookies","/politique-des-cookies","/politica-de-cookies",
  "/politica-sui-cookie","/cookie-policy"
];

/* --- Palabras clave normalizadas para *fallback* robusto (interno) --- */
const HINT_KEYWORDS = [
  "contacto","contact","contact us","contacts","support","soporte","suporte",
  "assistance","assistenza","help","ayuda","aide","contactez nous","contato","ajuda","contatti","aiuto",
  "legal","aviso legal","legal notice","impressum","mentions legales","note legali",
  "privacy","privacy policy","politica de privacidad","politique de confidentialite",
  "politica de privacidade","informativa privacy","informativa sulla privacy",
  "terminos","terminos y condiciones","terms","terms and conditions","terms of service",
  "conditions","conditions generales","conditions d utilisation",
  "termos","termos e condicoes","termos de uso",
  "termini e condizioni","condizioni d uso",
  "cookies","cookie policy","politica de cookies","politique des cookies","politica sui cookie"
];

/* =================== Email helpers =================== */
const EMAIL_CORE = "[a-zA-Z0-9._%+\\-]{1,64}";
const AT  = "(?:@|\\(at\\)|\\[at\\]|\\{at\\}|\\s+at\\s+|\\s?arroba\\s?)";
const DOT = "(?:\\.|\\(dot\\)|\\[dot\\]|\\{dot\\}|\\s+dot\\s+|\\s?punto\\s?)";
const HOST_LABEL = "[a-zA-Z0-9-]{1,63}";
const HOST_DOT   = `(?:\\.|${DOT})`;
const HOST_CORE  = `(?:${HOST_LABEL}${HOST_DOT}){1,8}[a-zA-Z]{2,63}`;
const RX_EMAIL   = new RegExp(`\\b(${EMAIL_CORE}\\s*(?:${AT})\\s*${HOST_CORE})\\b`, "gi");

function cleanEmail(e){
  return String(e).toLowerCase()
    .replace(/\(at\)|\[at\]|\{at\}|\s+at\s+|arroba/gi, '@')
    .replace(/\(dot\)|\[dot\)|\{dot\}|\s+dot\s+|\s?punto\s?/gi, '.')
    .replace(/\s+/g, '');
}

const FAKE_TLDS    = new Set(["example","invalid","localhost","local","test","fake","demo","null"]);
const FAKE_DOMAINS = new Set([
  "example.com","example.org","example.net","correo.com","dominio.com",
  "midominio.com","tudominio.com","sudominio.com","domain.com",
  "website.com","mysite.com","yoursite.com","yourdomain.com","tudominio.es",
  "email.com","proveedores.com", "configurablerecsservice.prod.euamazon"
]);
// Localparts típicos de plantilla
const FAKE_LOCALS  = new Set([
  "email","tuemail","youremail","myemail","miemail","name","nombre",
  "username","usuario","test","demo","sample","yourname","tunombre",
  "correo","mail"
]);

function isFakeEmail(e){
  const [local, host=""] = String(e).toLowerCase().split("@");
  if (!local || !host) return true;
  if (FAKE_DOMAINS.has(host)) return true;
  const tld = (host.split(".").pop() || "");
  if (FAKE_TLDS.has(tld)) return true;
  if (FAKE_LOCALS.has(local)) return true;
  if (/^(youremail|tuemail|name|nombre|test|demo|sample)[._\-]?\d*/.test(local)) return true;
  if (/^ima[\w\-_]*$/.test(local)) return true;
  if (/^(img|image|photo|foto)[\w\-_]*$/.test(local)) return true;
  if (/\.(png|jpg|jpeg|gif|bmp|svg)$/i.test(host)) return true;
  return false;
}

/* =================== Cloudflare email decode (data-cfemail) =================== */
function decodeCfEmail(hex) {
  if (!hex || typeof hex !== "string") return null;
  try {
    const r = parseInt(hex.substr(0, 2), 16);
    let out = "";
    for (let i = 2; i < hex.length; i += 2)
      out += String.fromCharCode(parseInt(hex.substr(i, 2), 16) ^ r);
    return out || null;
  } catch { return null; }
}

function preprocessForCfEmail(doc) {
  const nodes = doc.querySelectorAll("[data-cfemail]");
  nodes.forEach(el => {
    const hex = el.getAttribute("data-cfemail");
    const dec = decodeCfEmail(hex);
    if (dec && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dec)) {
      el.textContent = dec;
      const a = el.closest('a[href^="/cdn-cgi/l/email-protection"]');
      if (a) a.setAttribute("href", "mailto:" + dec);
      el.setAttribute("data-decoded-email", dec);
    }
  });
}

/* ============== Emails desde JSON-LD (Schema.org) ================= */
function emailsFromJsonLd(doc) {
  const found = new Set();
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  scripts.forEach(s => {
    try {
      const j = JSON.parse(s.textContent || "{}");
      const bucket = Array.isArray(j) ? j : [j];
      bucket.forEach(obj => {
        const candidates = [
          obj?.email,
          obj?.contactPoint?.email,
          ...(Array.isArray(obj?.contactPoint) ? obj.contactPoint.map(c => c?.email) : [])
        ].flat().filter(Boolean);
        for (const e of (candidates || [])) {
          const cleaned = cleanEmail(String(e));
          if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) && !isFakeEmail(cleaned)) {
            found.add(cleaned);
          }
        }
      });
    } catch {}
  });
  return Array.from(found);
}

function emailsFromText(text){
  const out = new Set();
  RX_EMAIL.lastIndex = 0;
  let m;
  while ((m = RX_EMAIL.exec(text))){
    const cleaned = cleanEmail(m[1]);
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) && !isFakeEmail(cleaned)) {
      out.add(cleaned);
    }
  }
  return Array.from(out);
}

/* =================== Phone helpers (ES estricto + INTL básico) =================== */
const SEP = "[\\s\\-\\.\\(\\)\\u00A0\\u202F]*";
const ES_BODY = `[6789](?:${SEP}\\d){8}`;
const ES_WITH_CC = `(?:(?:\\+|00)?34${SEP})?(${ES_BODY})`;
const RX_ES_PHONE = new RegExp(`\\b${ES_WITH_CC}\\b`, "g");

function phonesFromText(text, country){
  const out = new Set();
  if (country === "ES" || country === "es" || country === "Spain") {
    let m; 
    while((m = RX_ES_PHONE.exec(text))){
      const only = (m[1] || "").replace(/[\s\-\.\(\)\u00A0\u202F]/g, "");
      if (only) out.add(only);
    }
  } else if (country === "INTL") {
    const RX_INTL = /\+[\d][\d\s\-\.\(\)\u00A0\u202F]{5,18}\d/g;
    let m;
    while ((m = RX_INTL.exec(text))) {
      const only = m[0].replace(/[^\d+]/g, "");
      if (only.length >= 7 && only.length <= 16) out.add(only);
    }
  }
  return Array.from(out);
}

/* =================== Limpieza HTML -> texto =================== */
const RX_SCRIPT = new RegExp("<script[^>]*>[\\s\\S]*?<\\/script>", "gi");
const RX_STYLE  = new RegExp("<style[^>]*>[\\s\\S]*?<\\/style>", "gi");
const RX_TAGS   = new RegExp("<[^>]+>", "g");

function htmlToSearchableText(html){
  const cleaned = html
    .replace(RX_SCRIPT, " ")
    .replace(RX_STYLE,  " ")
    .replace(RX_TAGS,   " ");
  return deobfuscateAtDot(decodeHtmlEntities(cleaned));
}

/* =================== Fetch con timeout (usa cookies si es mismo sitio) =================== */
async function fetchHtml(u, { timeoutMs = 12000, baseOrigin = null } = {}){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try{
    let isSameSite = false;
    try {
      const target = new URL(u);
      const base   = baseOrigin ? new URL(baseOrigin) : null;
      isSameSite   = base ? (target.origin === base.origin) : false;
    } catch {}

    const res = await fetch(u, {
      credentials: isSameSite ? "include" : "omit",
      mode: "cors",
      cache: "no-store",
      signal: ctrl.signal,
      headers: { "Accept": "text/html,application/xhtml+xml" }
    });

    if (!res.ok) return { ok:false, status: res.status, html: "" };
    const html = await res.text();

    // Reintento si el HTML es pequeño (Shopify/Cloudflare placeholders)
    if (isSameSite && html.length < 2500) {
      try {
        const retry = await fetch(u, { credentials: "include", mode: "cors" });
        if (retry.ok) {
          const html2 = await retry.text();
          if (html2.length > html.length) return { ok:true, status:200, html: html2 };
        }
      } catch {}
    }

    return { ok:true, status:200, html };
  }catch(err){
    const message = (err?.name === "AbortError") ? "timeout" : (err?.message || "error");
    return { ok:false, status: 0, html: "", error: message };
  }finally{
    clearTimeout(t);
  }
}

/* =================== PARSE principal (fallback parse) =================== */
function parseDeepContactsFromHtml(html, { country }){
  // 1) Inyecta decode de Cloudflare en el HTML crudo
  html = html.replace(/data-cfemail="([0-9a-fA-F]+)"/g, (m, hex) => {
    const dec = decodeCfEmail(hex);
    return dec ? `data-cfemail="${hex}" data-decoded-email="${dec}"` : m;
  });

  // 2) Texto "limpio" (sin tags) — lo que ya tenías
  const textNoTags = htmlToSearchableText(html);        // quita <script>/<style> y tags
  const emailsFromTextNoTags = emailsFromText(textNoTags);

  // 3) EXTRA NUEVO: texto CRUDO (con scripts + comentarios)
  //    - decodifica entidades y deobfusca at/dot, pero NO quites <script>
  const rawForScan = deobfuscateAtDot(decodeHtmlEntities(String(html || "")));
  const emailsFromRaw = emailsFromText(rawForScan);

  // 4) Añade los data-decoded-email que hayamos inyectado en (1)
  const extraDecoded = Array.from(html.matchAll(/data-decoded-email="([^"]+)"/g))
    .map(m => m[1] || "");

  // 5) Fusiona, valida y deduplica
  const emails = [...new Set(
    [...emailsFromTextNoTags, ...emailsFromRaw, ...extraDecoded]
      .map(cleanEmail)
      .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && !isFakeEmail(e))
  )];

  // 6) Teléfonos desde el texto sin tags (suele ser suficiente)
  const phones = phonesFromText(textNoTags, country);

  return { emails, phones };
}


/* =================== API principal =================== */
export async function deepScanUrls(urls = [], opts = {}) {
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
  const country = (opts.country || "ES").toUpperCase();

  const extractEmailsFn = opts.extractEmailsFn;
  const extractPhonesFn = opts.extractPhonesFn;

  const emails = new Set();
  const phones = new Set();

  const uniq = Array.from(new Set((urls || []).filter(Boolean)));
  onProgress?.({ index: 0, total: uniq.length, url: "" });

  // Base origin: usado para mantener cookies en el mismo dominio
  const baseOrigin = (() => { try { return new URL(uniq[0]).origin; } catch { return null; } })();

  for (let i = 0; i < uniq.length; i++) {
    const u = uniq[i];
    onProgress?.({ index: i, total: uniq.length, url: u });

    const { ok, status, html, error } = await fetchHtml(u, { timeoutMs: 12000, baseOrigin });

    if (!ok) {
      onProgress?.({
        index: i, total: uniq.length, url: u,
        emailsFound: 0, phonesFound: 0,
        status: { type: "error", code: status, message: error || `HTTP ${status}` }
      });
      continue;
    }

    const doc = new DOMParser().parseFromString(html, "text/html");
    preprocessForCfEmail(doc);

    let eFound = [];
    let pFound = [];

    try { if (typeof extractEmailsFn === "function") eFound = extractEmailsFn({ doc }) || []; } catch {}
    if (!eFound.length) {
      try { const eJson = emailsFromJsonLd(doc); if (eJson.length) eFound = eJson; } catch {}
    }
    try {
      if (typeof extractPhonesFn === "function") {
        const res = await extractPhonesFn(country, { worldOnly: country === "INTL", returnMeta: false, doc });
        pFound = Array.isArray(res) ? res : (res?.list || []);
      }
    } catch {}

    // mailto/tel + fallback
    if (!eFound.length) {
      for (const a of Array.from(doc.querySelectorAll('a[href^="mailto:"]'))) {
        const m = (a.getAttribute("href")||"").match(/^mailto:\s*([^?]+)/i);
        if (m && m[1]) (decodeURIComponent(m[1]).split(/[;,]/)).forEach(piece=>{
          const c = cleanEmail(piece);
          if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c) && !isFakeEmail(c)) eFound.push(c);
        });
      }
    }
    if (!pFound.length) {
      for (const a of Array.from(doc.querySelectorAll('a[href^="tel:"]'))) {
        const m = (a.getAttribute("href")||"").match(/^tel:\s*([+0-9()\[\]\s.\-]+)/i);
        if (m && m[1]) {
          const raw = m[1].replace(/[^\d+]/g,"");
          if (/^\+?34[6789]\d{8}$/.test(raw) || /^[6789]\d{8}$/.test(raw)) pFound.push(raw.replace(/^\+?34/,""));
        }
      }
    }
    if (!eFound.length || !pFound.length) {
      const { emails: e2, phones: p2 } = parseDeepContactsFromHtml(html, { country });
      if (!eFound.length) eFound = e2;
      if (!pFound.length) pFound = p2;
    }

    const beforeE = emails.size;
    const beforeP = phones.size;
    (eFound||[]).forEach(e=>{ const c = cleanEmail(e); if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c) && !isFakeEmail(c)) emails.add(c); });
    (pFound||[]).forEach(p=>{ const nsn = String(p).replace(/\D/g,""); if (nsn) phones.add(nsn); });

    onProgress?.({
      index: i + 1, total: uniq.length, url: u,
      emailsFound: emails.size - beforeE,
      phonesFound: phones.size - beforeP,
      status: { type: "ok" }
    });
  }

  onProgress?.({ index: uniq.length, total: uniq.length, url: "" });
  return { emails: Array.from(emails), phones: Array.from(phones) };
}

/* --- Normalización y scoring --- */
function normalizeUrl(base, href) {
  try {
    const u = new URL(href, base);
    if (!/^https?:$/.test(u.protocol)) return null;
    const toDrop = [
      "utm_source","utm_medium","utm_campaign","utm_term","utm_content",
      "gclid","fbclid","mc_cid","mc_eid","pk_campaign","pk_kwd","pk_keyword",
      "irgwc","ref","ref_src","ref_url","aff","affid","affiliate","source"
    ];
    toDrop.forEach(k => u.searchParams.delete(k));
    u.hash = "";
    return u.toString();
  } catch { return null; }
}

function scoreFor(url, baseUrl, { seed = false } = {}) {
  let s = 0;
  if (seed) s += 100;
  const b = new URL(baseUrl);
  const u = new URL(url);
  if (u.origin === b.origin) s += 10;
  const path = u.pathname.toLowerCase();
  if (/(contact|contacto|contatti|contato|contactez|support|soporte|suporte|assistenza|assistance|help|aide|ajuda|aiuto)/.test(path)) s += 40;
  if (/(legal|aviso|mentions|note-legali|privacy|privacidad|confidentialite|privacidade|terms|terminos|condiciones|conditions|termos|termini|cookies|cookie-policy)/.test(path)) s += 30;
  const depth = path.split("/").filter(Boolean).length;
  s += Math.max(0, 7 - Math.min(depth, 6));
  if (/(zendesk|freshdesk|helpscout|desk)/.test(u.hostname)) s += 5;
  return s;
}

const stripDiacritics = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function normalizePath(p){
  try { p = decodeURIComponent(p); } catch {}
  p = p.toLowerCase().replace(/[\u2019\u2018\u2032]/g,"'").replace(/[–—]/g,'-');
  return stripDiacritics(p);
}
function matchesHint(normalizedPath){
  const flat = normalizedPath.replace(/[^a-z0-9]/g, "");
  for (const kw of HINT_KEYWORDS) {
    const k = stripDiacritics(kw.toLowerCase());
    const kDash = k.replace(/\s+/g, "-");
    const kFlat = k.replace(/\s+/g, "");
    if (normalizedPath.includes(kDash) || flat.includes(kFlat)) return true;
  }
  return false;
}

/* --- Emisor de eventos UI --- */
function emitProgress(action, payload, notifyProgress){
  if (!notifyProgress) return;
  try {
    chrome?.runtime?.sendMessage?.({ action, ...payload }, () => { void chrome?.runtime?.lastError; });
  } catch {}
}

/* =================== Cola visitQueue =================== */
async function visitQueue(queue, { visited, timeBudgetMs = 10000, concurrency = 4, notifyProgress = true, parseHtmlForContacts, baseOriginGlobal = null }) {
  const t0 = Date.now();
  const results = { emails: [], phones: [], visitedUrls: [] };
  const total = queue.length;
  let processed = 0;

  const emit = (action, payload) => {
    if (!notifyProgress) return;
    try { chrome?.runtime?.sendMessage?.({ action, ...payload }, () => { void chrome?.runtime?.lastError; }); } catch {}
  };

  async function processOne(u) {
    if (visited.has(u)) return;
    if (Date.now() - t0 > timeBudgetMs) return;
    const html = await fetchHtml(u, { baseOrigin: baseOriginGlobal }); // usa cookies si mismo dominio
    if (!html?.html) return;

    visited.add(u);
    results.visitedUrls.push(u);
    processed++;

    emit("deepScan:visitedUrl", { url: u, index: processed, total });
    emit("deepScan:progress", { url: u, index: processed, total });

    if (typeof parseHtmlForContacts === "function") {
      try {
        const { emailsFound = [], phonesFound = [] } = await parseHtmlForContacts(html.html, u);
        results.emails.push(...emailsFound);
        results.phones.push(...phonesFound);
      } catch {}
    }
  }

  const q = queue.slice();
  const workers = Array.from({ length: concurrency }, async () => {
    while (q.length) {
      if (Date.now() - t0 > timeBudgetMs) break;
      const next = q.shift();
      await processOne(next);
    }
  });

  await Promise.all(workers);

  emit("deepScan:complete", { visited: results.visitedUrls, total });
  return results;
}

/* =================== runDeepScanSimple =================== */
export async function runDeepScanSimple(originDoc, originUrl, opts = {}) {
  const {
    planActual = [],
    maxTotal = 10,
    concurrency = 4,
    timeBudgetMs = 10000,
    notifyProgress = true,
    parseHtmlForContacts,
    extractKeyLinks,
    sameOriginDeepScanCandidates
  } = opts;

  const visited = new Set();
  const aggregate = { emails: [], phones: [], visitedUrls: [] };

  const plan1 = Array.from(new Set(
    (planActual || []).map(u => normalizeUrl(originUrl, u)).filter(Boolean)
  ));
  let pool = plan1.slice();

  // Enlaces clave
  let seedsCandidate = [];
  try {
    if (typeof extractKeyLinks === "function") {
      const best = extractKeyLinks(originDoc) || [];
      if (typeof sameOriginDeepScanCandidates === "function")
        seedsCandidate = sameOriginDeepScanCandidates(best, originUrl) || [];
      else seedsCandidate = best;
    }
  } catch {}

  if (!seedsCandidate.length && originDoc) {
    const base = new URL(originUrl);
    const anchors = Array.from(originDoc.querySelectorAll('a[href]'));
    for (const a of anchors) {
      const full = normalizeUrl(originUrl, a.getAttribute('href') || '');
      if (!full) continue;
      const u = new URL(full);
      if (u.origin !== base.origin) continue;
      const np = normalizePath(u.pathname);
      if (matchesHint(np)) seedsCandidate.push(full);
    }
    if (!seedsCandidate.length) {
      const common = ["/contact","/contacto","/privacy","/legal","/terms","/terminos","/cookies","/impressum"];
      for (const p of common) seedsCandidate.push(new URL(p, base.origin).toString());
    }
  }

  const seeds = Array.from(new Set(
    seedsCandidate.map(u => normalizeUrl(originUrl, u)).filter(Boolean)
  ));
  for (const u of seeds) if (!visited.has(u) && !pool.includes(u)) pool.push(u);

  // Rellenar hasta maxTotal
  if (pool.length < maxTotal && originDoc) {
    const base = new URL(originUrl);
    const anchors = Array.from(originDoc.querySelectorAll('a[href]'))
      .map(a => normalizeUrl(originUrl, a.getAttribute('href') || ''))
      .filter(Boolean);
    for (const full of anchors) {
      const u = new URL(full);
      if (u.origin === base.origin && !pool.includes(full)) {
        pool.push(full);
        if (pool.length >= maxTotal) break;
      }
    }
  }

  const scored = pool.map(u => ({ u, s: scoreFor(u, originUrl, { seed: seeds.includes(u) }) }));
  const finalPlan = scored
    .sort((a,b) => (b.s - a.s) || a.u.localeCompare(b.u))
    .map(x => x.u)
    .slice(0, maxTotal);

  emitProgress("deepScan:plan", { urls: finalPlan }, notifyProgress);

  if (!finalPlan.length) {
    emitProgress("deepScan:progress", { index: 0, total: 0, url: null, empty: true }, notifyProgress);
    return { emails: [], phones: [], visitedUrls: [] };
  }

  const baseOrigin = (() => { try { return new URL(originUrl).origin; } catch { return null; } })();
  const r = await visitQueue(finalPlan, { visited, timeBudgetMs, concurrency, notifyProgress, parseHtmlForContacts, baseOriginGlobal: baseOrigin });

  aggregate.emails.push(...r.emails);
  aggregate.phones.push(...r.phones);
  aggregate.visitedUrls.push(...r.visitedUrls);

  return {
    emails: Array.from(new Set(aggregate.emails)),
    phones: Array.from(new Set(aggregate.phones)),
    visitedUrls: Array.from(new Set(aggregate.visitedUrls))
  };
}
