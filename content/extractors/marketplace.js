// content/extractors/marketplace.js
// Devuelve el nombre del marketplace/red social si la URL coincide, si no null.

export function detectMarketplaceFromURL(url = "") {
  if (!url) return null;

  const map = [
    // === Marketplaces globales ===
    { name: "Amazon",        re: /(^|\.)amazon\./i },
    { name: "eBay",          re: /(^|\.)ebay\./i },
    { name: "AliExpress",    re: /(^|\.)aliexpress\./i },
    { name: "Etsy",          re: /(^|\.)etsy\.com/i },
    { name: "Mercado Libre", re: /(^|\.)mercadolibre\./i },
    { name: "Miravia",       re: /(^|\.)miravia\./i },
    { name: "Rakuten",       re: /(^|\.)rakuten\./i },
    { name: "Walmart",       re: /(^|\.)walmart\./i },
    { name: "Target",        re: /(^|\.)target\.com/i },
    { name: "Best Buy",      re: /(^|\.)bestbuy\.com/i },
    { name: "Newegg",        re: /(^|\.)newegg\.com/i },
    { name: "Cdiscount",     re: /(^|\.)cdiscount\.com/i },
    { name: "Fnac",          re: /(^|\.)fnac\./i },
    { name: "Otto",          re: /(^|\.)otto\.de/i },
    { name: "Zalando",       re: /(^|\.)zalando\./i },
    { name: "Lazada",        re: /(^|\.)lazada\./i },
    { name: "Shopee",        re: /(^|\.)shopee\./i },
    { name: "Flipkart",      re: /(^|\.)flipkart\.com/i },
    { name: "JD.com",        re: /(^|\.)jd\.com/i },
    { name: "Taobao",        re: /(^|\.)taobao\.com/i },
    { name: "Tmall",         re: /(^|\.)tmall\.com/i },
    { name: "Alibaba",       re: /(^|\.)alibaba\.com/i },
    { name: "Carrefour",     re: /(^|\.)carrefour\./i },
    { name: "Decathlon",     re: /(^|\.)decathlon\./i },
    { name: "Allegro",       re: /(^|\.)allegro\.pl/i },
    { name: "Kaufland",      re: /(^|\.)kaufland\./i },
    { name: "Sears",         re: /(^|\.)sears\.com/i },
    { name: "Overstock",     re: /(^|\.)overstock\.com/i },
    { name: "Wayfair",       re: /(^|\.)wayfair\.com/i },
    { name: "ManoMano",      re: /(^|\.)manomano\./i },
    { name: "Bol.com",       re: /(^|\.)bol\.com/i },

    // === Redes sociales ===
    { name: "Facebook",      re: /(^|\.)facebook\.com/i },
    { name: "Instagram",     re: /(^|\.)instagram\.com/i },
    { name: "WhatsApp",      re: /(^|\.)whatsapp\.com/i },
    { name: "Messenger",     re: /(^|\.)messenger\.com/i },
    { name: "TikTok",        re: /(^|\.)tiktok\.com/i },
    { name: "LinkedIn",      re: /(^|\.)linkedin\.com/i },
    { name: "Twitter/X",     re: /(^|\.)twitter\.com/i },
    { name: "Twitter/X",     re: /(^|\.)x\.com/i },
    { name: "Pinterest",     re: /(^|\.)pinterest\.com/i },
    { name: "Snapchat",      re: /(^|\.)snapchat\.com/i },
    { name: "YouTube",       re: /(^|\.)youtube\.com/i },
    { name: "Twitch",        re: /(^|\.)twitch\.tv/i },
    { name: "Reddit",        re: /(^|\.)reddit\.com/i },
    { name: "Discord",       re: /(^|\.)discord\.com/i },
    { name: "Telegram",      re: /(^|\.)t\.me/i },
    { name: "Telegram",      re: /(^|\.)telegram\.org/i },
    { name: "WeChat",        re: /(^|\.)wechat\.com/i },
    { name: "VK",            re: /(^|\.)vk\.com/i },
    { name: "Line",          re: /(^|\.)line\.me/i },
    { name: "KakaoTalk",     re: /(^|\.)kakao\.com/i },
    { name: "Clubhouse",     re: /(^|\.)joinclubhouse\.com/i },

    // === Otros servicios donde no interesa deep scan ===
    { name: "Gmail",         re: /(^|\.)mail\.google\.com/i },
    { name: "Outlook",       re: /(^|\.)outlook\.com/i },
    { name: "Yahoo Mail",    re: /(^|\.)mail\.yahoo\.com/i },
  ];

  return (map.find(m => m.re.test(url)) || {}).name || null;
}
