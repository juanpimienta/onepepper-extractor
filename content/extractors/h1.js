import { txt } from "../utils.js";
export function getPrimaryH1() {
  const first = document.querySelector("h1"); if (first && txt(first)) return txt(first);
  const aria = document.querySelector('[role="heading"][aria-level="1"]'); if (aria && txt(aria)) return txt(aria);
  const alt = document.querySelector(".page-title, .entry-title, .product_title");
  return (alt && txt(alt)) || "No se encontró H1";
}
