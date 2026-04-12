let planStylesInjected = false;

function injectStyles() {
  if (planStylesInjected) return;
  planStylesInjected = true;

  const style = document.createElement("style");
  style.id = "plan-status-styles";
  style.textContent = `
    .plan-status{
      margin: 0 10px 8px;
      padding: 12px;
      border: 1px solid #dbe4ea;
      border-radius: 16px;
      background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
      box-shadow: 0 8px 18px rgba(15, 23, 42, 0.05);
    }
    .plan-status__row{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      flex-wrap:wrap;
    }
    .plan-status__chips{
      display:flex;
      gap:8px;
      flex-wrap:wrap;
    }
    .plan-chip{
      display:inline-flex;
      align-items:center;
      gap:6px;
      padding:6px 10px;
      border-radius:999px;
      font-size:12px;
      font-weight:700;
      border:1px solid transparent;
    }
    .plan-chip--free{
      background:#fff7d1;
      color:#8a5b00;
      border-color:#f2bb13;
    }
    .plan-chip--premium{
      background:#e6faff;
      color:#075985;
      border-color:#27cdf2;
    }
    .plan-chip--usage{
      background:#f8fafc;
      color:#334155;
      border-color:#dbe4ea;
    }
    .plan-chip--feature{
      background:#fff1f2;
      color:#9f1239;
      border-color:#fecdd3;
    }
    .plan-status__copy{
      margin-top:8px;
      font-size:13px;
      line-height:1.4;
      color:#334155;
    }
    .plan-status__meta{
      margin-top:8px;
      padding-top:8px;
      border-top:1px dashed #dbe4ea;
      font-size:12px;
      line-height:1.4;
      color:#475569;
    }
    .plan-status__btn{
      border:1px solid #27cdf2;
      background:#27cdf2;
      color:#fff;
      border-radius:12px;
      padding:8px 12px;
      font-size:12px;
      font-weight:700;
      cursor:pointer;
    }
    .plan-status__btn--ghost{
      background:#fff;
      color:#0f172a;
      border-color:#dbe4ea;
    }
  `;
  document.head.appendChild(style);
}

export function renderPlanStatus(mount, { access, onUpgrade } = {}) {
  if (!mount || !access) return;
  injectStyles();

  let root = mount.querySelector(".plan-status");
  if (!root) {
    root = document.createElement("section");
    root.className = "plan-status";
    mount.appendChild(root);
  }

  const premiumChip = access.isPremium
    ? '<span class="plan-chip plan-chip--premium">Plan Premium</span>'
    : '<span class="plan-chip plan-chip--free">Plan Gratis</span>';

  const usageChip = access.isPremium
    ? '<span class="plan-chip plan-chip--usage">Descargas: ilimitadas</span>'
    : `<span class="plan-chip plan-chip--usage">Descargas: ${access.usageLabel}</span>`;

  const featureChip = access.canUseDeepExploration
    ? '<span class="plan-chip plan-chip--premium">Exploración profunda activa</span>'
    : '<span class="plan-chip plan-chip--feature">Exploración profunda: Premium</span>';

  const copy = access.isPremium
    ? "Tu plan premium mantiene exportaciones sin límite y acceso a exploración profunda."
    : access.canDownload
      ? `Todavía puedes exportar ${access.freeDownloadsLimit - access.freeDownloadsUsed} veces antes de llegar al límite gratuito.`
      : "Ya alcanzaste el máximo de 10 descargas del plan gratuito. Puedes seguir viendo resultados, pero para exportar o usar exploración profunda necesitas Premium.";

  const metaCopy = access.lastDeepScanLabel
    ? `<div class="plan-status__meta">${access.lastDeepScanLabel}</div>`
    : "";

  root.innerHTML = `
    <div class="plan-status__row">
      <div class="plan-status__chips">
        ${premiumChip}
        ${usageChip}
        ${featureChip}
      </div>
      ${access.isPremium ? '<button type="button" class="plan-status__btn plan-status__btn--ghost" disabled>Activo</button>' : '<button type="button" class="plan-status__btn">Actualizar a Premium</button>'}
    </div>
    <p class="plan-status__copy">${copy}</p>
    ${metaCopy}
  `;

  const button = root.querySelector(".plan-status__btn");
  if (button && !access.isPremium && typeof onUpgrade === "function") {
    button.addEventListener("click", () => onUpgrade({ source: "plan-status" }));
  }
}
