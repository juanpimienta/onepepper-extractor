// content/extractors/phones/IT.js
// Italia — DOM + header/footer + a[href] + tel: + schema + WhatsApp → E.164 (+39)

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

//////////////////// Regex IT ////////////////////
// Soporta: +39, + 39, 0039, 00 39, nacionales con 0 (fijos) y 3 (móviles), 800/803…
// Separadores: espacios, NBSP, puntos, guiones, paréntesis
const RE_IT =
  /(?<!\w)(?:tel:\s*)?(?:(?:\+|00?)\s*39\s*)?(?:3(?:[\s\u00A0().\-]*\d){8,10}|0(?:[\s\u00A0().\-]*\d){6,10}|80[0-9](?:[\s\u00A0().\-]*\d){5,6})(?!\w)/gi;

//////////////////// Normalizador a E.164 (+39) ////////////////////
// Reglas pragmáticas (no 100% exhaustivas, pero robustas):
// - móviles: empiezan por 3 y total dígitos 9–11
// - fijos: empiezan por 0 y total dígitos 7–11
// - toll-free/servicios: 800/803 + 6–7 dígitos
function toE164_IT(raw) {
  let d = onlyDigits(normPlus(raw));

  // 0039…
  if (d.startsWith("0039")) d = d.slice(4);
  // +39 / 39…
  if (d.startsWith("39")) d = d.slice(2);

  // móviles (3xxxxxxxx / 9–11 dígitos)
  if (d[0] === "3" && d.length >= 9 && d.length <= 11) {
    return "+39" + d;
  }

  // fijos (0xxxxxxxx / 7–11 dígitos)
  if (d[0] === "0" && d.length >= 7 && d.length <= 11) {
    return "+39" + d;
  }

  // 800/803/… (servicios/toll-free): 800/803 + 6–7 dígitos
  if (/^80[0-9]\d{5,6}$/.test(d)) {
    return "+39" + d;
  }

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
  // Palabras italianas (y fallback genérico) habituales donde suelen estar teléfonos
  const KEY = /contatto|contattaci|contatti|assistenza|supporto|servizio\s*clienti|chi\s*siamo|informazioni|about|legal|note\s*legali|privacy|termini|condizioni/iu;
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
function extractPhonesIT_Text(text, source) {
  const hay = clean(text);
  const hits = [];

  // Números italianos
  let m;
  const re = new RegExp(RE_IT);
  re.lastIndex = 0;
  while ((m = re.exec(hay))) {
    const raw = m[0];
    const e164 = toE164_IT(raw);
    if (e164) hits.push({ e164, sample: raw, source });
  }

  // WhatsApp: wa.me/<num>, api/web.whatsapp.com/send?phone=..., whatsapp://send?phone=...
  const wa =
    /(?:wa\.me\/|whatsapp:\/\/send\?[^#\s]*?\bphone=|(?:api|web)\.whatsapp\.com\/send\?[^#\s]*?\bphone=)\s*([+]?[\s\d().-]{6,})/gi;
  let w;
  while ((w = wa.exec(hay))) {
    const raw = w[1];
    const e164 = toE164_IT(raw);
    if (e164) hits.push({ e164, sample: raw, source: source || "whatsapp" });
  }

  return hits;
}

//////////////////// API principal (compatible con index.js) ////////////////////
// Devuelve array de "+39XXXXXXXXXX" por defecto.
// Si options.returnMeta === true → { list, meta }
export default async function extractIT(opts = {}) {
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
    found.push(...extractPhonesIT_Text(text, source));
  }

  const uniqHits = uniqBy(found, "e164");
  const list = uniqHits.map(x => x.e164);

  if (opts && opts.returnMeta) {
    return { list, meta: uniqHits };
  }
  return list;
}

// Para normalizar cadenas externas (p.ej. desde deep-scan/fetch)
export function extractFromStringsIT(strings = [], options = {}) {
  const out = [];
  for (const s of strings) out.push(...extractPhonesIT_Text(s, "string"));
  const uniqHits = uniqBy(out, "e164");
  const list = uniqHits.map(x => x.e164);
  return options && options.returnMeta ? { list, meta: uniqHits } : list;
}
