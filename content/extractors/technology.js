import { html } from "../utils.js";
import { detectMarketplaceFromURL } from "./marketplace.js";

function fallback(h) {
  if (h.includes("cdn.shopify.com") || /window\.Shopify|Shopify\.theme/i.test(h)) return "Shopify";
  if (h.includes("woocommerce") || /wc-add-to-cart|wp-content\/plugins\/woocommerce/i.test(h)) return "WooCommerce";
  if (h.includes("wp-content") || h.includes("wordpress")) return "WordPress";
  if (h.includes("prestashop")) return "PrestaShop";
  if (h.includes("magento/2") || h.includes("data-mage-init")) return "Adobe Commerce (Magento 2)";
  if (h.includes("magento/1")) return "Adobe Commerce (Magento 1)";
  if (h.includes("bigcommerce")) return "BigCommerce";
  if (h.includes("wix")) return "Wix";
  if (h.includes("squarespace")) return "Squarespace";
  if (h.includes("salesforce")) return "Salesforce";
  if (h.includes("ecwid")) return "Ecwid";
  if (h.includes("ecart")) return "Ecart";
  return "Tecnología personalizada o no identificada";
}

export function detectTechnology(url) {
  const mkt = detectMarketplaceFromURL(url); if (mkt) return mkt;
  const techEls = document.querySelectorAll("a.technology__link .technology__name");
  if (techEls.length) {
    const list = Array.from(techEls).map(el=>el.textContent.trim()).filter(Boolean);
    if (list.length) return list.join(", ");
  }
  return fallback(html());
}
