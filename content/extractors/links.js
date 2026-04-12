const KW = {
  privacy:["privacidad","privacy","proteccion-de-datos","aviso-legal","datos-personales"],
  legal:["legal","aviso-legal"],
  contact:["contacto","contact","soporte","support","ayuda","atencion-al-cliente"],
  terms:["terminos","términos","condiciones","terms","condiciones-de-uso","terminos-y-condiciones"]
};

export function extractKeyLinks() {
  const links = Array.from(document.querySelectorAll("a")).map(a=>({
    href:(a.href||"").trim(),
    raw:a.getAttribute("href")||""
  }));
  const lc = (s)=>s.toLowerCase();
  const best = {privacy:null,contact:null,legal:null,terms:null};

  for (const {href} of links) {
    const L = lc(href);
    if (!best.privacy && KW.privacy.some(k=>L.includes(k))) best.privacy = href;
    if (!best.contact && KW.contact.some(k=>L.includes(k))) best.contact = href;
    if (!best.legal && KW.legal.some(k=>L.includes(k))) best.legal = href;
    if (!best.terms && KW.terms.some(k=>L.includes(k))) best.terms = href;
  }
  return best;
}

export function sameOriginDeepScanCandidates(best) {
  const out = [];
  const origin = location.origin;
  [best?.contact, best?.privacy, best?.legal, best?.terms].forEach(u=>{
    if (!u) return;
    try {
      const url = new URL(u, location.href);
      if (url.origin === origin) out.push(url.href);
    } catch {}
  });
  // única, máximo 3
  return [...new Set(out)].slice(0, 3);
}
