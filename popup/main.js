// popup/main.js — OCR off, dedupe por país y GRID fluido 2 col

import { dedupeEmails, dedupePhones } from "./utils/dedupe.js";
import { getSupportedCountries } from "./ui/render-header.js";
import { installCopyHandlers } from "./ui/copy.js";
import { installPopupTypography } from "./ui/typography.js";
import { useTwoColumnLayout } from "./ui/layout-grid.js";
import {
  getAccessState,
  registerDownload,
  setUserPlan
} from "./services/access.js";
import { getCachedLicenseState, getOrCreateInstallId, invalidateLicenseCache, syncLicenseStatus } from "./services/license.js";
import { renderPlanStatus } from "./ui/render-plan-status.js";
import { showInfoModal } from "./ui/modal.js";
import { MAX_REMOTE_BATCH_URLS, parseBatchUrls, scanUrlWithExtractor } from "./services/remote-scan.js";
import { detectMarketplaceFromURL } from "../content/extractors/marketplace.js";

const STORE_KEY = "extractedDataByOrigin";
const LEGACY_KEY = "extractedData";
const GENERIC_TECH = /no identificada|personalizada/i;
const MARKET_HOSTS = /(amazon\.[a-z.]+|aliexpress\.[a-z.]+|ebay\.[a-z.]+|etsy\.com|mercadolibre\.[a-z.]+|facebook\.com|instagram\.com|tiktok\.com|walmart\.[a-z.]+)/i;
const LAST_EXPORT_KEY = "lastExportRows";
const DEEP_SCAN_META_KEY = "deepScanMetaByUrl";
const DEEP_SCAN_FRESH_MS = 1000 * 60 * 60 * 24;

let CURRENT_ISO = "ES";
let CURRENT_CC  = "";

function emptyCountryBucket(){
  return {
    h1: "",
    emails: [],
    phones: [],
    bestLinks: { privacy:null, contact:null, legal:null, terms:null },
    socialLinks: {},
    technology: "",
    updatedAt: 0
  };
}

async function openStripeCheckout({ source = "premium-upgrade", plan = "month" } = {}) {
  try {
    await invalidateLicenseCache().catch(() => {});
    const installId = await getOrCreateInstallId();
    const res = await chrome.runtime.sendMessage({ type: "OPEN_CHECKOUT", plan, source, installId });
    if (res?.ok) return true;

    await showInfoModal({
      title: "No se pudo abrir Premium",
      message: res?.message || "El checkout no respondio correctamente. Recarga la extension y vuelve a intentarlo.",
      okText: "Entendido"
    });
    return false;
  } catch (error) {
    await showInfoModal({
      title: "No se pudo abrir Premium",
      message: error?.message || "La extension no pudo abrir el checkout. Recarga la extension y vuelve a intentarlo.",
      okText: "Entendido"
    });
    return false;
  }
}

async function openPremiumUpsell({ source = "premium-feature", reason = "premium" } = {}) {
  const title = reason === "downloads-limit"
    ? "Has alcanzado el límite del plan gratuito"
    : "Función disponible en Premium";
  const message = reason === "downloads-limit"
    ? "Ya usaste tus 10 descargas gratuitas. Puedes seguir viendo los resultados extraídos, pero para exportar más o activar exploración profunda necesitas Premium mensual 7,99 €."
    : "La exploración profunda forma parte de Premium mensual 7,99 €. Con este plan tienes exportaciones ilimitadas y acceso completo a esta función.";

  const wantsUpgrade = await showInfoModal({
    title,
    message,
    okText: "Ver Premium mensual"
  });

  if (!wantsUpgrade) return false;
  return openStripeCheckout({ source, plan: "month" });
}

/* ---------- helpers país/CC ---------- */
function ccFromISO(iso){
  try {
    const meta = (getSupportedCountries()||[]).find(c=>c.iso===iso);
    return meta?.cc ? String(meta.cc) : "";
  } catch { return ""; }
}
function countryLabelFromISO(iso){
  try {
    const meta = (getSupportedCountries()||[]).find(c=>c.iso===iso);
    if (!meta) return iso || "";
    if (meta._world) return "Mundo";
    return `${meta.name}${meta.cc ? ` (+${meta.cc})` : ""}`;
  } catch {
    return iso || "";
  }
}

/* ---------- dedupe por DISPLAY (no re-formatea) ---------- */
// => No tocamos el formato que entrega el extractor por país
function dedupeDisplayPhones(arr=[]) {
  const seen = new Set();
  const out = [];
  for (const v of (arr||[])) {
    const s = (v ?? "").toString().trim();
    if (!s) continue;
    if (!seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}

/* ---------- cache última export ---------- */
async function cacheLastExport(rows){ try { await chrome.storage.local.set({ [LAST_EXPORT_KEY]: rows }); } catch {} }
async function getLastExport(){ try { const o = await chrome.storage.local.get(LAST_EXPORT_KEY); return o[LAST_EXPORT_KEY] || []; } catch { return []; } }

/* ---------- origin/marketplace ---------- */
function isMarketplace(technology="", url=""){
  const t = (technology||"").toLowerCase();
  if (/amazon|aliexpress|ebay|etsy|mercadolibre|facebook|instagram|tiktok|walmart/.test(t)) return true;
  return MARKET_HOSTS.test(url || "");
}
function computeKey(url, technology){
  const u = new URL(url);
  const market = isMarketplace(technology, url);
  // 👉 Clave SIEMPRE por URL de inicio (no por dominio) para no mezclar rutas ni marketplaces
  return { key: u.href, isMarketplace: market, origin: u.origin };
}

/* ---------- store ---------- */
function loadStore(){
  const raw = localStorage.getItem(STORE_KEY);
  if (raw) { try { return JSON.parse(raw) || {}; } catch { return {}; } }
  return migrateLegacyArray();
}
function saveStore(store){ localStorage.setItem(STORE_KEY, JSON.stringify(store)); }
async function getActiveTabUrl(){
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.url || "";
  } catch {
    return "";
  }
}
function getStoredRecordByUrl(url){
  if (!url) return null;
  const store = loadStore();
  if (store[url]) return { url, record: store[url] };
  const record = Object.values(store).find((rec) => Array.isArray(rec?.urls) && rec.urls.includes(url));
  return record ? { url, record } : null;
}
function getStoredRecordByUrlForCountry(url, iso = CURRENT_ISO){
  const stored = getStoredRecordByUrl(url);
  if (!stored) return null;
  return { ...stored, record: applyCountryBucketToRecord(stored.record, iso) };
}
async function getDeepScanMeta(url){
  try {
    const stored = await chrome.storage.local.get({ [DEEP_SCAN_META_KEY]: {} });
    return stored[DEEP_SCAN_META_KEY]?.[url] || null;
  } catch {
    return null;
  }
}
async function markDeepScanMeta(url, meta = {}){
  if (!url) return;
  try {
    const stored = await chrome.storage.local.get({ [DEEP_SCAN_META_KEY]: {} });
    const next = stored[DEEP_SCAN_META_KEY] || {};
    next[url] = {
      url,
      ...meta,
      updatedAt: Date.now()
    };
    await chrome.storage.local.set({ [DEEP_SCAN_META_KEY]: next });
  } catch {}
}
function isFreshDeepScanMeta(meta, country){
  if (!meta?.deepScan) return false;
  if ((meta.country || "") !== (country || "")) return false;
  const updatedAt = Number(meta.updatedAt) || 0;
  if (!updatedAt) return false;
  return (Date.now() - updatedAt) < DEEP_SCAN_FRESH_MS;
}
async function wasUrlAlreadyDeepScanned(url, country){
  const meta = await getDeepScanMeta(url);
  if (isFreshDeepScanMeta(meta, country)) {
    return { cached: true, meta };
  }

  try {
    const { visitedUrls = [] } = await chrome.storage.local.get({ visitedUrls: [] });
    const shallowVisited = Array.isArray(visitedUrls) && visitedUrls.includes(url);
    return { cached: false, shallowVisited, meta };
  } catch {
    return { cached: false, shallowVisited: false, meta: null };
  }
}
function formatRelativeTime(ts){
  const value = Number(ts) || 0;
  if (!value) return "";
  const delta = Date.now() - value;
  if (delta < 60 * 1000) return "hace menos de 1 minuto";
  if (delta < 60 * 60 * 1000) return `hace ${Math.max(1, Math.floor(delta / (60 * 1000)))} min`;
  if (delta < 24 * 60 * 60 * 1000) return `hace ${Math.max(1, Math.floor(delta / (60 * 60 * 1000)))} h`;
  return `hace ${Math.max(1, Math.floor(delta / (24 * 60 * 60 * 1000)))} día(s)`;
}
function buildDeepScanStatusLabel(meta){
  if (!meta?.updatedAt) return "";
  const when = formatRelativeTime(meta.updatedAt);
  const country = meta.country ? ` con bandera ${meta.country}` : "";
  if (meta.deepScan) {
    const visited = Number(meta.visitedCount) > 0 ? ` y reviso ${meta.visitedCount} URL(s)` : "";
    return `Ultimo deep scan ${when}${country}${visited}.`;
  }
  return `Ultima extraccion ${when}${country}.`;
}

function makeEmptyRecord(key, origin, isMarketplace){
  return { key, origin, isMarketplace: !!isMarketplace,
    urls: [], h1: "", emails: [], phones: [],
    bestLinks: { privacy:null, contact:null, legal:null, terms:null },
    socialLinks: {}, technology:"",
    countryBuckets: {} };
}
function ensureCountryBucket(rec, iso){
  rec.countryBuckets = rec.countryBuckets || {};
  if (!rec.countryBuckets[iso]) rec.countryBuckets[iso] = emptyCountryBucket();
  return rec.countryBuckets[iso];
}
function bucketHasData(bucket){
  if (!bucket) return false;
  return !!(
    bucket.h1 ||
    bucket.technology ||
    (bucket.emails && bucket.emails.length) ||
    (bucket.phones && bucket.phones.length) ||
    Object.values(bucket.bestLinks || {}).some(Boolean) ||
    Object.values(bucket.socialLinks || {}).some(Boolean)
  );
}
function applyCountryBucketToRecord(rec, iso){
  if (!rec) return rec;
  const bucket = rec.countryBuckets?.[iso];
  if (!bucket || !bucketHasData(bucket)) return rec;
  return {
    ...rec,
    h1: bucket.h1 || "",
    emails: [...(bucket.emails || [])],
    phones: [...(bucket.phones || [])],
    bestLinks: { privacy:null, contact:null, legal:null, terms:null, ...(bucket.bestLinks || {}) },
    socialLinks: { ...(bucket.socialLinks || {}) },
    technology: bucket.technology || "",
    activeCountry: iso,
    bucketUpdatedAt: bucket.updatedAt || 0
  };
}
function recordHasCountryData(rec, iso){
  return bucketHasData(rec?.countryBuckets?.[iso]);
}
function isBetterTech(cur, inc){
  if (!inc) return false; if (!cur) return true;
  return GENERIC_TECH.test(cur) && !GENERIC_TECH.test(inc);
}
function isBetterH1(cur, inc){
  if (!inc) return false;
  if (!cur || /no se encontró h1/i.test(cur)) return true;
  return inc.length > cur.length && inc.length <= 140;
}
function mergeRecord(existing, url, data, meta, countryIso = CURRENT_ISO){
  const { key, origin, isMarketplace } = meta;
  const rec = existing || makeEmptyRecord(key, origin, isMarketplace);
  const bucket = ensureCountryBucket(rec, countryIso);
  if (!rec.urls.includes(url)) rec.urls.push(url);
  if (isMarketplace) { if (!bucket.h1 && data.h1) bucket.h1 = data.h1; }
  else { if (isBetterH1(bucket.h1, data.h1)) bucket.h1 = data.h1; }

  // Emails: normalizados
  bucket.emails = dedupeEmails([...(bucket.emails||[]), ...(data.emails||[])]);

  // Teléfonos: dedupe por display, no tocamos formato
  bucket.phones = dedupeDisplayPhones([...(bucket.phones||[]), ...(data.phones||[])]);

  bucket.bestLinks = bucket.bestLinks || {};
  ["privacy","contact","legal","terms"].forEach(k=>{
    if (!bucket.bestLinks[k] && data.bestLinks?.[k]) bucket.bestLinks[k] = data.bestLinks[k];
  });
  bucket.socialLinks = bucket.socialLinks || {};
  Object.entries(data.socialLinks || {}).forEach(([k,v])=>{
    if (!bucket.socialLinks[k] && v) bucket.socialLinks[k] = v;
  });

  if (isBetterTech(bucket.technology, data.technology)) bucket.technology = data.technology;
  if (!bucket.technology && data.technology) bucket.technology = data.technology;
  bucket.updatedAt = Date.now();

  return applyCountryBucketToRecord(rec, countryIso);
}
function migrateLegacyArray(){
  const store = {};
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]");
    legacy.forEach((row)=>{
      if (!row?.url) return;
      const origin = new URL(row.url).origin;
      store[origin] = mergeRecord(store[origin], row.url, {
        h1: row.h1, emails: row.emails||[], phones: row.phones||[],
        bestLinks: row.bestLinks||{}, socialLinks: row.socialLinks||{}, technology: row.technology||""
      }, { key: origin, origin, isMarketplace:false });
    });
  } catch {}
  saveStore(store);
  return store;
}

/* ---------- export helpers ---------- */
// ---------- export helpers (AOA con encabezado fijo) ----------
// ---------- export helpers (AOA con encabezado fijo) ----------
function rowsFromStore(store){
  const HEADERS = [
    "País",
    "Número",
    "URL",
    "Dominio",
    "Nombre de la tienda",
    "Tecnología",
    "Correos",
    "Teléfono",
    "WhatsApp",
    "Privacidad",
    "Contacto",
    "Legal",
    "Términos",
    "Facebook",
    "TikTok",
    "Instagram",
    "LinkedIn",
    "Twitter",
    "YouTube",
    "Pinterest"
  ];

  const rows = [HEADERS];

  const keys = Object.keys(store).sort();
  const allCountries = Array.from(new Set(
    keys.flatMap((k) => {
      const rec = store[k] || {};
      const bucketKeys = Object.keys(rec.countryBuckets || {}).filter((iso) => bucketHasData(rec.countryBuckets?.[iso]));
      return bucketKeys.length ? bucketKeys : [CURRENT_ISO];
    })
  ));

  for (const iso of allCountries) {
    rows.push([`País: ${countryLabelFromISO(iso)}`, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
    const cc = ccFromISO(iso) || "";
    let rowNumber = 1;

    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const rec = applyCountryBucketToRecord(store[k] || {}, iso);
      if (!recordHasCountryData(store[k] || {}, iso) && !(iso === CURRENT_ISO && !Object.keys((store[k] || {}).countryBuckets || {}).length)) continue;

      const emails = dedupeEmails(rec.emails || []);
      const phones = dedupePhones(rec.phones || [], { defaultCc: cc });

      const numero      = rowNumber++;
      const urlExacta   = (rec.urls && rec.urls[0]) || k || "";
      const dominioLimp = stripDomain(rec.origin || "");
      const nombre      = rec.h1 || "";
      const tecnologia  = rec.technology || "";
      const privacidad  = rec.bestLinks?.privacy  || "";
      const contacto    = rec.bestLinks?.contact  || "";
      const legal       = rec.bestLinks?.legal    || "";
      const terminos    = rec.bestLinks?.terms    || "";
      const facebook = rec.socialLinks?.facebook || "";
      const tiktok   = rec.socialLinks?.tiktok   || "";
      const insta    = rec.socialLinks?.instagram|| "";
      const linkedin = rec.socialLinks?.linkedin || "";
      const twitter  = rec.socialLinks?.twitter  || "";
      const youtube  = rec.socialLinks?.youtube  || "";
      const pinterest= rec.socialLinks?.pinterest|| "";
      const whatsapp = rec.socialLinks?.whatsapp || "";

      if (!emails.length) {
        rows.push([
          countryLabelFromISO(iso),
          numero,
          urlExacta,
          dominioLimp,
          nombre,
          tecnologia,
          "",
          phones.join(", "),
          whatsapp,
          privacidad,
          contacto,
          legal,
          terminos,
          facebook,
          tiktok,
          insta,
          linkedin,
          twitter,
          youtube,
          pinterest
        ]);
        continue;
      }

      rows.push([
        countryLabelFromISO(iso),
        numero,
        urlExacta,
        dominioLimp,
        nombre,
        tecnologia,
        emails[0],
        phones.join(", "),
        whatsapp,
        privacidad,
        contacto,
        legal,
        terminos,
        facebook,
        tiktok,
        insta,
        linkedin,
        twitter,
        youtube,
        pinterest
      ]);

      for (let j = 1; j < emails.length; j++) {
        rows.push([
          countryLabelFromISO(iso),
          "",
          "",
          dominioLimp,
          "",
          "",
          emails[j],
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          ""
        ]);
      }
    }
  }

  return rows;
}

function rowsFromStorePro(store){
  const rows = [];
  const keys = Object.keys(store).sort();
  const allCountries = Array.from(new Set(
    keys.flatMap((k) => {
      const rec = store[k] || {};
      const bucketKeys = Object.keys(rec.countryBuckets || {}).filter((iso) => bucketHasData(rec.countryBuckets?.[iso]));
      return bucketKeys.length ? bucketKeys : [CURRENT_ISO];
    })
  ));

  allCountries.forEach((iso) => {
    const cc = ccFromISO(iso) || "";
    let rowNumber = 1;
    keys.forEach((k)=>{
      const source = store[k] || {};
      const rec = applyCountryBucketToRecord(source, iso);
      if (!recordHasCountryData(source, iso) && !(iso === CURRENT_ISO && !Object.keys(source.countryBuckets || {}).length)) return;
      const emails = dedupeEmails(rec.emails||[]);
      const phones = dedupePhones(rec.phones||[], { defaultCc: cc });
      const dominioLimp = stripDomain(rec.origin || "");

      const base = {
        "País": countryLabelFromISO(iso),
        "Número": rowNumber++,
        "URL": (rec.urls && rec.urls[0]) || k || "",
        "Dominio": dominioLimp,
        "H1": rec.h1 || "",
        "Tecnología": rec.technology || "",
        "Teléfono": phones.join(", "),
        "WhatsApp": rec.socialLinks?.whatsapp || "",
        "Privacidad": rec.bestLinks?.privacy || "",
        "Contacto": rec.bestLinks?.contact || "",
        "Legal": rec.bestLinks?.legal || "",
        "Términos": rec.bestLinks?.terms || "",
        "Facebook": rec.socialLinks?.facebook || "",
        "TikTok": rec.socialLinks?.tiktok || "",
        "Instagram": rec.socialLinks?.instagram || "",
        "LinkedIn": rec.socialLinks?.linkedin || "",
        "Twitter": rec.socialLinks?.twitter || "",
        "YouTube": rec.socialLinks?.youtube || "",
        "Pinterest": rec.socialLinks?.pinterest || ""
      };

      if (!emails.length) {
        rows.push({ ...base, "Correos": "" });
        return;
      }

      rows.push({ ...base, "Correos": emails[0] });
      for (let j = 1; j < emails.length; j++) {
        rows.push({
          "País": countryLabelFromISO(iso),
          "Número": "",
          "URL": "",
          "Dominio": dominioLimp,
          "H1": "",
          "Tecnología": "",
          "Correos": emails[j],
          "Teléfono": "",
          "WhatsApp": "",
          "Privacidad": "",
          "Contacto": "",
          "Legal": "",
          "Términos": "",
          "Facebook": "",
          "TikTok": "",
          "Instagram": "",
          "LinkedIn": "",
          "Twitter": "",
          "YouTube": "",
          "Pinterest": ""
        });
      }
    });
  });

  return rows;
}

function stripDomain(urlOrOrigin=""){
  try { const u = new URL(urlOrOrigin.startsWith("http") ? urlOrOrigin : ("https://" + urlOrOrigin.replace(/^\/\//,''))); 
        return u.hostname.replace(/^www\./, ""); } catch { 
    return String(urlOrOrigin).replace(/^https?:\/\//, "").replace(/^www\./,"").replace(/\/$/,""); }
}

function aggregateStatsFromStore(store){
  const allEmails = []; const allPhones = [];
  let registros = 0;
  Object.values(store).forEach(source=>{
    const rec = applyCountryBucketToRecord(source, CURRENT_ISO);
    if (recordHasCountryData(source, CURRENT_ISO) || !Object.keys(source?.countryBuckets || {}).length) {
      registros += 1;
      if (rec?.emails?.length) allEmails.push(...rec.emails);
      if (rec?.phones?.length) allPhones.push(...rec.phones);
    }
  });
  return {
    registros,
    emails: dedupeEmails(allEmails).length,
    phones: dedupeDisplayPhones(allPhones).length
  };
}

/* ---------- helpers UI ---------- */
function resetGrid(root, refs){
  root.innerHTML = "";
  const g = document.createElement("div");
  g.className = "pair-stack";
  g.innerHTML = `
    <div class="pair-row" id="pair-row-top">
      <div class="pair-cell" id="pair-top-left" data-paired-cell="true"></div>
      <div class="pair-cell" id="pair-top-right" data-paired-cell="true"></div>
    </div>
    <div class="pair-row" id="pair-row-mid">
      <div class="pair-cell" id="pair-mid-left" data-paired-cell="true"></div>
      <div class="pair-cell" id="pair-mid-right" data-paired-cell="true"></div>
    </div>
    <div class="pair-row" id="pair-row-bottom">
      <div class="pair-cell" id="pair-bottom-left" data-paired-cell="true"></div>
      <div class="pair-cell" id="pair-bottom-right" data-paired-cell="true"></div>
    </div>`;
  root.appendChild(g);
  refs.topL = g.querySelector("#pair-top-left");
  refs.topR = g.querySelector("#pair-top-right");
  refs.midL = g.querySelector("#pair-mid-left");
  refs.midR = g.querySelector("#pair-mid-right");
  refs.bottomL = g.querySelector("#pair-bottom-left");
  refs.bottomR = g.querySelector("#pair-bottom-right");
}

/* =================== BOOTSTRAP =================== */
document.addEventListener("DOMContentLoaded", async () => {
  function setupScrollJump() {
    const btn = document.getElementById("scroll-jump");
    const root = document.querySelector("main");
    if (!btn || !root) return;

    const refresh = () => {
      const atTop = root.scrollTop <= 24;
      const nearBottom = (root.scrollTop + root.clientHeight) >= (root.scrollHeight - 24);
      btn.textContent = nearBottom ? "⌃" : "⌄";
      btn.setAttribute("aria-label", nearBottom ? "Volver arriba" : "Ir abajo");
      btn.title = nearBottom ? "Volver arriba" : "Ir abajo";
      btn.classList.toggle("is-top", atTop && !nearBottom);
      btn.classList.toggle("is-bottom", nearBottom);
      if (!atTop && !nearBottom) {
        btn.classList.remove("is-top");
        btn.classList.remove("is-bottom");
      }
    };

    btn.addEventListener("click", () => {
      const nearBottom = (root.scrollTop + root.clientHeight) >= (root.scrollHeight - 24);
      root.scrollTo({
        top: nearBottom ? 0 : root.scrollHeight,
        behavior: "smooth"
      });
    });

    root.addEventListener("scroll", refresh, { passive: true });
    window.addEventListener("resize", refresh, { passive: true });
    refresh();
  }

  function setupPopupTabs() {
    const buttons = Array.from(document.querySelectorAll("[data-tab-target]"));
    const sections = Array.from(document.querySelectorAll(".tab-content"));
    const activate = (id) => {
      buttons.forEach((btn) => btn.classList.toggle("popup-tab--active", btn.dataset.tabTarget === id));
      sections.forEach((section) => {
        const active = section.id === id;
        section.classList.toggle("active", active);
        section.hidden = !active;
      });
    };
    buttons.forEach((btn) => btn.addEventListener("click", () => activate(btn.dataset.tabTarget)));
    activate("extractor");
    return activate;
  }

  const activateTab = setupPopupTabs();
  setupScrollJump();

  // Contenedores
  let mainEl = document.querySelector("main");
  if (!mainEl) { mainEl = document.createElement("main"); document.body.prepend(mainEl); }
  let root = document.getElementById("results");
  if (!root) { root = document.createElement("div"); root.id = "results"; mainEl.appendChild(root); }
  let actions = document.getElementById("actions");
  if (!actions) { actions = document.createElement("div"); actions.id = "actions"; mainEl.appendChild(actions); }
  const planMount = document.createElement("div");
  planMount.id = "plan-status-root";
  let remoteScanMount = document.getElementById("remote-scan-content");
  if (!remoteScanMount) {
    remoteScanMount = document.createElement("div");
    remoteScanMount.id = "remote-scan-content";
  }

  // Tipografía compacta + Grid fluido
  installPopupTypography({ base: 12, h1: 14, small: 11, compact: true });
  useTwoColumnLayout({ colMin: 228, gap: 8, sidePadding: 0 });

  // Grid debajo del header
  const grid = document.createElement("div");
  grid.className = "pair-stack";
  grid.innerHTML = `
    <div class="pair-row" id="pair-row-top">
      <div class="pair-cell" id="pair-top-left" data-paired-cell="true"></div>
      <div class="pair-cell" id="pair-top-right" data-paired-cell="true"></div>
    </div>
    <div class="pair-row" id="pair-row-mid">
      <div class="pair-cell" id="pair-mid-left" data-paired-cell="true"></div>
      <div class="pair-cell" id="pair-mid-right" data-paired-cell="true"></div>
    </div>
    <div class="pair-row" id="pair-row-bottom">
      <div class="pair-cell" id="pair-bottom-left" data-paired-cell="true"></div>
      <div class="pair-cell" id="pair-bottom-right" data-paired-cell="true"></div>
    </div>`;
  root.appendChild(grid);
  const refs = {
    topL: grid.querySelector("#pair-top-left"),
    topR: grid.querySelector("#pair-top-right"),
    midL: grid.querySelector("#pair-mid-left"),
    midR: grid.querySelector("#pair-mid-right"),
    bottomL: grid.querySelector("#pair-bottom-left"),
    bottomR: grid.querySelector("#pair-bottom-right")
  };

  installCopyHandlers(document);

  // UI básica
  let ensureAlertsContainer, toast;
  try {
    const alertsMod = await import("./ui/alerts.js");
    ensureAlertsContainer = alertsMod.ensureAlertsContainer;
    toast = alertsMod.toast;
  } catch (e) {
    const fb = document.createElement("div");
    fb.style.cssText = "background:#f24738;color:#fff;padding:8px;border-radius:8px;margin:8px;";
    fb.textContent = "Error cargando UI básica: " + (e?.message || e);
    mainEl.prepend(fb);
    return;
  }
  const alerts = ensureAlertsContainer();

  // Header
  const headerMount = document.createElement("div");
  headerMount.id = "header-root";
  const sharedTop = document.getElementById("shared-top");
  const mountHost = sharedTop || mainEl;
  mountHost.appendChild(headerMount);
  mountHost.appendChild(planMount);
  let renderHeader, updateHeaderStats;
  try {
    const hdr = await import("./ui/render-header.js");
    renderHeader = hdr.renderHeader;
    updateHeaderStats = hdr.updateHeaderStats;
  } catch (e) {
    toast(alerts, "error", "No se pudo cargar el header.");
    console.error(e);
    return;
  }

  // Módulos
  let runExtractionOnActiveTab, renderH1, renderContacts, renderLinks, renderSocial, renderTechnology, renderActions, exportToExcel, exportToCSV, exportToJSON, renderRemoteScanUi;
  try {
    const [
      extractMod,
      h1Mod,
      contactsMod,
      linksMod,
      socialMod,
      technologyMod,
      actionsMod,
      excelMod,
      csvMod,
      jsonMod,
      remoteScanMod
    ] = await Promise.all([
      import("./services/extract.js"),
      import("./ui/render-h1.js"),
      import("./ui/render-contacts.js"),
      import("./ui/render-links.js"),
      import("./ui/render-social.js"),
      import("./ui/render-technology.js"),
      import("./ui/render-actions.js"),
      import("./services/export-xlsx.js"),
      import("./services/export-csv.js"),
      import("./services/export-json.js"),
      import("./ui/render-remote-scan.js")
    ]);
    ({ runExtractionOnActiveTab } = extractMod);
    ({ renderH1 } = h1Mod);
    ({ renderContacts } = contactsMod);
    ({ renderLinks } = linksMod);
    ({ renderSocial } = socialMod);
    ({ renderTechnology } = technologyMod);
    ({ renderActions } = actionsMod);
    ({ exportToExcel } = excelMod);
    ({ exportToCSV } = csvMod);
    ({ exportToJSON } = jsonMod);
    ({ renderRemoteScan: renderRemoteScanUi } = remoteScanMod);
  } catch (e) {
    toast(alerts, "warning", "Algunos módulos no cargaron.");
    console.error(e);
  }

  // libs export
  async function loadScriptOnce(url, globalName){
    if (globalName && typeof window[globalName] !== "undefined") return;
    await new Promise((res, rej)=>{
      const s = document.createElement("script");
      s.src = chrome.runtime.getURL(url);
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    if (globalName){
      const t0 = Date.now();
      while (typeof window[globalName] === "undefined") {
        if (Date.now() - t0 > 1500) break;
        await new Promise(r => setTimeout(r, 25));
      }
    }
  }
  async function ensureLibs(){
    if (typeof Papa === "undefined")  await loadScriptOnce("libs/papaparse.min.js", "Papa");
    if (typeof XLSX === "undefined")  await loadScriptOnce("libs/xlsx.full.min.js", "XLSX");
  }
  ensureLibs().catch(()=>{});

  const [{ country }, { cache: cachedLicense }] = await Promise.all([
    chrome.storage.local.get("country"),
    getCachedLicenseState()
  ]);
  CURRENT_ISO = country || "ES";
  CURRENT_CC  = ccFromISO(CURRENT_ISO);
  if (cachedLicense?.plan === "premium" || cachedLicense?.plan === "free") {
    await setUserPlan(cachedLicense.plan).catch(() => {});
  }
  let accessState = await getAccessState();
  let lastQueryLabel = "";
  let handleExcelExport = async () => {};
  let handleCsvExport = async () => {};
  let handleJsonExport = async () => {};
  let deepScanUiState = { enabled: false, marketName: null };

  function currentHeaderStats() {
    return aggregateStatsFromStore(loadStore());
  }

  function renderHeaderUi() {
    renderHeader(headerMount, {
      country: CURRENT_ISO,
      stats: currentHeaderStats(),
      access: { ...accessState, lastQueryLabel },
      deepScan: {
        enabled: !!deepScanUiState.enabled && !deepScanUiState.marketName,
        onToggle: async () => {
          const deepLocked = !accessState.canUseDeepExploration;
          const marketName = deepScanUiState.marketName;
          if (deepLocked) {
            await openPremiumUpsell({ source: "deep-scan-toggle", reason: "premium" });
            return;
          }
          if (marketName) return;
          const next = !deepScanUiState.enabled;
          if (next) {
            const ok = await showInfoModal({
              title: "Exploración profunda",
              message: "Activa la extracción profunda solo en tiendas. Recorre enlaces clave del dominio y puede tardar unos segundos más.",
              okText: "Entendido"
            });
            if (!ok) return;
          }
          deepScanUiState.enabled = next;
          await chrome.storage.local.set({ deepScanEnabled: next });
          refreshPlanUi();
          await extractAndRender({ deepScan: next, forceRefresh: true });
        }
      },
      onUpgrade: ({ source }) => openStripeCheckout({ source, plan: "month" }),
      onRefresh: () => extractAndRender({ deepScan: !!deepScanUiState.enabled, forceRefresh: true }),
      onCountryChange: onCountryChanged,
      onExcel: handleExcelExport,
      onCSV: handleCsvExport,
      onJSON: handleJsonExport,
    });
  }

  async function loadDeepScanUiState() {
    const [{ deepScanEnabled }, activeUrl] = await Promise.all([
      chrome.storage.local.get({ deepScanEnabled: false }),
      getActiveTabUrl()
    ]);
    deepScanUiState = {
      enabled: !!deepScanEnabled,
      marketName: detectMarketplaceFromURL(activeUrl || "")
    };
  }
  await loadDeepScanUiState();

  function refreshPlanUi() {
    renderHeaderUi();
    const lastDeepScanLabel = accessState.lastDeepScanLabel || "";
    const marketName = deepScanUiState.marketName;
    const deepLocked = !accessState.canUseDeepExploration;
    const deepDisabled = deepLocked || !!marketName;
    const deepSubtitle = deepLocked
      ? "Disponible solo en Premium."
      : marketName
        ? `Desactivada temporalmente en ${marketName}.`
        : (deepScanUiState.enabled ? "Activa para esta web y las páginas clave." : "Actívala para revisar páginas clave del mismo dominio.");
    renderPlanStatus(planMount, {
      access: { ...accessState, lastDeepScanLabel, lastQueryLabel },
      onUpgrade: ({ source }) => openStripeCheckout({ source, plan: "month" }),
      deepScan: {
        enabled: !!deepScanUiState.enabled && !marketName,
        disabled: deepDisabled,
        refreshDisabled: deepDisabled,
        subtitle: deepSubtitle,
        onToggle: async () => {
          if (deepLocked) {
            await openPremiumUpsell({ source: "deep-scan-toggle", reason: "premium" });
            return;
          }
          if (marketName) return;
          const next = !deepScanUiState.enabled;
          if (next) {
            const ok = await showInfoModal({
              title: "Exploración profunda",
              message: "Activa la extracción profunda solo en tiendas. Recorre enlaces clave del dominio y puede tardar unos segundos más.",
              okText: "Entendido"
            });
            if (!ok) return;
          }
          deepScanUiState.enabled = next;
          await chrome.storage.local.set({ deepScanEnabled: next });
          refreshPlanUi();
          await extractAndRender({ deepScan: next, forceRefresh: true });
        },
        onRefresh: async () => {
          if (deepLocked) {
            await openPremiumUpsell({ source: "deep-scan-refresh", reason: "premium" });
            return;
          }
          if (marketName) return;
          await extractAndRender({ deepScan: true, forceRefresh: true });
        }
      }
    });
  }

  async function syncAccessState() {
    accessState = await getAccessState();
    refreshPlanUi();
    return accessState;
  }

  async function buildExportPayload(format, rowsCount) {
    const activeUrl = await getActiveTabUrl();
    let domain = "";
    try { domain = activeUrl ? new URL(activeUrl).hostname.replace(/^www\./i, "") : ""; } catch {}
    return {
      format,
      country: CURRENT_ISO,
      recordsCount: Math.max(0, Number(rowsCount || 0)),
      domain
    };
  }

  async function authorizeExport(format, rowsCount) {
    const payload = await buildExportPayload(format, rowsCount);
    const allowed = await syncAccessState();

    if (!allowed.canDownload) {
      await openPremiumUpsell({ source: `${format}-export`, reason: "downloads-limit" });
      return null;
    }

    const usage = await registerDownload(payload);
    if (!usage.allowed) {
      await syncAccessState();
      if (usage.reason === "downloads_limit") {
        await openPremiumUpsell({ source: `${format}-export`, reason: "downloads-limit" });
      } else {
        toast(alerts, "error", usage.message || "No se pudo validar la exportación.");
      }
      return null;
    }

    await syncAccessState();
    return usage;
  }

  let syncAfterCheckoutBusy = false;
  async function syncAccessStateAfterFocus() {
    if (syncAfterCheckoutBusy) return;
    syncAfterCheckoutBusy = true;
    try {
      const res = await syncLicenseStatus({ force: true, maxAgeMs: 0 });
      if (res?.ok) {
        await syncAccessState();
      }
    } catch {}
    finally {
      syncAfterCheckoutBusy = false;
    }
  }

  syncLicenseStatus()
    .then(async (res) => {
      if (res?.ok) await syncAccessState();
    })
    .catch(() => {});

  window.addEventListener("focus", () => {
    syncAccessStateAfterFocus();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      syncAccessStateAfterFocus();
    }
  });

  async function scanProvidedUrl(rawUrl, ui = {}) {
    const value = String(rawUrl || "").trim();
    if (!value) {
      toast(alerts, "info", "Pega al menos una URL para escanear.");
      ui.input?.focus();
      return;
    }

    const state = await syncAccessState();
    if (!state.canUseDeepExploration) {
      await openPremiumUpsell({ source: "remote-scan", reason: "premium" });
      return;
    }

    let targets = [];
    try {
      targets = parseBatchUrls(value, MAX_REMOTE_BATCH_URLS);
    } catch (e) {
      toast(alerts, "error", e?.message || "Revisa las URLs pegadas.");
      return;
    }

    if (!targets.length) {
      toast(alerts, "info", "No se detectaron URLs válidas.");
      return;
    }

    const previous = ui.button?.textContent || "Escanear lote";
    if (ui.button) {
      ui.button.disabled = true;
      ui.button.textContent = "Escaneando...";
    }
    ui.setProgress?.({
      visible: true,
      text: `Preparando lote de ${targets.length} URL(s)...`,
      percent: 0
    });

    try {
      toast(alerts, "info", `Escaneando lote premium de ${targets.length} URL(s)...`, 1200);
      let totalVisited = 0;
      let lastResult = null;
      const batchItems = [];

      for (let i = 0; i < targets.length; i++) {
        const targetUrl = targets[i];
        ui.setProgress?.({
          visible: true,
          text: `URL ${i + 1}/${targets.length}: ${targetUrl}`,
          percent: (i / targets.length) * 100
        });

        try {
          const { data, url } = await scanUrlWithExtractor(targetUrl, {
            country: CURRENT_ISO,
            onProgress: ({ index, total, url: progressUrl }) => {
              ui.setProgress?.({
                visible: true,
                text: `URL ${i + 1}/${targets.length} · página ${index}/${total}: ${progressUrl}`,
                percent: ((i + (index / total)) / targets.length) * 100
              });
            }
          });

          let finalRecord = data;
          try {
            const meta = computeKey(url, data.technology);
            const store = loadStore();
            finalRecord = mergeRecord(store[meta.key], url, data, meta, CURRENT_ISO);
            store[meta.key] = finalRecord;
            saveStore(store);
            updateHeaderStats(headerMount, aggregateStatsFromStore(store));
          } catch (e) { console.error("[Store] remote merge/save:", e); }

          await markDeepScanMeta(url, {
            country: CURRENT_ISO,
            deepScan: true,
            visitedCount: Array.isArray(data?.visitedUrls) ? data.visitedUrls.length : 1
          });

          totalVisited += Array.isArray(data?.visitedUrls) ? data.visitedUrls.length : 1;
          lastResult = { record: finalRecord, url };
          batchItems.push({
            status: "OK",
            url,
            title: finalRecord?.h1 || data?.h1 || "Resultado escaneado",
            badge: "Agregado a Excel/CSV",
            detail: [
              finalRecord?.technology ? `Tecnología: ${finalRecord.technology}` : "",
              `${(data.emails || []).length} correos`,
              `${(data.phones || []).length} teléfonos`,
              Array.isArray(data?.visitedUrls) ? `${data.visitedUrls.length} URL(s) analizadas` : ""
            ].filter(Boolean).join(" · "),
            emails: (data.emails || []).slice(0, 8),
            phones: (data.phones || []).slice(0, 8)
          });
        } catch (error) {
          batchItems.push({
            status: "Error",
            url: targetUrl,
            title: "No se pudo procesar",
            badge: "No agregado",
            detail: error?.message || "No se pudo procesar."
          });
        }
      }

      if (lastResult) {
        await renderDataToUi(lastResult.record, lastResult.url, `Escaneo premium por lote completado. Se procesaron ${targets.length} URL(s).`);
      }

      accessState = {
        ...accessState,
        lastDeepScanLabel: buildDeepScanStatusLabel({
          country: CURRENT_ISO,
          deepScan: true,
          visitedCount: totalVisited,
          updatedAt: Date.now()
        })
      };
      refreshPlanUi();
      ui.setProgress?.({
        visible: true,
        text: `Lote completado: ${targets.length} URL(s) procesadas.`,
        percent: 100
      });
      ui.setSummary?.({
        visible: true,
        copy: `Se procesaron ${targets.length} URL(s). Cada resultado correcto ya quedó agregado a los datos exportables de Excel/CSV y también al acumulado de Scraping.`,
        items: batchItems
      });
      toast(alerts, "success", `Lote premium completado: ${targets.length} URL(s).`);
    } catch (e) {
      console.error("[Remote Scan]", e);
      toast(alerts, "error", e?.message || "No se pudo escanear ese lote.");
    } finally {
      if (ui.button) {
        ui.button.disabled = false;
        ui.button.textContent = previous;
      }
    }
  }

  async function renderDataToUi(data, url, footerNote){
    refs.topL.innerHTML = "";
    refs.topR.innerHTML = "";
    refs.midL.innerHTML = "";
    refs.midR.innerHTML = "";
    refs.bottomL.innerHTML = "";
    refs.bottomR.innerHTML = "";
    refs.topL.dataset.sourceUrl = url || "";
    refs.topL.dataset.marketplace = String(!!detectMarketplaceFromURL(url || ""));

    const normalized = {
      ...data,
      emails: dedupeEmails(data?.emails || []),
      phones: dedupeDisplayPhones(data?.phones || []),
      bestLinks: data?.bestLinks || {},
      socialLinks: data?.socialLinks || {}
    };
    lastQueryLabel = `Ultima consulta: ${(normalized.emails?.length || 0) + (normalized.phones?.length || 0)} registros.`;

    try { if (renderH1) renderH1(refs.topL, normalized.h1); } catch (e) { console.error("[UI] h1:", e); }
    try {
      const { techColorMode, themeColor } = await chrome.storage.local.get({ techColorMode: "brand", themeColor: "#111111" });
      if (renderTechnology) renderTechnology(refs.topR, normalized.technology, { colorMode: techColorMode, themeColor, url });
    } catch (e) { console.error("[UI] technology:", e); }

    try { if (renderContacts) renderContacts(refs.midL, [], normalized.phones || [], { only: "phones" }); } catch (e) { console.error("[UI] phones:", e); }
    try { if (renderContacts) renderContacts(refs.midR, normalized.emails || [], [], { only: "emails" }); } catch (e) { console.error("[UI] emails:", e); }

    try { if (renderSocial) renderSocial(refs.bottomL, normalized.socialLinks); } catch (e) { console.error("[UI] social:", e); }
    try { if (renderLinks) renderLinks(refs.bottomR, normalized.bestLinks); } catch (e) { console.error("[UI] links:", e); }

    try {
      if (actions) actions.innerHTML = "";
    } catch (e) { console.error("[UI] actions:", e); }

    refreshPlanUi();

    return normalized;
  }

  /* ---------- Handler central de cambio de país ---------- */
  async function onCountryChanged(newISO){
    try{
      await chrome.storage.local.set({ country: newISO });
      CURRENT_ISO = newISO;
      CURRENT_CC  = ccFromISO(newISO);

      renderHeaderUi();

      updateHeaderStats(headerMount, aggregateStatsFromStore(loadStore()));
      const activeUrl = await getActiveTabUrl();
      const cached = getStoredRecordByUrlForCountry(activeUrl, CURRENT_ISO);
      if (cached && (cached.record?.emails?.length || cached.record?.phones?.length || cached.record?.h1 || cached.record?.technology)) {
        await renderDataToUi(cached.record, cached.url, `Mostrando el progreso guardado para ${countryLabelFromISO(CURRENT_ISO)}.`);
        updateHeaderStats(headerMount, aggregateStatsFromStore(loadStore()));
        renderHeaderUi();
        return;
      }

      resetGrid(root, refs);
      lastQueryLabel = "";
      await extractAndRender({ deepScan: false, forceRefresh: true });
    } catch(e){
      console.error("onCountryChanged:", e);
      toast(alerts, "error", "No se pudo cambiar de país.");
    }
  }

  // Header render + callbacks (usa onCountryChanged)
  handleExcelExport = async () => {
    try {
      await ensureLibs();
      if (typeof XLSX === "undefined") return;

      let rows = rowsFromStore(loadStore());
      if (!rows.length) {
        const last = await getLastExport();
        if (!last.length) { toast(alerts, "info", "No hay datos para exportar."); return; }
        const usage = await authorizeExport("excel", last.length);
        if (!usage) return;
        exportToExcel(last, "datos.xlsx");
        toast(alerts, "success", "Descargando la última exportación.");
        return;
      }
      const usage = await authorizeExport("excel", rows.length);
      if (!usage) return;
      exportToExcel(rows, "datos.xlsx");
      await cacheLastExport(rows);

      saveStore({});
      updateHeaderStats(headerMount, { registros: 0, emails: 0, phones: 0 });
      resetGrid(root, refs);
      lastQueryLabel = "";
      renderHeaderUi();
      toast(alerts, "success", "Exportado. El progreso guardado se limpió.");
    } catch (e) { console.error("[Export Excel]", e); }
  };

  handleCsvExport = async () => {
    try {
      await ensureLibs();

      let rows = rowsFromStore(loadStore());
      if (!rows.length) {
        const last = await getLastExport();
        if (!last.length) { toast(alerts, "info", "No hay datos para exportar."); return; }
        const usage = await authorizeExport("csv", last.length);
        if (!usage) return;
        exportToCSV(last, "datos.csv");
        toast(alerts, "success", "Descargando la última exportación.");
        return;
      }
      const usage = await authorizeExport("csv", rows.length);
      if (!usage) return;
      exportToCSV(rows, "datos.csv");
      await cacheLastExport(rows);

      saveStore({});
      updateHeaderStats(headerMount, { registros: 0, emails: 0, phones: 0 });
      resetGrid(root, refs);
      lastQueryLabel = "";
      renderHeaderUi();
      toast(alerts, "success", "Exportado. El progreso guardado se limpió.");
    } catch (e) { console.error("[Export CSV]", e); }
  };

  handleJsonExport = async () => {
    try {
      let rows = rowsFromStore(loadStore());
      if (!rows.length) {
        const last = await getLastExport();
        if (!last.length) { toast(alerts, "info", "No hay datos para exportar."); return; }
        const usage = await authorizeExport("json", last.length);
        if (!usage) return;
        exportToJSON(last, "datos.json");
        toast(alerts, "success", "Descargando la última exportación.");
        return;
      }
      const usage = await authorizeExport("json", rows.length);
      if (!usage) return;
      exportToJSON(rows, "datos.json");
      await cacheLastExport(rows);

      saveStore({});
      updateHeaderStats(headerMount, { registros: 0, emails: 0, phones: 0 });
      resetGrid(root, refs);
      lastQueryLabel = "";
      renderHeaderUi();
      toast(alerts, "success", "Exportado. El progreso guardado se limpió.");
    } catch (e) { console.error("[Export JSON]", e); }
  };

  renderHeaderUi();

  try {
    if (typeof renderRemoteScanUi === "function") {
      renderRemoteScanUi(remoteScanMount, {
        locked: !accessState.canUseDeepExploration,
        onLockedAttempt: () => openPremiumUpsell({ source: "remote-scan", reason: "premium" }),
        onSubmit: (value, ui) => scanProvidedUrl(value, ui),
        onViewScraping: () => activateTab("extractor")
      });
    }
  } catch (e) { console.error("No se pudo cargar el escaneo por URL:", e); }

  // Render principal (usa columnas)
  async function extractAndRender({ deepScan, forceRefresh = false } = {}){
    try{
      if (!runExtractionOnActiveTab) throw new Error("Servicio de extracción no disponible.");
      const { deepScanEnabled } = await chrome.storage.local.get({ deepScanEnabled: true });
      const state = await syncAccessState();
      const requestedDeep = (typeof deepScan === "boolean") ? deepScan : deepScanEnabled;
      const activeUrl = await getActiveTabUrl();
      const cached = getStoredRecordByUrlForCountry(activeUrl, CURRENT_ISO);
      const deepScanState = activeUrl
        ? await wasUrlAlreadyDeepScanned(activeUrl, CURRENT_ISO)
        : { cached: false, shallowVisited: false, meta: null };
      accessState = {
        ...accessState,
        lastDeepScanLabel: buildDeepScanStatusLabel(deepScanState.meta)
      };
      refreshPlanUi();
      const alreadyDeepScanned = !!deepScanState.cached;
      const useDeep = requestedDeep && state.canUseDeepExploration && !(alreadyDeepScanned && !forceRefresh);

      if (cached && !forceRefresh) {
        await renderDataToUi(
          cached.record,
          cached.url,
          alreadyDeepScanned
            ? "Mostrando los ultimos datos guardados. La exploracion profunda no se repitio porque ya existe un deep scan reciente para esta URL y esta bandera."
            : undefined
        );
        updateHeaderStats(headerMount, aggregateStatsFromStore(loadStore()));
        renderHeaderUi();
        if (alreadyDeepScanned && requestedDeep) {
          return;
        }
      }

      refs.topL.innerHTML = ""; refs.topR.innerHTML = "";
      refs.midL.innerHTML = ""; refs.midR.innerHTML = "";
      refs.bottomL.innerHTML = ""; refs.bottomR.innerHTML = "";
      toast(alerts, "info", useDeep ? "Procesando datos..." : "Actualizando datos...", 900);

      // ⬇️ pasamos SIEMPRE la bandera actual al content
      const { data, url } = await runExtractionOnActiveTab({ deepScan: useDeep, country: CURRENT_ISO });

      // Guardar + stats (persistimos lo que muestra la UI; no reformateamos)
      let finalRecord = data;
      try {
        const meta  = computeKey(url, data.technology);
        const store = loadStore();
        finalRecord = mergeRecord(store[meta.key], url, data, meta, CURRENT_ISO);
        store[meta.key] = finalRecord;
        saveStore(store);
        updateHeaderStats(headerMount, aggregateStatsFromStore(store));
        renderHeaderUi();
      } catch (e) { console.error("[Store] merge/save:", e); }
      await markDeepScanMeta(url, {
        country: CURRENT_ISO,
        deepScan: !!useDeep,
        visitedCount: Array.isArray(data?.visitedUrls) ? data.visitedUrls.length : 0
      });
      accessState = {
        ...accessState,
        lastDeepScanLabel: buildDeepScanStatusLabel({
          country: CURRENT_ISO,
          deepScan: !!useDeep,
          visitedCount: Array.isArray(data?.visitedUrls) ? data.visitedUrls.length : 0,
          updatedAt: Date.now()
        })
      };
      refreshPlanUi();
      await renderDataToUi(finalRecord, url);
      await syncAccessState();

    } catch (e) {
      console.error(e);
      toast(alerts, "error", e?.message || "No se pudo extraer.");
    }
  }

  refreshPlanUi();
  const { deepScanEnabled } = await chrome.storage.local.get({ deepScanEnabled: true });
  await extractAndRender({ deepScan: deepScanEnabled });
});

// popup/main.js
// …tu código existente arriba…

function showDeepScanWarning(marketName) {
  // Si ya existe el banner, lo actualizamos
  let banner = document.getElementById("deepScan-warning");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "deepScan-warning";
    banner.style.cssText = `
      background:#f24738;
      color:#fff;
      padding:8px 10px;
      font-size:13px;
      font-weight:600;
      border-radius:8px;
      margin:6px 0;
      text-align:center;
    `;
    // Lo insertamos al inicio del popup
    const app = document.getElementById("app") || document.body;
    app.prepend(banner);
  }
  banner.textContent = `⚠️ Exploración profunda desactivada en ${marketName} (marketplace/red social).`;
}

// Listener de mensajes
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "deepScan:disabledForMarketplace") {
    showDeepScanWarning(msg.marketName);
  }
});

// ===== Panel de URLs visitadas (en vivo) =====
(function setupDeepScanVisitedPanel(){
  const VISITED_SET = new Set();

  function injectCssOnce() {
    if (document.getElementById("deepScan-panel-css")) return;
    const style = document.createElement("style");
    style.id = "deepScan-panel-css";
    style.textContent = `
      #deepScan-panel{background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:8px;margin:8px 0;}
      #deepScan-panel h4{margin:0 0 6px;font-size:13px;font-weight:800;color:#0f172a;display:flex;justify-content:space-between;align-items:center;}
      #deepScan-counter{font-weight:700;font-size:12px;color:#334155;}
      #deepScan-list{max-height:160px;overflow:auto;font-size:12px;line-height:1.4;color:#334155;}
      #deepScan-list a{color:#111827;text-decoration:none;word-break:break-all;}
      #deepScan-list a:hover{text-decoration:underline;}
    `;
    document.head.appendChild(style);
  }

  function ensurePanel(){
    injectCssOnce();
    let panel = document.getElementById("deepScan-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "deepScan-panel";
      panel.innerHTML = `
        <h4>Exploración profunda <span id="deepScan-counter">0/?</span></h4>
        <div id="deepScan-list"></div>
      `;

      // 👇 Inserta el panel **debajo** del bloque de Exploración profunda
      const anchor = document.getElementById("deepScan-anchor")
                  || document.querySelector('[data-section="deep-scan"]')
                  || document.querySelector(".deepbar");

      if (anchor && anchor.parentElement) {
        anchor.insertAdjacentElement("afterend", panel);
      } else {
        // Fallback: si no encuentra el ancla, lo agrega al final del app
        const app = document.getElementById("app") || document.body;
        app.appendChild(panel);
      }
    }
    return panel;
  }

  function addVisited(url, index, total){
    if (!url || VISITED_SET.has(url)) return;
    VISITED_SET.add(url);

    const panel = ensurePanel();
    const list  = panel.querySelector("#deepScan-list");
    const counter = panel.querySelector("#deepScan-counter");
    counter.textContent = `${VISITED_SET.size}/${total || "?"}`;

    const item = document.createElement("div");
    item.innerHTML = `• <a href="${url}" target="_blank" rel="noreferrer noopener">${url}</a>`;
    list.appendChild(item);
    // auto-scroll al final
    list.scrollTop = list.scrollHeight;
  }

  function finalize(visitedArr, total){
    const panel = ensurePanel();
    const counter = panel.querySelector("#deepScan-counter");
    counter.textContent = `${visitedArr.length}/${total || visitedArr.length}`;
  }

  // Escucha eventos en vivo desde el content
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.action === "deepScan:visitedUrl") {
      addVisited(msg.url, msg.index, msg.total);
    }
    if (msg?.action === "deepScan:complete") {
      const visited = Array.isArray(msg.visited) ? msg.visited : Array.from(VISITED_SET);
      finalize(visited, msg.total);
    }
  });

  // (Opcional) si ya tienes el resultado final con visitedUrls al cerrar la extracción:
  // después de runExtractionOnActiveTab, puedes hacer:
  // if (Array.isArray(result.data?.visitedUrls)) {
  //   result.data.visitedUrls.forEach((u, i) => addVisited(u, i+1, result.data.visitedUrls.length));
  //   finalize(result.data.visitedUrls, result.data.visitedUrls.length);
  // }
})();

// ========== Paywall – Popup ==========

// Pequeño flash visual al pulsar
function flashActive(el) {
  if (!el) return;
  const prev = el.style.boxShadow;
  el.style.boxShadow = "0 0 0 3px rgba(37,99,235,.35)";
  setTimeout(() => { el.style.boxShadow = prev; }, 150);
}

// Modal show/hide
const pwModal = document.getElementById("paywall-modal");
const pwBackdrop = document.getElementById("paywall-backdrop");
const pwClose = document.getElementById("pw-close");

function openPaywall() {
  if (pwBackdrop) pwBackdrop.style.display = "block";
  if (pwModal) pwModal.style.display = "grid";
}
function closePaywall() {
  if (pwBackdrop) pwBackdrop.style.display = "none";
  if (pwModal) pwModal.style.display = "none";
}
pwBackdrop?.addEventListener("click", closePaywall);
pwClose?.addEventListener("click", closePaywall);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePaywall(); });

// Si ya tienes una licencia (en el futuro), puedes saltarte el bind. Por ahora, siempre bind.
async function bindPaywall() {
  const gated = document.querySelectorAll("[data-paywalled='true'][data-paywall-scope='plans']");
  gated.forEach((el) => {
    if (el.dataset.pwBound === "1") return;
    el.dataset.pwBound = "1";

    const handler = (ev) => {
      flashActive(el);
      // si es checkbox, vuelve a OFF para que no quede activado
      if (el.tagName === "INPUT" && el.type === "checkbox") {
        setTimeout(() => { el.checked = false; }, 0);
      }
      ev.preventDefault();
      ev.stopImmediatePropagation?.();
      ev.stopPropagation();
      openPaywall();
    };

    if (el.tagName === "INPUT" && el.type === "checkbox") {
      el.addEventListener("change", handler);
      el.addEventListener("click", handler, true);
    } else {
      el.addEventListener("click", handler);
    }
  });
}

function initPlanChooser() {
  document.querySelectorAll(".pw-card").forEach((card) => {
    card.addEventListener("click", async (e) => {
      const plan = card.dataset.plan; // "day" | "month" | "year"
      if (e.target.closest(".pw-choose") || e.currentTarget === card) {
        try {
          const res = await chrome.runtime.sendMessage({ type: "OPEN_CHECKOUT", plan });
          if (res && res.ok) {
            closePaywall();
          } else {
            alert(res?.message || "No se pudo iniciar el pago. Intenta de nuevo.");
          }
        } catch {
          alert("Error de red al iniciar el pago.");
        }
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindPaywall();
  initPlanChooser();
});
