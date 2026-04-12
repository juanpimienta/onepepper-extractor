// content/extractors/phones/INTL.js
// Genérico UE/LatAm/NANP — DOM + header/footer + a[href] + tel: + schema + WhatsApp → E.164 (+CC)

/* ================== Utils ================== */
const HIDDEN = /[\u200B-\u200D\u2060\u00A0\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g;
const clean   = s => String(s || "").replace(HIDDEN, "").trim();
const onlyDigits = s => clean(s).replace(/[^\d]/g, "");
const stripExt  = s => s.replace(/\s*(?:ext\.?|x|#)\s*\d+\s*$/i, "");
const normPlus  = raw => stripExt(clean(raw).replace(/\(0\)/g, ""));
const uniqBy = (arr, key) => { const m = new Map(); for (const it of arr) if (!m.has(it[key])) m.set(it[key], it); return [...m.values()]; };

/* ================== Config por país ==================
   Reglas pragmáticas (no exhaustivas de plan de numeración, pero robustas para scraping):
   - cc: código país numérico como string
   - trunk0: si el formato nacional usa “0” inicial (se elimina al normalizar)
   - nsn: [min, max] longitud nacional (sin cc, sin trunk)
   - start: regex para primer dígito (o prefijo) del NSN
   - tollfree: prefijos toll-free (se evalúan ANTES de start)
*/
const CFG = {
  // ===== Europa Occidental / Norte =====
  DE: { cc: "49", trunk0: true,  nsn:[8,11],    start:/^[1-9]/, tollfree:["800"] },  // Alemania (variable)
  AT: { cc: "43", trunk0: true,  nsn:[8,12],    start:/^[1-9]/, tollfree:[] },       // Austria
  CH: { cc: "41", trunk0: true,  nsn:[9,9],     start:/^[2-9]/, tollfree:["800"] },  // Suiza
  BE: { cc: "32", trunk0: true,  nsn:[8,9],     start:/^[1-9]/, tollfree:["800"] },  // Bélgica
  NL: { cc: "31", trunk0: true,  nsn:[9,9],     start:/^[1-9]/, tollfree:["800"] },  // Países Bajos
  PT: { cc: "351",trunk0:false,  nsn:[9,9],     start:/^[239]/, tollfree:["800"] },  // Portugal (9 dígitos)
  GB: { cc: "44", trunk0:true,   nsn:[9,10],    start:/^[1-9]/, tollfree:["800","808"] }, // Reino Unido
  IE: { cc: "353",trunk0:false,  nsn:[8,9],     start:/^[1-9]/, tollfree:["1800","800"] }, // Irlanda
  NO: { cc: "47", trunk0:false,  nsn:[8,8],     start:/^[2-9]/, tollfree:["800"] },  // Noruega
  SE: { cc: "46", trunk0:false,  nsn:[7,10],    start:/^[1-9]/, tollfree:["200"] },  // Suecia
  DK: { cc: "45", trunk0:false,  nsn:[8,8],     start:/^[2-9]/, tollfree:["80"] },   // Dinamarca
  FI: { cc: "358",trunk0:false,  nsn:[7,10],    start:/^[1-9]/, tollfree:["800"] },  // Finlandia

  // ===== Europa Sur/Este (algunos ejemplos comunes) =====
  GR: { cc: "30", trunk0:false,  nsn:[10,10],   start:/^[2-9]/, tollfree:["800"] },
  CZ: { cc: "420",trunk0:false,  nsn:[9,9],     start:/^[2-9]/, tollfree:["800"] },
  PL: { cc: "48", trunk0:false,  nsn:[9,9],     start:/^[1-9]/, tollfree:["800"] },
  RO: { cc: "40", trunk0:false,  nsn:[9,10],    start:/^[2-9]/, tollfree:["800"] },
  HU: { cc: "36", trunk0:false,  nsn:[8,9],     start:/^[1-9]/, tollfree:["80"] },

  // ===== NANP (Norteamérica) =====
  US: { cc: "1",  trunk0:false,  nsn:[10,10],   start:/^[2-9]/, tollfree:["800","888","877","866","855","844","833","822"] },
  CA: { cc: "1",  trunk0:false,  nsn:[10,10],   start:/^[2-9]/, tollfree:["800","888","877","866","855","844","833","822"] },
  PR: { cc: "1",  trunk0:false,  nsn:[10,10],   start:/^[2-9]/, tollfree:["800","888","877","866","855","844","833","822"] },
  DO: { cc: "1",  trunk0:false,  nsn:[10,10],   start:/^[2-9]/, tollfree:["800","888","877","866","855","844","833","822"] },

  // ===== Latinoamérica (selección representativa) =====
  MX: { cc: "52", trunk0:false,  nsn:[10,10],   start:/^[1-9]/, tollfree:["800"] },
  AR: { cc: "54", trunk0:false,  nsn:[10,10],   start:/^[1-9]/, tollfree:["800","810","811"] }, // simplificado
  BR: { cc: "55", trunk0:false,  nsn:[10,11],   start:/^[1-9]/, tollfree:["800"] }, // 2-digit area + (8 or 9 mobile)
  CL: { cc: "56", trunk0:false,  nsn:[9,9],     start:/^[2-9]/, tollfree:["800"] },
  CO: { cc: "57", trunk0:false,  nsn:[10,10],   start:/^[1-9]/, tollfree:["800"] },
  PE: { cc: "51", trunk0:false,  nsn:[9,9],     start:/^[1-9]/, tollfree:["800"] },
  UY: { cc: "598",trunk0:false,  nsn:[8,9],     start:/^[2-9]/, tollfree:["800"] },
  EC: { cc: "593",trunk0:false,  nsn:[9,9],     start:/^[1-9]/, tollfree:["1800","1700"] }, // 1-800, 1-700 form
};

/* ========== Helpers de regex dinámico (captura con separadores) ========== */
function makeRegexForISO(iso){
  const cfg = CFG[iso];
  if (!cfg) return null;
  const cc = cfg.cc.replace(/[-/\\^$*+?.()|[\]{}]/g, "");
  // Prefijo internacional: +CC / + CC / 00CC / 00 CC / opcional (trunk (0) permitido)
  const intl = `(?:\\+|00?)\\s*${cc}\\s*`;
  const trunkOpt = cfg.trunk0 ? `(?:\\(0\\)\\s*)?` : ``;

  // NSN: empezando por patrón de inicio; el resto dígitos con separadores
  // Aproximamos: primer dígito según cfg.start, luego {min-1 .. max-1} grupos dígito con separadores
  const min = cfg.nsn[0], max = cfg.nsn[1];
  const start = cfg.start ? cfg.start.source.replace(/^\^/,"").replace(/\$$/,"") : "[1-9]";
  const nsn = `(?:${start})(?:[\\s\\u00A0().\\-]*\\d){${Math.max(0,min-1)},${Math.max(0,max-1)}}`;

  const toll = (cfg.tollfree && cfg.tollfree.length)
    ? `|(?:${cfg.tollfree.map(p=>p.replace(/[-/\\^$*+?.()|[\]{}]/g, "")).join("|")})(?:[\\s\\u00A0().\\-]*\\d){6,8}`
    : "";

  const body = `(?:(?:${intl}${trunkOpt})?${nsn}${toll})`;
  const re = new RegExp(`(?<!\\w)(?:tel:\\s*)?(?:${body})(?!\\w)`, "gi");
  return re;
}

/* ========== Normalizador a E.164 (+CC) ========== */
function toE164_GENERIC(raw, iso){
  const cfg = CFG[iso];
  if (!cfg) return null;

  let d = onlyDigits(normPlus(raw));
  // quitar 00
  if (d.startsWith("00")) d = d.slice(2);
  // quitar + (si quedó)
  if (d.startsWith(cfg.cc)) {
    d = d.slice(cfg.cc.length);
    // quitar 0 nacional tras cc (p.ej. (0))
    if (cfg.trunk0 && d[0] === "0") d = d.slice(1);
  }

  // Nacional con trunk 0
  if (cfg.trunk0 && d.length >= (cfg.nsn[0]+1) && d[0]==="0") {
    d = d.slice(1);
  }

  // Chequeo toll-free primero
  if (cfg.tollfree && cfg.tollfree.length) {
    const tf = cfg.tollfree.find(p => d.startsWith(p));
    if (tf) {
      const rest = d.slice(tf.length);
      const total = tf.length + rest.length;
      // permitimos 9–11 dígitos total nacional según país
      if (rest.length >= 6 && rest.length <= 8) {
        return `+${cfg.cc}${d}`;
      }
    }
  }

  // Validación NSN por longitud y patrón inicial
  const nsn = d;
  if (nsn.length < cfg.nsn[0] || nsn.length > cfg.nsn[1]) return null;
  if (cfg.start && !cfg.start.test(nsn[0])) return null;

  return `+${cfg.cc}${nsn}`;
}

/* ================== Recolección DOM (idéntico a FR/IT/ES) ================== */
function gatherVisibleTextNodes(doc) {
  const out = [];
  const root = doc.body || doc.documentElement;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const t = clean(node.nodeValue);
      if (!t) return NodeFilter.FILTER_REJECT;
      if (t.length > 4000) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  while (walker.nextNode()) out.push({ text: walker.currentNode.nodeValue, source: "text" });
  return out;
}
function gatherHeaderFooter(doc) {
  const out = [];
  ["header","footer"].forEach(sel => {
    doc.querySelectorAll(sel).forEach(el => {
      const t = clean(el.textContent || "");
      if (t) out.push({ text: t, source: sel });
    });
  });
  return out;
}
function gatherLikelyLinkTexts(doc) {
  // multi-idioma (ES/EN/FR/IT/PT/DE)
  const KEY = /contact|contacto|contáctanos|contattaci|contatti|kontakt|support|assistance|aide|soporte|ayuda|servizio\s*clienti|service\s*client|customer\s*service|about|a\s*propos|chi\s*siamo|quienes|legal|aviso|mentions|impressum|privacy|confidentialit[eé]|termini|condizioni|terms|condiciones/iu;
  const out = [];
  doc.querySelectorAll("a[href]").forEach(a => {
    const href = a.getAttribute("href") || "";
    const txt  = clean(a.textContent || a.getAttribute("aria-label") || a.title || "");
    if (KEY.test(txt) || KEY.test(href)) {
      if (txt) out.push({ text: txt, source: "link-text" });
      out.push({ text: href, source: "link-href" });
    }
  });
  return out;
}
function gatherTelLinks(doc) {
  const out = [];
  doc.querySelectorAll('a[href^="tel:"]').forEach(a => {
    out.push({ text: a.getAttribute("href") || "", source: "tel:href" });
    const t = clean(a.textContent || "");
    if (t) out.push({ text: t, source: "tel:text" });
  });
  return out;
}
function gatherSchemaTelephones(doc) {
  const out = [];
  doc.querySelectorAll('[itemprop="telephone"], [itemprop="tel"]').forEach(el => {
    const t = clean(el.textContent || el.getAttribute("content") || "");
    if (t) out.push({ text: t, source: "schema:itemprop" });
  });
  doc.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
    try {
      const data = JSON.parse(s.textContent || "{}");
      const collect = (obj) => {
        if (!obj || typeof obj !== "object") return;
        if (Array.isArray(obj)) return obj.forEach(collect);
        if (obj.telephone) out.push({ text: String(obj.telephone), source: "schema:jsonld" });
        for (const k in obj) collect(obj[k]);
      };
      collect(data);
    } catch(_) {}
  });
  return out;
}
function gatherWhatsAppLinks(doc) {
  const out = [];
  const WA = [
    'a[href*="wa.me/"]',
    'a[href*="api.whatsapp.com/send"]',
    'a[href*="web.whatsapp.com/send"]',
    'a[href^="whatsapp://send"]'
  ];
  doc.querySelectorAll(WA.join(",")).forEach(a => {
    const href = a.getAttribute("href") || "";
    out.push({ text: href, source: "whatsapp:href" });
    const txt = clean(a.textContent || "");
    if (txt) out.push({ text: txt, source: "whatsapp:text" });
  });
  return out;
}

/* ================== Extractor (regex dinámico + normalizador) ================== */
function extractPhonesINTL_Text(text, source, iso) {
  const hay = clean(text);
  const hits = [];
  const re = makeRegexForISO(iso);
  if (re) {
    let m; re.lastIndex = 0;
    while ((m = re.exec(hay))) {
      const raw = m[0];
      const e164 = toE164_GENERIC(raw, iso);
      if (e164) hits.push({ e164, sample: raw, source });
    }
  }

  // WhatsApp: wa.me/<num>, api/web.whatsapp.com/send?phone=..., whatsapp://send?phone=...
  const wa =
    /(?:wa\.me\/|whatsapp:\/\/send\?[^#\s]*?\bphone=|(?:api|web)\.whatsapp\.com\/send\?[^#\s]*?\bphone=)\s*([+]?[\s\d().-]{6,})/gi;
  let w;
  while ((w = wa.exec(hay))) {
    const raw = w[1];
    const e164 = toE164_GENERIC(raw, iso);
    if (e164) hits.push({ e164, sample: raw, source: source || "whatsapp" });
  }

  return hits;
}

/* ================== API principal (compatible con index.js) ================== */
// Devuelve array de "+CCXXXXXXXX" por defecto.
// Llamada esperada: extractINTL({ iso: "DE", doc, returnMeta })
export default async function extractINTL(opts = {}) {
  const iso = String(opts.iso || opts.country || "US").toUpperCase();
  const cfg = CFG[iso];
  if (!cfg) return []; // país no soportado en este genérico

  const doc = opts.doc || document;

  const buckets = [
    ...gatherHeaderFooter(doc),
    ...gatherTelLinks(doc),
    ...gatherSchemaTelephones(doc),
    ...gatherWhatsAppLinks(doc),
    ...gatherLikelyLinkTexts(doc),
    ...gatherVisibleTextNodes(doc),
  ];

  const found = [];
  for (const { text, source } of buckets) {
    found.push(...extractPhonesINTL_Text(text, source, iso));
  }

  const uniqHits = uniqBy(found, "e164");
  const list = uniqHits.map(x => x.e164);

  if (opts && opts.returnMeta) {
    return { list, meta: uniqHits };
  }
  return list;
}

/* Para normalizar cadenas externas (p.ej. deep-scan/fetch) */
export function extractFromStringsINTL(strings = [], options = {}) {
  const iso = String(options.iso || options.country || "US").toUpperCase();
  const out = [];
  for (const s of strings) out.push(...extractPhonesINTL_Text(s, "string", iso));
  const uniqHits = uniqBy(out, "e164");
  const list = uniqHits.map(x => x.e164);
  return options && options.returnMeta ? { list, meta: uniqHits } : list;
}
