// popup/services/extract.js
// -> Pasa country dentro de options y NO normaliza/deduplica resultados.
//    La deduplicación/visualización la hacen los extractores + popup/main.

import { getSupportedCountries } from "../ui/render-header.js";
import { detectMarketplaceFromURL } from "../../content/extractors/marketplace.js";

export async function runExtractionOnActiveTab(opts = {}) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error("No se encontró la pestaña activa.");

  const notify = (action, extra = {}) => {
    try {
      chrome.runtime.sendMessage(
        { action, tabId: tab.id, url: tab.url, ...extra },
        () => { void chrome.runtime?.lastError; }
      );
    } catch (_) {}
  };

  notify("icon:loading");

  const restricted =
       /^chrome(-extension)?:\/\//i.test(tab.url || "")
    || /chromewebstore\.google\.com/i.test(tab.url || "")
    || /^edge:\/\//i.test(tab.url || "")
    || /^about:/i.test(tab.url || "");
  if (restricted) {
    notify("icon:error");
    throw new Error("Esta página es restringida (chrome://, Web Store, etc.).");
  }

  // ---------- Preferencia vs estado EFECTIVO por URL ----------
  // Preferencia persistente del usuario
  const { deepScanEnabled } = await chrome.storage.local.get("deepScanEnabled");
  const userPref = !!deepScanEnabled;

  // Si opts.deepScan viene definido, tiene prioridad sobre la preferencia guardada.
  const requestedDeepScan = (typeof opts.deepScan === "boolean") ? !!opts.deepScan : userPref;

  // Desactivar temporalmente en marketplaces/redes (sin tocar la preferencia)
  const marketName = detectMarketplaceFromURL(tab.url);
  const deepScanEffective = requestedDeepScan && !marketName;

  if (requestedDeepScan && marketName) {
    console.info(`[deep-scan] Desactivado temporalmente en ${marketName} para ${tab.url}`);
    notify("deepScan:disabledForMarketplace", { marketName });
  }

  // ---------- Ping + inyección del content script si hace falta ----------
  const ping = () => new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => { if (!done) resolve(false); }, 500);
    chrome.tabs.sendMessage(tab.id, { action: "ping" }, (res) => {
      done = true; clearTimeout(t); resolve(res && res.ok);
    });
  });

  let alive = await ping();

  if (!alive) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content/main.js"],
      });
    } catch (e) {
      notify("icon:error");
      throw new Error("No se pudo inyectar content/main.js: " + (e?.message || e));
    }
    alive = await ping();
  }

  if (!alive) {
    notify("icon:error");
    throw new Error("El content script no responde. Revisa content/main.js y la consola.");
  }

  // ---- País y CC (para UI y para pasar al content) ----
  const { country } = await chrome.storage.local.get("country");
  const iso = country || "ES";
  let cc = "";
  try {
    const meta = (getSupportedCountries() || []).find(c => c.iso === iso);
    cc = meta?.cc ? String(meta.cc) : "";
  } catch (_) {}

  // ---- Enviar extracción (COUNTRY dentro de options) ----
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      tab.id,
      {
        action: "extract",
        url: tab.url,
        options: {
          country: iso,
          cc,
          // Importante: pasamos el estado EFECTIVO (preferencia AND no-marketplace)
          deepScan: deepScanEffective
        }
      },
      (res) => {
        if (chrome.runtime.lastError) {
          notify("icon:error");
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!res || res.error) {
          notify("icon:error");
          return reject(new Error(res?.error || "Sin respuesta del content."));
        }

        // ⚠️ No deduplicamos ni normalizamos aquí.
        // Los extractores (ES/FR/IT/INTL) y popup/main hacen la lógica de salida.
        const data = { ...res };

        // Badge con nº de emails únicos (si quieres exactitud, lo hace luego popup/main)
        const leadsCount = Array.isArray(data.emails) ? new Set(data.emails).size : 0;
        notify("icon:done", { url: tab.url, leadsCount });

        resolve({ data, url: tab.url });
      }
    );
  });
}
