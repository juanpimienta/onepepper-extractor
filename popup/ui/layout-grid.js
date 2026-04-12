// popup/ui/layout-grid.js
// Fuerza 2 columnas SIEMPRE. Sin media queries.

export function useTwoColumnLayout(opts = {}) {
  const {
    gap = 14,          // espacio entre tarjetas
    sidePadding = 14,  // padding horizontal del contenedor
  } = opts;

  const STYLE_ID = "grid2-style";
  if (document.getElementById(STYLE_ID)) return;

  const css = `
    html, body { overflow-x: hidden; }

    #results {
      padding-left: ${sidePadding}px;
      padding-right: ${sidePadding}px;
      box-sizing: border-box;
      width: 100%;
      max-width: 100%;
    }

    /* 2 columnas siempre */
    .grid-2 {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: ${gap}px;
      align-items: start;
    }

    /* evita que los hijos "empujen" el grid y generen scroll */
    .grid-2 > * { min-width: 0; }

    /* tarjetas/sections no deben imponer ancho fijo */
    .grid-2 .card,
    .grid-2 section {
      max-width: 100%;
      box-sizing: border-box;
      overflow: hidden;
    }
  `;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}
