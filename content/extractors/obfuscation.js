// content/extractors/obfuscation.js

/** Entidades HTML (&amp; &#64; ...) */
export function decodeHtmlEntities(s = "") {
  const el = document.createElement("textarea");
  el.innerHTML = s;
  return el.textContent || "";
}

/** Quita zero-width chars */
export function stripZeroWidth(s = "") {
  return String(s).replace(/[\u200B-\u200D\uFEFF]/g, "");
}

/** De-ofusca SOLO tokens completos (evita tocar 'navigator', etc.) */
export function deobfuscateAtDot(s = "") {
  let t = String(s);
  t = t.replace(/\[(?:\s*)at(?:\s*)\]/gi, "@")
       .replace(/\((?:\s*)at(?:\s*)\)/gi, "@")
       .replace(/\b(?:at|arroba)\b/gi, "@");
  t = t.replace(/\[(?:\s*)dot(?:\s*)\]/gi, ".")
       .replace(/\((?:\s*)dot(?:\s*)\)/gi, ".")
       .replace(/\b(?:dot|punto)\b/gi, ".");
  return t.replace(/\s+/g, " ").trim();
}

/** RTL / bidi override */
export function reverseIfBidi(text = "", el) {
  try {
    const cs = el ? getComputedStyle(el) : null;
    const isBidi =
      (cs && (cs.direction === "rtl" || cs.unicodeBidi === "bidi-override")) ||
      (el && (el.getAttribute("dir") || "").toLowerCase() === "rtl");
    return isBidi ? text.split("").reverse().join("") : text;
  } catch { return text; }
}

/** Pipeline de normalización */
export function normalizeCandidateString(s = "", elForBidi) {
  let t = stripZeroWidth(s);
  t = decodeHtmlEntities(t);
  t = reverseIfBidi(t, elForBidi);
  t = deobfuscateAtDot(t);
  return t.trim();
}

/** Normaliza un email final */
export function normalizeEmailFinal(e = "") {
  return stripZeroWidth(String(e).replace(/^mailto:/i, "").trim());
}

/* ---- Stubs para compatibilidad (por si algún archivo viejo los importa) ---- */
export function decodeCfEmail(_hex) { return null; }
export function maybeBase64Decode(_s) { return null; }
