// ===============================================================
// Fallback de invisibles/dir-marks (si HIDDEN no existe en este módulo)
const INVIS = (typeof HIDDEN !== "undefined")
  ? HIDDEN
  : /[\u200B-\u200D\u2060\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g;

// ===============================================================
// Emails: normaliza, valida y filtra falsos positivos
// opts:
//  - originDomain: registrable de la página donde se activó el scraper (ej. "accessoiresmoto.com")
//  - scope: "any" | "same-site"  (si "same-site" solo permite emails cuyo dominio termine en originDomain)
//  - extraBlockedDomains: string[] dominios extra a bloquear
//  - extraBlockedEmails:  string[] emails exactos a bloquear
export function dedupeEmails(items = [], opts = {}) {
  const out  = [];
  const seen = new Set();

  const {
    originDomain = "",
    scope = "any",
    extraBlockedDomains = [],
    extraBlockedEmails  = []
  } = opts;

  const DISALLOWED_TLDS = new Set([
    "png","jpg","jpeg","webp","gif","svg","avif","ico","bmp",
    "css","js","mjs","ts","map","json","pdf","xml",
    "woff","woff2","ttf","otf","eot",
    "mp4","webm","m4v","mov","avi"
  ]);

  const ASSET_EXT_RE = /\.(?:png|jpe?g|webp|gif|svg|avif|ico|bmp)(?:[#?].*)?$/i;
  const FILE_EXT_RE  = /\.(?:css|js|mjs|ts|map|json|pdf|xml|woff2?|ttf|otf|eot|mp4|webm|m4v|mov|avi)(?:[#?].*)?$/i;

  // Sentry / Wixpress / ingest
  const BLOCKED_DOMAIN_RE = /(?:^|\.)sentry(?:-next)?\.wixpress\.com$|^sentry\.io$|^o\d+\.ingest\.sentry\.io$/i;

  // placeholders / desechables
  const PLACEHOLDER_DOMAIN_RE = /(?:^|\.)example\.(?:com|org|net)$|^(?:mailinator|tempmail|10minutemail)\./i;
  const PLACEHOLDER_LOCAL_RE  = /^(?:example|exemple|test|usuario|user|correo|email|name)$/i;
  const NOREPLY_LOCAL_RE      = /^(?:no[-_.]?reply|donotreply|noreply)$/i;

  // local-part tokens/uuids
  const HEX_LOCAL_RE  = /^[0-9a-f]{16,}$/i;
  const UUID_LOCAL_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Email estricto
  const EMAIL_STRICT = /^[a-z0-9](?:[a-z0-9._%+-]{0,63})@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9]))+$/i;

  // listas de bloqueo
  const BLOCKED_EMAILS = new Set([
    "exemple@mail.com", "contacto@proveedores.com", "configurablerecsservice.prod.euamazon", 
    "example.com","example.org","example.net","correo.com","dominio.com",
    "midominio.com","tudominio.com","sudominio.com","domain.com",
    "website.com","mysite.com","yoursite.com","yourdomain.com","tudominio.es",
    "email.com",
    ...extraBlockedEmails.map(s => String(s).toLowerCase())
  ]);
  const EXTRA_BLOCKED_DOMAINS = new Set(extraBlockedDomains.map(s => String(s).toLowerCase()));

  const registrable = (d="") => {
    d = String(d).toLowerCase().replace(/^www\./, "");
    const parts = d.split(".").filter(Boolean);
    if (parts.length <= 2) return d;
    return parts.slice(-2).join(".");
  };

  const clean = (raw = "") => {
    let s = String(raw)
      .replace(INVIS, "")     // << usar fallback local
      .trim();

    s = s.replace(/^mailto:\s*/i, "");
    s = s.replace(/^\s*[<>]+/, "");
    s = s.replace(/\\u00[0-9a-f]{2,4}/gi, "");

    if (/%[0-9a-f]{2}/i.test(s)) { try { s = decodeURIComponent(s); } catch {} }

    s = s.replace(/^(?:\d{2}|[_\-\s])+/, "");
    s = s.replace(/\s*@\s*/, "@");
    s = s.replace(/^[,;]+|[,;]+$/g, "");
    return s;
  };

  const looksLikeAssetEmail = (orig, local, domain) => {
    if (/@\d+x\.(?:png|jpe?g|webp|gif|svg|avif)\b/i.test(orig)) return true;
    if (ASSET_EXT_RE.test(orig) || FILE_EXT_RE.test(orig)) return true;

    const tld = (domain.split(".").pop() || "").toLowerCase();
    if (DISALLOWED_TLDS.has(tld)) return true;

    if (/_\d{2,4}x\d{2,4}\b/i.test(local)) return true;
    if (/(?:^|_)(?:logo|image|img|banner|hero|icon|sprite|design|kids|mega[_-]menu)\b/i.test(local)) return true;

    return false;
  };

  const originReg = originDomain ? registrable(originDomain) : "";

  for (const it of items) {
    const orig = String(it || "");
    const s = clean(orig);
    const key = s.toLowerCase();

    if (!s || s.length > 254) continue;
    if (BLOCKED_EMAILS.has(key)) continue;
    if (!EMAIL_STRICT.test(s)) continue;

    const [local, domainRaw] = s.split("@");
    const domain = domainRaw.toLowerCase();

    if (EXTRA_BLOCKED_DOMAINS.has(domain)) continue;
    if (BLOCKED_DOMAIN_RE.test(domain)) continue;
    if (PLACEHOLDER_DOMAIN_RE.test(domain)) continue;
    if (PLACEHOLDER_LOCAL_RE.test(local)) continue;
    if (NOREPLY_LOCAL_RE.test(local)) continue;
    if (HEX_LOCAL_RE.test(local) || UUID_LOCAL_RE.test(local)) continue;
    if (looksLikeAssetEmail(orig, local, domain)) continue;

    const tld = domain.split(".").pop() || "";
    if (!/^[a-z]{2,24}$/i.test(tld)) continue;

    if (scope === "same-site" && originReg) {
      const domReg = registrable(domain);
      if (domReg !== originReg) continue;
    }

    if (!seen.has(key)) {
      seen.add(key);
      out.push(s);
    }
  }

  return out;
}

// ===============================================================
// Phones: normaliza, valida y filtra falsos positivos
// opts:
//  - defaultCc: indicativo país sin "+", p.ej. "34" (ES), "33" (FR)
//  - minNationalDigits: mínimo de dígitos para nacional (7 por defecto)
//  - maxDigits: máximo global (15 E.164)
//  - allowNational: si true, puede devolver nacional; si false, fuerza +E.164 si hay defaultCc
export function dedupePhones(items = [], opts = {}) {
  const {
    defaultCc = "",
    minNationalDigits = 7,
    maxDigits = 15,
    allowNational = true,
  } = opts;

  const out = [];
  const seen = new Set();

  const clean = (raw = "") => {
    let s = String(raw).replace(INVIS, "").trim();  // << usar fallback local
    s = s.replace(/^tel:\s*/i, "");
    s = s.replace(/\s+ext\.?\s*\d+|\s+x\s*\d+|\s+#\s*\d+/gi, "");
    s = s.replace(/(?!^)\+/g, "");
    if (s.startsWith("00")) s = "+" + s.slice(2);
    s = s.replace(/[\s().-]+/g, "");
    s = s.replace(/^[,;:/\\]+|[,;:/\\]+$/g, "");
    return s;
  };

  const isPlausible = (s) => {
    if (!s) return false;
    if (/[@a-z]/i.test(s)) return false;
    if ((s.match(/\+/g) || []).length > 1) return false;
    const digits = s.replace(/\D/g, "");
    if (digits.length < minNationalDigits) return false;
    if (digits.length > maxDigits) return false;
    if (/^(\d)\1{6,}$/.test(digits)) return false; // 0000000, 1111111...
    return true;
  };

  const toE164Maybe = (s) => {
    if (s.startsWith("+")) {
      const digits = s.slice(1).replace(/\D/g, "");
      if (!digits) return null;
      return "+" + digits;
    }
    const digits = s.replace(/\D/g, "");
    if (defaultCc && digits.length >= minNationalDigits && digits.length <= 12) {
      return "+" + String(defaultCc) + digits;
    }
    return allowNational ? digits : null;
  };

  for (const it of items) {
    const c = clean(it);
    if (!isPlausible(c)) continue;
    const norm = toE164Maybe(c);
    if (!norm) continue;
    const key = String(norm);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(norm);
    }
  }
  return out;
}
