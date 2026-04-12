// content/extractors/phones/FR.js
// France — DOM + header/footer + a[href] + tel: + schema + WhatsApp → E.164 (+33)

//////////////////// Utils ////////////////////
const HIDDEN = /[\u200B-\u200D\u2060\u00A0\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g;
const clean = s => String(s || "").replace(HIDDEN, "").trim();
const onlyDigits = s => clean(s).replace(/[^\d]/g, "");
const stripExt = s => s.replace(/\s*(?:ext\.?|x|#)\s*\d+\s*$/i, "");
const normPlus = raw => stripExt(clean(raw).replace(/\(0\)/g, ""));

const uniqBy = (arr, key) => {
  const m = new Map();
  for (const it of arr) if (!m.has(it[key])) m.set(it[key], it);
  return [...m.values()];
};
const uniq = (arr) => Array.from(new Set(arr));

//////////////////// Regex FR ////////////////////
// Soporta: +33, + 33, 0033, 00 33, 0XXXXXXXXX
// Con separadores: espacios, NBSP, puntos, guiones, paréntesis
const RE_FR =
  /(?<!\w)(?:tel:\s*)?(?:(?:\+|00?)\s*33\s*(?:\(0\)\s*)?|0)\s*(?:[1-5]|6|7|9)(?:[\s\u00A0().\-]*\d){8}(?!\w)/gi;

//////////////////// Normalizador a E.164 (+33) ////////////////////
function toE164_FR(raw) {
  let d = onlyDigits(normPlus(raw));

  // 0033...
  if (d.startsWith("0033")) d = d.slice(4);

  // +33... o 33...
  if (d.startsWith("33")) {
    d = d.slice(2);
    if (d.length === 10 && d[0] === "0") d = d.slice(1);
    if (d.length === 9) return "+33" + d;
    return null;
  }

  // Nacional 0XXXXXXXXX
  if (d.length === 10 && d[0] === "0") {
    return "+33" + d.slice(1);
  }

  return null;
}

//////////////////// Recolección en DOM ////////////////////
function normText(s){
  if (!s) return "";
  return String(s).replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}
function getText(el){ return el ? normText(el.textContent) : ""; }

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
  const KEY = /contact|contactez|contacter|support|assistance|aide|service\s*client|sav|about|a\s*propos|qui\s*sommes|legal|mentions|privacy|confidentialit[eé]|terms|conditions/iu;
  const out = [];
  doc.querySelectorAll("a[href]").forEach(a => {
    const href = a.getAttribute("href") || "";
    const txt = clean(a.textContent || a.getAttribute("aria-label") || a.title || "");
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
    'a[href^="whatsapp://send"]'   // ← móvil
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
function extractPhonesFR_Text(text, source) {
  const hay = clean(text);
  const hits = [];

  // Números franceses
  let m;
  const re = new RegExp(RE_FR);
  re.lastIndex = 0;
  while ((m = re.exec(hay))) {
    const raw = m[0];
    const e164 = toE164_FR(raw);
    if (e164) hits.push({ e164, sample: raw, source });
  }

  // WhatsApp: wa.me/<num>, api/web.whatsapp.com/send?phone=..., whatsapp://send?phone=...
  const wa =
    /(?:wa\.me\/|whatsapp:\/\/send\?[^#\s]*?\bphone=|(?:api|web)\.whatsapp\.com\/send\?[^#\s]*?\bphone=)\s*([+]?[\s\d().-]{6,})/gi;
  let w;
  while ((w = wa.exec(hay))) {
    const raw = w[1];
    const e164 = toE164_FR(raw);
    if (e164) hits.push({ e164, sample: raw, source: source || "whatsapp" });
  }


  return hits;
}

//////////////////// API principal (compatible con index.js) ////////////////////
// Devuelve array de "+33XXXXXXXXX" por defecto.
// Si options.returnMeta === true → { list, meta }
export default async function extractFR(opts = {}) {
  const doc = opts.doc || document; // <- MISMA INTERFAZ que ES/INTL

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
    found.push(...extractPhonesFR_Text(text, source));
  }

  const uniqHits = uniqBy(found, "e164");
  const list = uniqHits.map(x => x.e164);

  if (opts && opts.returnMeta) {
    return { list, meta: uniqHits };
  }
  return list;
}

// Para normalizar cadenas externas (p.ej. desde deep-scan/fetch)
export function extractFromStringsFR(strings = [], options = {}) {
  const out = [];
  for (const s of strings) out.push(...extractPhonesFR_Text(s, "string"));
  const uniqHits = uniqBy(out, "e164");
  const list = uniqHits.map(x => x.e164);
  return options && options.returnMeta ? { list, meta: uniqHits } : list;
}
