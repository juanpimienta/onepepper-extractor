// popup/ui/typography.js
// Tipografia y densidad global del popup

let typoInjected = false;

export function installPopupTypography(cfg = {}) {
  if (typoInjected) return;
  typoInjected = true;

  const base = Number.isFinite(cfg.base) ? cfg.base : 11;
  const h1 = Number.isFinite(cfg.h1) ? cfg.h1 : 13;
  const small = Number.isFinite(cfg.small) ? cfg.small : 10;
  const compact = cfg.compact !== false;

  const css = `
    :root{
      --font-base:${base}px;
      --font-title:${h1}px;
      --font-small:${small}px;
      --font-value:${base + 1}px;
      --font-hero:${h1 + 1}px;
      --pad-xs:${compact ? 3 : 5}px;
      --pad-sm:${compact ? 5 : 7}px;
      --pad-md:${compact ? 7 : 9}px;
      --pad-lg:${compact ? 9 : 12}px;
      --rad-sm:${compact ? 8 : 10}px;
      --rad-md:${compact ? 12 : 14}px;
    }

    html, body, main, #results, #remote-scan-content {
      font-size: var(--font-base);
      line-height: 1.32;
    }

    .section-title,
    .links-title,
    .tech-card .tech-label,
    .h1-card .tech-label,
    .remote-scan__title,
    .remote-scan__summary-title {
      font-size: var(--font-title) !important;
      line-height: 1.2 !important;
      font-weight: 800 !important;
    }

    .hdr-title {
      font-size: var(--font-hero) !important;
      line-height: 1.15 !important;
      font-weight: 800 !important;
    }

    .muted,
    .remote-scan__label,
    .remote-scan__copy,
    .remote-scan__progress-copy,
    .remote-scan__summary-copy,
    .remote-scan__summary-meta,
    .ds-label,
    .country-hint,
    .popup-tab,
    .popup-tab__badge,
    .chip,
    .pill {
      font-size: var(--font-small) !important;
    }

    .muted,
    .remote-scan__label,
    .remote-scan__copy,
    .remote-scan__progress-copy,
    .remote-scan__summary-copy,
    .remote-scan__summary-meta,
    .remote-scan__summary-data-line,
    .ds-label,
    .country-hint,
    .tech-card .tech-label,
    .h1-card .tech-label {
      color: #64748b !important;
      font-size: calc(var(--font-small) - 1px) !important;
      line-height: 1.28 !important;
    }

    .site-name,
    .h1-card .tech-title,
    .tech-card .tech-title,
    .contact-value,
    .section-value,
    .remote-scan__summary-sub,
    .remote-scan__summary-item strong {
      font-size: var(--font-value) !important;
      line-height: 1.28 !important;
      font-weight: 800 !important;
      color: #0f172a !important;
    }

    .hdr-wrap {
      padding: 12px !important;
      border-radius: 18px !important;
    }

    .hdr-row,
    .hdr-stats,
    .hdr-actions,
    .chips,
    .pills,
    .social-grid {
      gap: var(--pad-sm) !important;
    }

    .ccbtn,
    .btn,
    .copy-btn,
    .chip-copy,
    .pill-btn,
    .remote-scan__btn,
    .remote-scan__summary-btn {
      font-size: var(--font-base) !important;
      border-radius: var(--rad-sm) !important;
      padding: var(--pad-sm) var(--pad-md) !important;
    }

    .section-card,
    .tech-card,
    .links-card,
    .remote-scan,
    .remote-scan__summary-item,
    .contact-row {
      border-radius: var(--rad-md) !important;
    }

    .section-card,
    .links-card {
      padding: var(--pad-lg) !important;
    }

    .tech-card,
    .h1-card {
      min-height: 64px !important;
      padding: var(--pad-lg) !important;
    }

    .tech-card .tech-row,
    .tech-card .tech-left,
    .h1-card .tech-row {
      gap: var(--pad-md) !important;
    }

    .tech-card .tech-logo,
    .tech-logo-box,
    .social-btn {
      width: 34px !important;
      height: 34px !important;
    }

    .tech-logo-img,
    .social-btn img {
      width: 20px !important;
      height: 20px !important;
    }

    .chip,
    .contact-row {
      padding: var(--pad-md) var(--pad-lg) !important;
    }

    .chip-icon,
    .stat .icon {
      font-size: 14px !important;
    }

    .hero-h1 .h1-text {
      font-size: var(--font-value) !important;
      line-height: 1.28 !important;
    }

    .remote-scan__input,
    .ccmenu-search {
      font-size: var(--font-base) !important;
      border-radius: var(--rad-sm) !important;
    }

    .remote-scan__summary-data-line {
      font-size: var(--font-small) !important;
      line-height: 1.32 !important;
    }
  `;

  const style = document.createElement("style");
  style.id = "popup-typography-v3";
  style.textContent = css;
  document.head.appendChild(style);
}
