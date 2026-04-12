// content/extractors/emails.js (MEJORADO + anti-fakes)
import { normalizeCandidateString, normalizeEmailFinal } from "./obfuscation.js";

/* ===== Utilidades ===== */
const EMAIL_CORE = "[a-zA-Z0-9._%+\\-]{1,64}";
const HOST_CORE  = "[a-zA-Z0-9.-]{1,253}\\.[a-zA-Z]{2,63}";

const AT  = "(?:@|\\(at\\)|\\[at\\]|\\{at\\}|\\s+at\\s+|\\s?arroba\\s?)";
const DOT = "(?:\\.|\\(dot\\)|\\[dot\\]|\\{dot\\}|\\s+dot\\s+|\\s?punto\\s?)";

const RX_TEXT = new RegExp(`\\b(${EMAIL_CORE}\\s*(?:${AT})\\s*${HOST_CORE})\\b`, "gi");
const RX_MAILTO = /^mailto:([^?]+)/i;

function cleanup(email){
  return normalizeEmailFinal(String(email).toLowerCase()
    .replace(/\s+/g,' ')
    .replace(/\(at\)|\[at\]|\{at\}|\s+at\s+|arroba/gi,'@')
    .replace(/\(dot\)|\[dot\]|\{dot\}|\s+dot\s+|punto/gi,'.')
    .replace(/\s+/g,'')
  );
}

/* ===== Anti-fakes ===== */
// Dominios/TLD usados como ejemplo o “plantilla”
const FAKE_TLDS    = new Set(["example","invalid","localhost","local","test"]);
const FAKE_DOMAINS = new Set([
  "example.com","example.org","example.net","correo.com","dominio.com",
  "midominio.com","tudominio.com","sudominio.com","domain.com",
  "website.com","mysite.com","yoursite.com","yourdomain.com","tudominio.es",
  "email.com","proveedores.com", "configurablerecsservice.prod.eu" ,
]);
// Localparts típicos de plantilla
const FAKE_LOCALS  = new Set([
  "email","tuemail","youremail","myemail","miemail","name","nombre",
  "username","usuario","test","demo","sample","yourname","tunombre",
  "correo","mail", "configdrivenrecommendationsservice"
]);

function parseEmail(e){
  const [local, host=""] = String(e).toLowerCase().split("@");
  const parts = host.split(".");
  const tld = parts.length ? parts[parts.length-1] : "";
  return { local, domain: host, tld };
}

export function isFakeEmail(e){
  const { local, domain, tld } = parseEmail(e);
  if (!local || !domain) return true;

  if (FAKE_TLDS.has(tld)) return true;
  if (FAKE_DOMAINS.has(domain) && (
      FAKE_LOCALS.has(local) ||
      /^(?:tu|your|mi|my)?(?:email|correo)$/.test(local) ||
      /(nombre|name|usuario|username)/.test(local)
    )) return true;

  // Patrones muy comunes de ejemplo
  if (/^(youremail|tuemail|name|nombre|test|demo)[._\-]?\d*@/.test(e)) return true;
  if (/@(example|domain|dominio|website|mysite|yoursite)\./.test(e)) return true;

  return false;
}

function uniqueValid(list){
  const seen = new Set(); const out=[];
  for(const e of list){
    const x = (e||'').trim().toLowerCase();
    if(!x) continue;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)) continue;
    if(isFakeEmail(x)) continue;                 // <<--- filtro anti-fake
    if(!seen.has(x)){ seen.add(x); out.push(x); }
  }
  return out;
}

/* Cloudflare data-cfemail */
function decodeCfEmail(encoded){
  try{
    const r = parseInt(encoded.substr(0,2),16); let out='';
    for(let i=2;i<encoded.length;i+=2){ out += String.fromCharCode(parseInt(encoded.substr(i,2),16) ^ r); }
    return out;
  }catch{ return null; }
}

/* === Recolector profundo (texto + attrs + shadow DOM) === */
function collectTextAndAttrsDeep(root, buf) {
  const stack = [root];
  while (stack.length) {
    const el = stack.pop();
    if (!el) continue;

    if (el.nodeType === Node.TEXT_NODE) { buf.push(el.nodeValue); continue; }
    if (el.nodeType !== Node.ELEMENT_NODE) continue;

    ["title","aria-label","data-tooltip","data-hovercard-id","email","href","content"].forEach(a=>{
      if (el.hasAttribute && el.hasAttribute(a)) buf.push(el.getAttribute(a));
    });

    // cualquier data-*
    if (el.attributes) {
      for (let k = 0; k < el.attributes.length; k++) {
        const at = el.attributes[k];
        if (at && at.name && at.name.startsWith('data-') && at.value) buf.push(at.value);
      }
    }

    el.childNodes && el.childNodes.forEach(n => stack.push(n));
    if (el.shadowRoot) el.shadowRoot.childNodes.forEach(n => stack.push(n));
  }
}

function collectFromMailto(set, root=document){
  root.querySelectorAll('a[href^="mailto:"]').forEach(a=>{
    const href=a.getAttribute('href')||'';
    const m=href.match(RX_MAILTO);
    if(m) set.add(cleanup(m[1]));
  });
}
function collectFromCfEmail(set, root=document){
  root.querySelectorAll('[data-cfemail]').forEach(el=>{
    const hex=el.getAttribute('data-cfemail'); const dec=decodeCfEmail(hex);
    if(dec) set.add(cleanup(dec));
  });
}
function collectFromJsonLd(set, root=document){
  root.querySelectorAll('script[type="application/ld+json"]').forEach(s=>{
    try{
      const j = JSON.parse(s.textContent||"{}");
      const arr = Array.isArray(j)? j : [j];
      arr.forEach(o=>{
        if(typeof o.email==='string') set.add(cleanup(o.email));
        if(Array.isArray(o.contactPoint)) o.contactPoint.forEach(cp=> cp?.email && set.add(cleanup(cp.email)));
      });
    }catch{}
  });
}
function collectFromMeta(set, root=document){
  root.querySelectorAll('meta[content], [content]').forEach(el=>{
    const c = el.getAttribute('content')||'';
    RX_TEXT.lastIndex = 0;                    // 🔧 reset por cadena
    let m; while((m = RX_TEXT.exec(c))) set.add(cleanup(m[1]));
  });
}
function collectFromVisibleText(set, root=document){
  const buf = [];
  collectTextAndAttrsDeep(root.body || root, buf);
  const TEXT = buf.join("\n");

  RX_TEXT.lastIndex = 0;                      // 🔧 reset antes de usar
  let m; while((m = RX_TEXT.exec(TEXT))) set.add(cleanup(m[1]));

  // concatenaciones "in"+"fo"+"@dominio.com"
  const JSConcat = /"([^"]+)"\s*\+\s*"([^"]+)"/g;
  let mm; while((mm = JSConcat.exec(TEXT))) {
    const merged = (mm[1] + mm[2]);
    RX_TEXT.lastIndex = 0;                    // 🔧 reset para cada merged
    let m2; while((m2 = RX_TEXT.exec(merged))) set.add(cleanup(m2[1]));
  }
}
function collectFromIframes(set, root=document){
  root.querySelectorAll('iframe').forEach(f=>{ try{
    if(f.contentDocument) extractIntoSet(set, f.contentDocument);
  }catch{} });
}

function extractIntoSet(targetSet, root=document){
  collectFromMailto(targetSet, root);
  collectFromCfEmail(targetSet, root);
  collectFromJsonLd(targetSet, root);
  collectFromMeta(targetSet, root);
  collectFromVisibleText(targetSet, root);
  collectFromIframes(targetSet, root);
}

/* ===== API principal (sin OCR) ===== */
export function extractEmails(opts = {}){
  const doc = opts.doc || document;           // 👈 soporte para deep scan
  const set = new Set();
  extractIntoSet(set, doc);
  return uniqueValid(Array.from(set)).sort((a,b)=> a.localeCompare(b));
}


// --- Extras: postfiltro anti-fakes comunes ---
const DENY_EXACT = new Set(["example@example.com","exemple@mail.com","test@test.com","email@example.com", "configdrivenrecommendationsservice@configurablerecsservice.prod.eu"]);
export function postFilterEmails(list=[]){
  return Array.from(new Set(list))
    .map(e=>String(e).toLowerCase().trim())
    .filter(e=>!DENY_EXACT.has(e))
    .filter(e=>/^[a-z0-9._%+\-]{1,64}@[a-z0-9.-]{1,253}\.[a-z]{2,24}$/i.test(e))
    .filter(e=>!/(^|\.)example\.(com|org|net)$/i.test(e.split("@")[1]||""))
    .filter(e=>!/^mailto:/i.test(e))
    .filter(e=>!/^(img|ima|image|static|cdn)[-_]?[0-9a-z]*@/i.test(e));
}
