// content/extractors/phones/ES.js
// España — DOM + header/footer + a[href] + tel: + schema + WhatsApp → E.164 (+34)

//////////////////// Utils ////////////////////
const HIDDEN = /[\u200B-\u200D\u2060\u00A0\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g;
const clean = s => String(s || "").replace(HIDDEN, "").trim();
const onlyDigits = s => clean(s).replace(/[^\d]/g, "");
const stripExt  = s => s.replace(/\s*(?:ext\.?|x|#)\s*\d+\s*$/i, "");
const normPlus  = raw => stripExt(clean(raw).replace(/\(0\)/g, ""));

const uniqBy = (arr, key) => {
  const m = new Map();
  for (const it of arr) if (!m.has(it[key])) m.set(it[key], it);
  return [...m.values()];
};

//////////////////// Regex ES ////////////////////
// Soporta: +34, + 34, 0034, 00 34, nacionales (9 dígitos), 800/900/901/902/905/907 (9 dígitos)
// Separadores: espacios, NBSP, puntos, guiones, paréntesis
const RE_ES =
  /(?<!\w)(?:tel:\s*)?(?:(?:\+|00?)\s*34\s*)?(?:\(?0\)?\s*)?(?:(?:[67](?:[\s\u00A0().\-]*\d){8})|(?:[89](?:[\s\u00A0().\-]*\d){8})|(?:(?:800|900|901|902|905|907)(?:[\s\u00A0().\-]*\d){6}))(?!\w)/gi;

//////////////////// Normalizador a E.164 (+34) ////////////////////
// Reglas: 9 dígitos finales (móviles 6/7; fijos 8/9) o 800/900/901/902/905/907 + 6 → total 9
function toE164_ES(raw) {
  let d = onlyDigits(normPlus(raw));

  // 0034…
  if (d.startsWith("0034")) d = d.slice(4);
  // +34 / 34…
  if (d.startsWith("34")) d = d.slice(2);

  // A veces aparece con '0' nacional delante por error: 0XXXXXXXXX
  if (d.length === 10 && d[0] === "0") d = d.slice(1);

  // móviles/fijos nacionales 9 dígitos
  if (/^[6789]\d{8}$/.test(d)) return "+34" + d;

  // 800/900/901/902/905/907 (9 dígitos totales)
  if (/^(?:800|900|901|902|905|907)\d{6}$/.test(d)) return "+34" + d;

  return null;
}

//////////////////// Recolección en DOM ////////////////////
function normText(s){
  if (!s) return "";
  return String(s).replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}

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
  // Enlaces donde suelen estar teléfonos (ES + fallback)
  const KEY = /contact|contacto|contáctanos|contactanos|soporte|asistencia|ayuda|atenci[oó]n\s+al\s+cliente|about|qui[eé]nes|sobre\s+n(osotros)?|legal|aviso|aviso\s+legal|privacy|pr[ií]vacy|terminos|t[eé]rminos|condiciones/iu;
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
  // itemprop
  doc.querySelectorAll('[itemprop="telephone"], [itemprop="tel"]').forEach(el => {
    const t = clean(el.textContent || el.getAttribute("content") || "");
    if (t) out.push({ text: t, source: "schema:itemprop" });
  });
  // JSON-LD
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
    'a[href^="whatsapp://send"]'   // móvil
  ];
  doc.querySelectorAll(WA.join(",")).forEach(a => {
    const href = a.getAttribute("href") || "";
    out.push({ text: href, source: "whatsapp:href" });
    const txt = clean(a.textContent || "");
    if (txt) out.push({ text: txt, source: "whatsapp:text" });
  });
  return out;
}

//////////////////// Extractor ////////////////////
function extractPhonesES_Text(text, source) {
  const hay = clean(text);
  const hits = [];

  // Números españoles
  let m;
  const re = new RegExp(RE_ES);
  re.lastIndex = 0;
  while ((m = re.exec(hay))) {
    const raw = m[0];
    const e164 = toE164_ES(raw);
    if (e164) hits.push({ e164, sample: raw, source });
  }

  // WhatsApp: wa.me/<num>, api/web.whatsapp.com/send?phone=..., whatsapp://send?phone=...
  const wa =
    /(?:wa\.me\/|whatsapp:\/\/send\?[^#\s]*?\bphone=|(?:api|web)\.whatsapp\.com\/send\?[^#\s]*?\bphone=)\s*([+]?[\s\d().-]{6,})/gi;
  let w;
  while ((w = wa.exec(hay))) {
    const raw = w[1];
    const e164 = toE164_ES(raw);
    if (e164) hits.push({ e164, sample: raw, source: source || "whatsapp" });
  }

  return hits;
}

//////////////////// API principal (compatible con index.js) ////////////////////
// Devuelve array de "+34XXXXXXXXX" por defecto.
// Si options.returnMeta === true → { list, meta }
export default async function extractES(opts = {}) {
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
    found.push(...extractPhonesES_Text(text, source));
  }

  const uniqHits = uniqBy(found, "e164");
  const list = uniqHits.map(x => x.e164);

  if (opts && opts.returnMeta) {
    return { list, meta: uniqHits };
  }
  return list;
}

// Para normalizar cadenas externas (p.ej. desde deep-scan/fetch)
export function extractFromStringsES(strings = [], options = {}) {
  const out = [];
  for (const s of strings) out.push(...extractPhonesES_Text(s, "string"));
  const uniqHits = uniqBy(out, "e164");
  const list = uniqHits.map(x => x.e164);
  return options && options.returnMeta ? { list, meta: uniqHits } : list;
}
