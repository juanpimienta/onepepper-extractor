// popup/services/export-csv.js
import { dedupeEmails, dedupePhones } from "../utils/dedupe.js";
import { getSupportedCountries } from "../ui/render-header.js";

/* ---------- helpers ---------- */
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

function objectsToCSV(rows){
  const headers = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const out = [headers.join(",")];
  for (const r of rows) out.push(headers.map(h => esc(r[h])).join(","));
  return out.join("\n");
}

function aoaToCSV(rows){
  return rows.map(r =>
    r.map(v => {
      const s = (v == null ? "" : String(v));
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(",")
  ).join("\n");
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
  // Si es array de objetos → tal cual. Si es "state" → lo convertimos a filas objeto.
  if (Array.isArray(input)) return input;
  if (isPlainObject(input)) return rowsFromState(input);
  return [];
}

/* ---------- API ---------- */
export function exportToCSV(input = [], filename = "datos.csv"){
  const rows = normalizeInput(input);
  if (!rows.length) throw new Error("No hay filas para exportar.");

  let csv;
  if (isArrayOfObjects(rows)) csv = objectsToCSV(rows);
  else                        csv = aoaToCSV(rows); // por si nos pasan AOA

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  triggerDownloadBlob(blob, filename);
}

// Alias por si en algún sitio usas otro nombre
export const exportCSV = exportToCSV;
