// popup/services/export-xlsx.js
import { dedupeEmails, dedupePhones } from "../utils/dedupe.js";
import { getSupportedCountries } from "../ui/render-header.js";
// Asume que XLSX (SheetJS) ya está cargado vía <script> como haces en ensureLibs()

const isPlainObject = (x) => x && typeof x === "object" && !Array.isArray(x);
const isArrayOfObjects = (arr) => Array.isArray(arr) && arr.length && isPlainObject(arr[0]);

function triggerDownloadBlob(blob, filename){
  try {
    if (chrome?.downloads?.download) {
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({ url, filename }, () => { void chrome.runtime?.lastError; });
      return;
    }
  } catch (_) {}
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

function rowsFromState(state){
  const iso  = state.country || "ES";
  const meta = (getSupportedCountries() || []).find(c => c.iso === iso) || {};
  const cc   = meta.cc || "";

  const emails  = dedupeEmails(state.emails || []);
  const phones  = dedupePhones(state.phones || [], { defaultCc: cc });
  const domains = Array.isArray(state.domains)
    ? Array.from(new Set(state.domains.map(d => String(d).trim().toLowerCase()).filter(Boolean)))
    : [];

  const max = Math.max(emails.length, phones.length, domains.length);
  const rows = [];
  for (let i = 0; i < max; i++){
    rows.push({
      Email:    emails[i]  || "",
      Telefono: phones[i]  || "",
      Dominio:  domains[i] || ""
    });
  }
  return rows;
}

function normalizeInput(input){
  if (Array.isArray(input)) return input;
  if (isPlainObject(input)) return rowsFromState(input);
  return [];
}

export function exportToExcel(input = [], filename = "datos.xlsx"){
  if (typeof XLSX === "undefined") throw new Error("Librería XLSX no cargada.");
  const rows = normalizeInput(input);
  if (!rows.length) throw new Error("No hay filas para exportar.");

  // Si nos pasan AOA lo convertimos a objetos con cabecera simple
  let ws;
  if (isArrayOfObjects(rows)){
    ws = XLSX.utils.json_to_sheet(rows);
  } else {
    const aoa = Array.isArray(rows) ? rows : [];
    ws = XLSX.utils.aoa_to_sheet(aoa);
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leads");
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  triggerDownloadBlob(blob, filename);
}

// Alias por si en algún sitio usas otro nombre
export const exportXLSX = exportToExcel;
