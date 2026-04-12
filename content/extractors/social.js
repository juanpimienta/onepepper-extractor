export function extractSocial() {
  const links = Array.from(document.querySelectorAll("a"));
  const patterns = {
    facebook:/facebook\.com/i, twitter:/(^|\/\/)x\.com|twitter\.com/i, instagram:/instagram\.com/i,
    linkedin:/linkedin\.com/i, youtube:/youtube\.com|youtu\.be/i, pinterest:/pinterest\.com/i,
    whatsapp:/wa\.me|api\.whatsapp\.com/i, tiktok:/tiktok\.com/i
  };
  const out = {};
  for (const a of links) {
    const href = (a.href||"").trim();
    for (const [k,re] of Object.entries(patterns)){ if(!out[k] && re.test(href)){ out[k]=href; break; } }
  }
  return out;
}
