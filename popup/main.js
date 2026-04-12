// popup/main.js — OCR off, dedupe por país y GRID fluido 2 col

import { dedupeEmails, dedupePhones } from "./utils/dedupe.js";
import { getSupportedCountries } from "./ui/render-header.js";
import { installCopyHandlers } from "./ui/copy.js";
import { installPopupTypography } from "./ui/typography.js";
import { useTwoColumnLayout } from "./ui/layout-grid.js";
import {
  canDownload,
  getAccessState,
  registerDownload
} from "./services/access.js";
import { getOrCreateInstallId, syncLicenseStatus } from "./services/license.js";
import { renderPlanStatus } from "./ui/render-plan-status.js";
import { showInfoModal } from "./ui/modal.js";
import { MAX_REMOTE_BATCH_URLS, parseBatchUrls, scanUrlWithExtractor } from "./services/remote-scan.js";

const STORE_KEY = "extractedDataByOrigin";
const LEGACY_KEY = "extractedData";
const GENERIC_TECH = /no identificada|personalizada/i;
const MARKET_HOSTS = /(amazon\.[a-z.]+|aliexpress\.[a-z.]+|ebay\.[a-z.]+|etsy\.com|mercadolibre\.[a-z.]+|facebook\.com|instagram\.com|tiktok\.com|walmart\.[a-z.]+)/i;
const LAST_EXPORT_KEY = "lastExportRows";
const DEEP_SCAN_META_KEY = "deepScanMetaByUrl";
const DEEP_SCAN_FRESH_MS = 1000 * 60 * 60 * 24;

let CURRENT_ISO = "ES";
let CURRENT_CC  = "";

async function openPremiumUpsell({ source = "premium-feature", reason = "premium" } = {}) {
  const title = reason === "downloads-limit"
    ? "Has alcanzado el límite del plan gratuito"
    : "Función disponible en Premium";
  const message = reason === "downloads-limit"
    ? "Ya usaste tus 10 descargas gratuitas. Puedes seguir viendo los resultados extraídos, pero para exportar más o activar exploración profunda necesitas el plan Premium."
    : "La exploración profunda forma parte del plan Premium. Con Premium tienes exportaciones ilimitadas y acceso completo a esta función.";

  const wantsUpgrade = await showInfoModal({
    title,
    message,
    okText: "Ver Premium"
  });

  if (!wantsUpgrade) return false;

  try {
    const installId = await getOrCreateInstallId();
    const res = await chrome.runtime.sendMessage({ type: "OPEN_CHECKOUT", plan: "premium", source, installId });
    return !!res?.ok;
  } catch {
    return false;
  }
}

/* ---------- helpers país/CC ---------- */
function ccFromISO(iso){
  try {
    const meta = (getSupportedCountries()||[]).find(c=>c.iso===iso);
    return meta?.cc ? String(meta.cc) : "";
  } catch { return ""; }
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
    socialLinks: {}, technology:"" };
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
function mergeRecord(existing, url, data, meta){
  const { key, origin, isMarketplace } = meta;
  const rec = existing || makeEmptyRecord(key, origin, isMarketplace);
  if (!rec.urls.includes(url)) rec.urls.push(url);
  if (isMarketplace) { if (!rec.h1 && data.h1) rec.h1 = data.h1; }
  else { if (isBetterH1(rec.h1, data.h1)) rec.h1 = data.h1; }

  // Emails: normalizados
  rec.emails = dedupeEmails([...(rec.emails||[]), ...(data.emails||[])]);

  // Teléfonos: dedupe por display, no tocamos formato
  rec.phones = dedupeDisplayPhones([...(rec.phones||[]), ...(data.phones||[])]);

  rec.bestLinks = rec.bestLinks || {};
  ["privacy","contact","legal","terms"].forEach(k=>{
    if (!rec.bestLinks[k] && data.bestLinks?.[k]) rec.bestLinks[k] = data.bestLinks[k];
  });
  rec.socialLinks = rec.socialLinks || {};
  Object.entries(data.socialLinks || {}).forEach(([k,v])=>{
    if (!rec.socialLinks[k] && v) rec.socialLinks[k] = v;
  });

  if (isBetterTech(rec.technology, data.technology)) rec.technology = data.technology;
  if (!rec.technology && data.technology) rec.technology = data.technology;
  return rec;
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
  const cc = CURRENT_CC || ccFromISO(CURRENT_ISO) || ""; // indicativo país actual

  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const rec = store[k] || {};

    // 1) Normalizaciones
    const emails = dedupeEmails(rec.emails || []);
    const phones = dedupePhones(rec.phones || [], { defaultCc: cc });

    // 2) Campos derivados
    const numero      = i + 1;
    const urlExacta   = (rec.urls && rec.urls[0]) || k || ""; // primera URL guardada
    const dominioLimp = stripDomain(rec.origin || "");
    const nombre      = rec.h1 || "";
    const tecnologia  = rec.technology || "";

    // 3) Enlaces clave
    const privacidad  = rec.bestLinks?.privacy  || "";
    const contacto    = rec.bestLinks?.contact  || "";
    const legal       = rec.bestLinks?.legal    || "";
    const terminos    = rec.bestLinks?.terms    || "";

    // 4) Redes
    const facebook = rec.socialLinks?.facebook || "";
    const tiktok   = rec.socialLinks?.tiktok   || "";
    const insta    = rec.socialLinks?.instagram|| "";
    const linkedin = rec.socialLinks?.linkedin || "";
    const twitter  = rec.socialLinks?.twitter  || "";
    const youtube  = rec.socialLinks?.youtube  || "";
    const pinterest= rec.socialLinks?.pinterest|| "";
    const whatsapp = rec.socialLinks?.whatsapp || "";

    // Si NO hay correos → una sola fila “normal”
    if (!emails.length) {
      rows.push([
        numero,
        urlExacta,
        dominioLimp,
        nombre,
        tecnologia,
        "",                  // Correos vacío
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

    // Fila principal (primer correo) con todos los datos
    rows.push([
      numero,
      urlExacta,
      dominioLimp,
      nombre,
      tecnologia,
      emails[0],            // primer correo
      phones.join(", "),    // teléfonos SOLO en la primera fila
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

    // Filas adicionales: por cada correo extra, solo Dominio + Correos
    for (let j = 1; j < emails.length; j++) {
      rows.push([
        "",                  // Número
        "",                  // URL
        dominioLimp,         // Dominio duplicado
        "",                  // Nombre
        "",                  // Tecnología
        emails[j],           // este correo
        "",                  // Teléfono
        "",                  // WhatsApp
        "",                  // Privacidad
        "",                  // Contacto
        "",                  // Legal
        "",                  // Términos
        "",                  // Facebook
        "",                  // TikTok
        "",                  // Instagram
        "",                  // LinkedIn
        "",                  // Twitter
        "",                  // YouTube
        ""                   // Pinterest
      ]);
    }
  }

  return rows;
}

function rowsFromStorePro(store){
  const rows = [];
  const keys = Object.keys(store).sort();
  const cc = CURRENT_CC || ccFromISO(CURRENT_ISO) || "";

  keys.forEach((k,i)=>{
    const rec = store[k] || {};
    const emails = dedupeEmails(rec.emails||[]);
    const phones = dedupePhones(rec.phones||[], { defaultCc: cc });
    const dominioLimp = stripDomain(rec.origin || "");

    const base = {
      "Número": i+1,
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

    // Primer correo: fila completa
    rows.push({ ...base, "Correos": emails[0] });

    // Correos adicionales: solo Dominio + Correos (lo demás vacío)
    for (let j = 1; j < emails.length; j++) {
      rows.push({
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

  return rows;
}

function stripDomain(urlOrOrigin=""){
  try { const u = new URL(urlOrOrigin.startsWith("http") ? urlOrOrigin : ("https://" + urlOrOrigin.replace(/^\/\//,''))); 
        return u.hostname.replace(/^www\./, ""); } catch { 
    return String(urlOrOrigin).replace(/^https?:\/\//, "").replace(/^www\./,"").replace(/\/$/,""); }
}

function aggregateStatsFromStore(store){
  const allEmails = []; const allPhones = [];
  Object.values(store).forEach(rec=>{
    if (rec?.emails?.length) allEmails.push(...rec.emails);
    if (rec?.phones?.length) allPhones.push(...rec.phones);
  });
  return {
    registros: Object.keys(store).length,
    emails: dedupeEmails(allEmails).length,
    phones: dedupeDisplayPhones(allPhones).length
  };
}

/* ---------- helpers UI ---------- */
function resetGrid(root, refs){
  root.innerHTML = "";
  const g = document.createElement("div");
  g.className = "grid-2";
  g.innerHTML = `<div id="col-left"></div><div id="col-right"></div>`;
  root.appendChild(g);
  refs.colL = g.querySelector("#col-left");
  refs.colR = g.querySelector("#col-right");
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
  installPopupTypography({ base: 11, h1: 13, small: 10, compact: true });
  useTwoColumnLayout({ colMin: 228, gap: 10, sidePadding: 10 });

  // Grid debajo del header
  const grid = document.createElement("div");
  grid.className = "grid-2";
  grid.innerHTML = `<div id="col-left"></div><div id="col-right"></div>`;
  root.appendChild(grid);
  const refs = { colL: grid.querySelector("#col-left"), colR: grid.querySelector("#col-right") };

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
  let runExtractionOnActiveTab, renderH1, renderContacts, renderLinks, renderSocial, renderTechnology, renderActions, exportToExcel, exportToCSV, renderRemoteScanUi;
  try {
    ({ runExtractionOnActiveTab } = await import("./services/extract.js"));
    ({ renderH1 }         = await import("./ui/render-h1.js"));
    ({ renderContacts }   = await import("./ui/render-contacts.js"));
    ({ renderLinks }      = await import("./ui/render-links.js"));
    ({ renderSocial }     = await import("./ui/render-social.js"));
    ({ renderTechnology } = await import("./ui/render-technology.js"));
    ({ renderActions }    = await import("./ui/render-actions.js"));
    ({ exportToExcel }    = await import("./services/export-xlsx.js"));
    ({ exportToCSV }      = await import("./services/export-csv.js"));
    ({ renderRemoteScan: renderRemoteScanUi } = await import("./ui/render-remote-scan.js"));
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

  const { country } = await chrome.storage.local.get("country");
  CURRENT_ISO = country || "ES";
  CURRENT_CC  = ccFromISO(CURRENT_ISO);
  await syncLicenseStatus({ force: true }).catch(() => {});
  let accessState = await getAccessState();
  let handleExcelExport = async () => {};
  let handleCsvExport = async () => {};

  function refreshPlanUi() {
    const lastDeepScanLabel = accessState.lastDeepScanLabel || "";
    renderPlanStatus(planMount, {
      access: { ...accessState, lastDeepScanLabel },
      onUpgrade: ({ source }) => openPremiumUpsell({ source, reason: "premium" })
    });
  }

  async function syncAccessState() {
    accessState = await getAccessState();
    refreshPlanUi();
    return accessState;
  }

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
            finalRecord = mergeRecord(store[meta.key], url, data, meta);
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
    refs.colL.innerHTML = "";
    refs.colR.innerHTML = "";

    const normalized = {
      ...data,
      emails: dedupeEmails(data?.emails || []),
      phones: dedupeDisplayPhones(data?.phones || []),
      bestLinks: data?.bestLinks || {},
      socialLinks: data?.socialLinks || {}
    };

    try {
      const { techColorMode, themeColor } = await chrome.storage.local.get({ techColorMode: "brand", themeColor: "#111111" });
      if (renderTechnology) renderTechnology(refs.colR, normalized.technology, { colorMode: techColorMode, themeColor, url });
    } catch (e) { console.error("[UI] technology:", e); }
    try { if (renderContacts) renderContacts(refs.colR, normalized.emails || [], [], { only: "emails" }); } catch (e) { console.error("[UI] emails:", e); }
    try { if (renderLinks) renderLinks(refs.colR, normalized.bestLinks); } catch (e) { console.error("[UI] links:", e); }

    try { if (renderH1) renderH1(refs.colL, normalized.h1); } catch (e) { console.error("[UI] h1:", e); }
    try { if (renderContacts) renderContacts(refs.colL, [], normalized.phones || [], { only: "phones" }); } catch (e) { console.error("[UI] phones:", e); }
    try { if (renderSocial) renderSocial(refs.colL, normalized.socialLinks); } catch (e) { console.error("[UI] social:", e); }

    try {
      if (actions && typeof renderActions === "function") {
        renderActions(actions, {
          onCSV: handleCsvExport,
          onExcel: handleExcelExport,
          footerNote: footerNote || (accessState.isPremium ? "Plan Premium activo." : `Plan Gratis: ${accessState.usageLabel} descargas usadas.`)
        });
      }
    } catch (e) { console.error("[UI] actions:", e); }

    return normalized;
  }

  /* ---------- Handler central de cambio de país ---------- */
  async function onCountryChanged(newISO){
    try{
      await chrome.storage.local.set({ country: newISO });
      CURRENT_ISO = newISO;
      CURRENT_CC  = ccFromISO(newISO);

      // Limpiar store y grid para no mezclar resultados de banderas distintas
      saveStore({});
      updateHeaderStats(headerMount, { registros: 0, emails: 0, phones: 0 });
      resetGrid(root, refs);

      // Re-extraer SOLO para la nueva bandera
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
        const allowed = await syncAccessState();
        if (!canDownload(allowed.freeDownloadsUsed, allowed.plan)) {
          await openPremiumUpsell({ source: "excel-export", reason: "downloads-limit" });
          return;
        }
        const usage = await registerDownload();
        if (!usage.allowed) {
          await syncAccessState();
          await openPremiumUpsell({ source: "excel-export", reason: "downloads-limit" });
          return;
        }
        exportToExcel(last, "datos.xlsx");
        await syncAccessState();
        toast(alerts, "success", "Descargando la última exportación.");
        return;
      }
      const allowed = await syncAccessState();
      if (!canDownload(allowed.freeDownloadsUsed, allowed.plan)) {
        await openPremiumUpsell({ source: "excel-export", reason: "downloads-limit" });
        return;
      }
      const usage = await registerDownload();
      if (!usage.allowed) {
        await syncAccessState();
        await openPremiumUpsell({ source: "excel-export", reason: "downloads-limit" });
        return;
      }
      exportToExcel(rows, "datos.xlsx");
      await cacheLastExport(rows);
      await syncAccessState();

      saveStore({});
      updateHeaderStats(headerMount, { registros: 0, emails: 0, phones: 0 });
      resetGrid(root, refs);
      toast(alerts, "success", "Exportado. Datos limpiados.");
    } catch (e) { console.error("[Export Excel]", e); }
  };

  handleCsvExport = async () => {
    try {
      await ensureLibs();

      let rows = rowsFromStore(loadStore());
      if (!rows.length) {
        const last = await getLastExport();
        if (!last.length) { toast(alerts, "info", "No hay datos para exportar."); return; }
        const allowed = await syncAccessState();
        if (!canDownload(allowed.freeDownloadsUsed, allowed.plan)) {
          await openPremiumUpsell({ source: "csv-export", reason: "downloads-limit" });
          return;
        }
        const usage = await registerDownload();
        if (!usage.allowed) {
          await syncAccessState();
          await openPremiumUpsell({ source: "csv-export", reason: "downloads-limit" });
          return;
        }
        exportToCSV(last, "datos.csv");
        await syncAccessState();
        toast(alerts, "success", "Descargando la última exportación.");
        return;
      }
      const allowed = await syncAccessState();
      if (!canDownload(allowed.freeDownloadsUsed, allowed.plan)) {
        await openPremiumUpsell({ source: "csv-export", reason: "downloads-limit" });
        return;
      }
      const usage = await registerDownload();
      if (!usage.allowed) {
        await syncAccessState();
        await openPremiumUpsell({ source: "csv-export", reason: "downloads-limit" });
        return;
      }
      exportToCSV(rows, "datos.csv");
      await cacheLastExport(rows);
      await syncAccessState();

      saveStore({});
      updateHeaderStats(headerMount, { registros: 0, emails: 0, phones: 0 });
      resetGrid(root, refs);
      toast(alerts, "success", "Exportado. Datos limpiados.");
    } catch (e) { console.error("[Export CSV]", e); }
  };

  renderHeader(headerMount, {
    country: CURRENT_ISO,
    stats: aggregateStatsFromStore(loadStore()),

    onCountryChange: onCountryChanged,
    onExcel: handleExcelExport,
    onCSV: handleCsvExport,
  });

  // Deep Scan toggle
  try {
    const { renderDeepScanToggle } = await import("./ui/render-deep-scan.js");
    const { deepScanEnabled } = await chrome.storage.local.get({ deepScanEnabled: false });
    renderDeepScanToggle(headerMount, {
      enabled: deepScanEnabled,
      locked: !accessState.canUseDeepExploration,
      onLockedAttempt: () => openPremiumUpsell({ source: "deep-scan-toggle", reason: "premium" }),
      onChange: async (v) => {
        const state = await syncAccessState();
        if (!state.canUseDeepExploration) {
          await openPremiumUpsell({ source: "deep-scan-toggle", reason: "premium" });
          return;
        }
        await chrome.storage.local.set({ deepScanEnabled: !!v });
        await extractAndRender({ deepScan: !!v, forceRefresh: true });
      },
      onRefreshNow: async () => {
        const state = await syncAccessState();
        if (!state.canUseDeepExploration) {
          await openPremiumUpsell({ source: "deep-scan-refresh", reason: "premium" });
          return;
        }
        await extractAndRender({ deepScan: true, forceRefresh: true });
      }
    });
  } catch (e) { console.error("No se pudo cargar el toggle de deep scan:", e); }

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
      const cached = getStoredRecordByUrl(activeUrl);
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
        if (alreadyDeepScanned && requestedDeep) {
          return;
        }
      }

      refs.colL.innerHTML = ""; refs.colR.innerHTML = "";
      toast(alerts, "info", useDeep ? "Procesando datos..." : "Actualizando datos...", 900);

      // ⬇️ pasamos SIEMPRE la bandera actual al content
      const { data, url } = await runExtractionOnActiveTab({ deepScan: useDeep, country: CURRENT_ISO });

      // Guardar + stats (persistimos lo que muestra la UI; no reformateamos)
      let finalRecord = data;
      try {
        const meta  = computeKey(url, data.technology);
        const store = loadStore();
        finalRecord = mergeRecord(store[meta.key], url, data, meta);
        store[meta.key] = finalRecord;
        saveStore(store);
        updateHeaderStats(headerMount, aggregateStatsFromStore(store));
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
