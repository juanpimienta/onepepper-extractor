export const txt = (n) => (n ? n.textContent?.trim() : null);
export const html = () => document.documentElement.outerHTML.toLowerCase();
export const pageText = () => document.body?.innerText || "";

