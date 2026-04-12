import { extractEmails } from "../../content/extractors/emails.js";
import { extractPhones } from "../../content/extractors/phones/index.js";
import { detectMarketplaceFromURL } from "../../content/extractors/marketplace.js";

const MAX_REMOTE_SCAN_URLS = 5;
const MAX_REMOTE_BATCH_URLS = 20;
const REQUEST_TIMEOUT_MS = 12000;
const URL_SKIP_RE = /\/(?:products?|collections?|cart|checkout|account|wishlist|login|register|sign[-_ ]?in|sign[-_ ]?up|search|track[-_ ]?order|compare|quick[-_ ]?view|add[-_ ]?to[-_ ]?cart)\b/i;
const DROP_QUERY_KEYS = ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid","fbclid","variant","sku","size","color","option","attribute","quantity","add"];

function timeoutSignal(ms = REQUEST_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return {
    signal: ctrl.signal,
    clear() { clearTimeout(timer); }
  };
}

function normalizeTargetUrl(rawUrl = "") {
  const value = String(rawUrl || "").trim();
  if (!value) throw new Error("Pega una URL para escanear.");

  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withProtocol);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Solo se permiten URLs http o https.");
  url.hash = "";
  return url.toString();
}

function parseHtml(html = "") {
  return new DOMParser().parseFromString(html, "text/html");
}

function getDocTitle(doc) {
  const h1 = doc.querySelector("h1, .page-title, .site-title, .entry-title, .product_title");
  return (h1?.textContent || "").trim().slice(0, 140);
}

function absoluteHref(baseUrl, href = "") {
  try {
    const url = new URL(href, baseUrl);
    if (!/^https?:$/.test(url.protocol)) return "";
    DROP_QUERY_KEYS.forEach((key) => url.searchParams.delete(key));
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function extractKeyLinksFromDoc(doc, baseUrl) {
  const kw = {
    privacy:["privacidad","privacy","proteccion-de-datos","aviso-legal","datos-personales"],
    legal:["legal","aviso-legal","legal-notice","impressum"],
    contact:["contacto","contact","soporte","support","ayuda","atencion-al-cliente","contact-us"],
    terms:["terminos","términos","condiciones","terms","condiciones-de-uso","terminos-y-condiciones","terms-of-service"]
  };
  const best = { privacy: null, contact: null, legal: null, terms: null };

  Array.from(doc.querySelectorAll("a[href]")).forEach((a) => {
    const href = absoluteHref(baseUrl, a.getAttribute("href") || "");
    if (!href) return;
    const text = `${href} ${(a.textContent || "").trim().toLowerCase()}`.toLowerCase();
    if (!best.privacy && kw.privacy.some((k) => text.includes(k))) best.privacy = href;
    if (!best.contact && kw.contact.some((k) => text.includes(k))) best.contact = href;
    if (!best.legal && kw.legal.some((k) => text.includes(k))) best.legal = href;
    if (!best.terms && kw.terms.some((k) => text.includes(k))) best.terms = href;
  });

  return best;
}

function extractSocialFromDoc(doc, baseUrl) {
  const patterns = {
    facebook:/facebook\.com/i,
    twitter:/(^|\/\/)x\.com|twitter\.com/i,
    instagram:/instagram\.com/i,
    linkedin:/linkedin\.com/i,
    youtube:/youtube\.com|youtu\.be/i,
    pinterest:/pinterest\.com/i,
    whatsapp:/wa\.me|api\.whatsapp\.com/i,
    tiktok:/tiktok\.com/i
  };
  const out = {};
  Array.from(doc.querySelectorAll("a[href]")).forEach((a) => {
    const href = absoluteHref(baseUrl, a.getAttribute("href") || "");
    if (!href) return;
    for (const [key, re] of Object.entries(patterns)) {
      if (!out[key] && re.test(href)) {
        out[key] = href;
        break;
      }
    }
  });
  return out;
}

function detectTechnologyFromHtml(url, html = "") {
  const market = detectMarketplaceFromURL(url);
  if (market) return market;

  const h = String(html || "");
  if (h.includes("cdn.shopify.com") || /window\.Shopify|Shopify\.theme/i.test(h)) return "Shopify";
  if (h.includes("woocommerce") || /wc-add-to-cart|wp-content\/plugins\/woocommerce/i.test(h)) return "WooCommerce";
  if (h.includes("wp-content") || h.includes("wordpress")) return "WordPress";
  if (h.includes("prestashop")) return "PrestaShop";
  if (h.includes("magento/2") || h.includes("data-mage-init")) return "Adobe Commerce (Magento 2)";
  if (h.includes("magento/1")) return "Adobe Commerce (Magento 1)";
  if (h.includes("bigcommerce")) return "BigCommerce";
  if (h.includes("wix")) return "Wix";
  if (h.includes("squarespace")) return "Squarespace";
  if (h.includes("salesforce")) return "Salesforce";
  if (h.includes("ecwid")) return "Ecwid";
  if (h.includes("ecart")) return "Ecart";
  return "Tecnología personalizada o no identificada";
}

function collectExtraPages(baseUrl, bestLinks = {}) {
  const base = new URL(baseUrl);
  const out = [];
  for (const href of [bestLinks.contact, bestLinks.privacy, bestLinks.legal, bestLinks.terms]) {
    if (!href) continue;
    try {
      const url = new URL(href, baseUrl);
      if (url.origin !== base.origin) continue;
      if (URL_SKIP_RE.test(url.pathname)) continue;
      const normalized = absoluteHref(baseUrl, url.toString());
      if (normalized && !out.includes(normalized)) out.push(normalized);
    } catch {}
  }
  return out.slice(0, MAX_REMOTE_SCAN_URLS - 1);
}

async function fetchHtml(url) {
  const ctrl = timeoutSignal();
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "text/html,application/xhtml+xml" },
      cache: "no-store",
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`No se pudo leer ${url} (${res.status}).`);
    return await res.text();
  } finally {
    ctrl.clear();
  }
}

async function extractPageData(url, html, country) {
  const doc = parseHtml(html);
  const emails = extractEmails({ doc });
  const phonesRes = await extractPhones(country, { doc, worldOnly: country === "INTL", returnMeta: false });
  const phones = Array.isArray(phonesRes) ? phonesRes : (phonesRes?.list || []);
  return {
    doc,
    h1: getDocTitle(doc),
    emails,
    phones,
    bestLinks: extractKeyLinksFromDoc(doc, url),
    socialLinks: extractSocialFromDoc(doc, url),
    technology: detectTechnologyFromHtml(url, html)
  };
}

export async function scanUrlWithExtractor(rawUrl, { country = "ES", onProgress } = {}) {
  const url = normalizeTargetUrl(rawUrl);
  const primaryHtml = await fetchHtml(url);
  const primary = await extractPageData(url, primaryHtml, country);

  const visited = [url];
  const extraUrls = collectExtraPages(url, primary.bestLinks);
  if (typeof onProgress === "function") onProgress({ index: 1, total: 1 + extraUrls.length, url });

  const emails = new Set(primary.emails || []);
  const phones = new Set(primary.phones || []);
  let socialLinks = { ...(primary.socialLinks || {}) };
  let bestLinks = { ...(primary.bestLinks || {}) };

  for (let i = 0; i < extraUrls.length; i++) {
    const nextUrl = extraUrls[i];
    try {
      const html = await fetchHtml(nextUrl);
      const parsed = await extractPageData(nextUrl, html, country);
      visited.push(nextUrl);
      (parsed.emails || []).forEach((item) => emails.add(item));
      (parsed.phones || []).forEach((item) => phones.add(item));
      socialLinks = { ...parsed.socialLinks, ...socialLinks };
      bestLinks = {
        privacy: bestLinks.privacy || parsed.bestLinks?.privacy || null,
        contact: bestLinks.contact || parsed.bestLinks?.contact || null,
        legal: bestLinks.legal || parsed.bestLinks?.legal || null,
        terms: bestLinks.terms || parsed.bestLinks?.terms || null
      };
    } catch {}
    if (typeof onProgress === "function") onProgress({ index: i + 2, total: 1 + extraUrls.length, url: nextUrl });
  }

  return {
    url,
    data: {
      h1: primary.h1,
      emails: Array.from(emails),
      phones: Array.from(phones),
      bestLinks,
      socialLinks,
      technology: primary.technology,
      visitedUrls: visited
    }
  };
}

export function parseBatchUrls(rawInput = "", max = MAX_REMOTE_BATCH_URLS) {
  const lines = String(rawInput || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const out = [];
  const seen = new Set();
  for (const line of lines) {
    const normalized = normalizeTargetUrl(line);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= max) break;
  }
  return out;
}

export { MAX_REMOTE_SCAN_URLS, MAX_REMOTE_BATCH_URLS };
