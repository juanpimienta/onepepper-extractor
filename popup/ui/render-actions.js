// popup/ui/render-actions.js
import { exportToExcel } from "../services/export-xlsx.js";
import { exportToCSV } from "../services/export-csv.js";

function uniq(arr = [], keyFn = (x) => x) {
  const seen = new Set();
  const out = [];
  for (const v of arr) {
    const k = keyFn(v);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

const emailKey = (e) => String(e || "").trim().toLowerCase();
const phoneKey = (p) => String(p || "").replace(/[^\d+]/g, "");

function rowsFromStore() {
  const store = JSON.parse(localStorage.getItem("extractedDataByOrigin") || "{}");
  const origins = Object.keys(store).sort();
  return origins.map((origin, i) => {
    const rec = store[origin];
    const emails = uniq(rec.emails || [], emailKey);
    const phones = uniq(rec.phones || [], phoneKey);
    return {
      "#": i + 1,
      Dominio: origin,
      URL: (rec.urls && rec.urls[0]) || "",
      H1: rec.h1 || "",
      Correos: emails.join(", "),
      Telefonos: phones.join(", "),
      Privacidad: rec.bestLinks?.privacy || "",
      Contacto: rec.bestLinks?.contact || "",
      Legal: rec.bestLinks?.legal || "",
      Terminos: rec.bestLinks?.terms || "",
      Tecnologia: rec.technology || "",
      Facebook: rec.socialLinks?.facebook || "",
      Instagram: rec.socialLinks?.instagram || "",
      LinkedIn: rec.socialLinks?.linkedin || "",
      Twitter: rec.socialLinks?.twitter || "",
      YouTube: rec.socialLinks?.youtube || "",
      Pinterest: rec.socialLinks?.pinterest || "",
      WhatsApp: rec.socialLinks?.whatsapp || "",
      TikTok: rec.socialLinks?.tiktok || "",
      URLs_todas: (rec.urls || []).join(" | ")
    };
  });
}

async function ensureLibs() {
  if (typeof Papa === "undefined") {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = chrome.runtime.getURL("libs/papaparse.min.js");
      s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }
  if (typeof XLSX === "undefined") {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = chrome.runtime.getURL("libs/xlsx.full.min.js");
      s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }
}

export async function renderActions(container, { onCSV, onExcel, footerNote = "" } = {}) {
  const rows = rowsFromStore();

  container.innerHTML = `
    <h2>Descargas</h2>
    <button id="btn-csv" class="primary-btn">Descargar registros en CSV</button>
    <button id="btn-xlsx" class="primary-btn">Descargar registros en Excel</button>
    ${footerNote ? `<p class="muted">${footerNote}</p>` : ""}
    <p class="muted" style="margin-top:6px;">Registros por dominio: <strong>${rows.length}</strong></p>
  `;

  const btnCsv = container.querySelector("#btn-csv");
  const btnXlsx = container.querySelector("#btn-xlsx");

  btnCsv.addEventListener("click", async () => {
    if (typeof onCSV === "function") return onCSV();
    await ensureLibs();
    exportToCSV(rowsFromStore(), "datos_por_dominio.csv");
  });
  btnXlsx.addEventListener("click", async () => {
    if (typeof onExcel === "function") return onExcel();
    await ensureLibs();
    exportToExcel(rowsFromStore(), "datos_por_dominio.xlsx");
  });
}
