let remoteScanStylesInjected = false;

function injectStyles() {
  if (remoteScanStylesInjected) return;
  remoteScanStylesInjected = true;

  const style = document.createElement("style");
  style.id = "remote-scan-styles";
  style.textContent = `
    .remote-scan{
      margin: 0 0 10px;
      padding: 9px;
      border: 1px solid #dbe4ea;
      border-radius: 14px;
      background: #ffffff;
    }
    .remote-scan__head{
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap:8px;
      margin-bottom:6px;
    }
    .remote-scan__label{
      font-size:11px;
      font-weight:700;
      color:#667085;
      line-height:1.1;
    }
    .remote-scan__title{
      margin-top:2px;
      font-size:13px;
      font-weight:800;
      color:#0f172a;
      line-height:1.2;
    }
    .remote-scan__badge{
      border:1px solid #dbe4ea;
      border-radius:999px;
      padding:3px 8px;
      font-size:10px;
      font-weight:700;
      color:#334155;
      background:#f8fafc;
      white-space:nowrap;
    }
    .remote-scan__row{
      display:grid;
      grid-template-columns:1fr auto;
      gap:7px;
      align-items:center;
    }
    .remote-scan__input{
      width:100%;
      min-height:32px;
      border:1px solid #dbe4ea;
      border-radius:10px;
      padding:6px 9px;
      font-size:11px;
      color:#0f172a;
      box-sizing:border-box;
    }
    .remote-scan__textarea{
      min-height:120px;
      resize:vertical;
      line-height:1.35;
    }
    .remote-scan__btn{
      min-height:32px;
      border:1px solid #27cdf2;
      background:#27cdf2;
      color:#fff;
      border-radius:10px;
      padding:6px 11px;
      font-size:11px;
      font-weight:700;
      cursor:pointer;
      white-space:nowrap;
    }
    .remote-scan__btn[disabled]{
      opacity:.55;
      cursor:default;
    }
    .remote-scan__copy{
      margin-top:7px;
      font-size:11px;
      line-height:1.35;
      color:#475569;
    }
    .remote-scan__progress{
      margin-top:8px;
    }
    .remote-scan__progress-copy{
      font-size:11px;
      color:#475569;
      margin-bottom:5px;
    }
    .remote-scan__progress-bar{
      height:7px;
      border-radius:999px;
      background:#e2e8f0;
      overflow:hidden;
    }
    .remote-scan__progress-meter{
      width:0%;
      height:100%;
      background:#27cdf2;
      transition:width .2s ease;
    }
    .remote-scan__summary{
      margin-top:8px;
      padding-top:8px;
      border-top:1px dashed #dbe4ea;
    }
    .remote-scan__summary[hidden]{
      display:none;
    }
    .remote-scan__summary-head{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:7px;
      margin-bottom:7px;
    }
    .remote-scan__summary-title{
      font-size:12px;
      font-weight:800;
      color:#0f172a;
    }
    .remote-scan__summary-btn{
      border:1px solid #dbe4ea;
      background:#fff;
      color:#334155;
      border-radius:999px;
      padding:4px 9px;
      font-size:10px;
      font-weight:700;
      cursor:pointer;
    }
    .remote-scan__summary-copy{
      font-size:11px;
      color:#475569;
      line-height:1.35;
      margin-bottom:7px;
    }
    .remote-scan__summary-list{
      display:flex;
      flex-direction:column;
      gap:5px;
      max-height:180px;
      overflow:auto;
    }
    .remote-scan__summary-item{
      border:1px solid #e2e8f0;
      border-radius:9px;
      padding:6px 8px;
      background:#f8fafc;
      font-size:11px;
      line-height:1.3;
      color:#334155;
    }
    .remote-scan__summary-item-top{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:7px;
      margin-bottom:3px;
    }
    .remote-scan__summary-item strong{
      color:#0f172a;
    }
    .remote-scan__summary-badge{
      display:inline-flex;
      align-items:center;
      border:1px solid #cbd5e1;
      border-radius:999px;
      padding:2px 6px;
      font-size:9px;
      font-weight:700;
      color:#334155;
      background:#fff;
      white-space:nowrap;
    }
    .remote-scan__summary-sub{
      color:#0f172a;
      font-weight:700;
      margin-bottom:3px;
      word-break:break-word;
    }
    .remote-scan__summary-meta{
      color:#475569;
      word-break:break-word;
    }
    .remote-scan__summary-data{
      margin-top:5px;
      display:flex;
      flex-direction:column;
      gap:3px;
    }
    .remote-scan__summary-data-line{
      font-size:10px;
      color:#334155;
      line-height:1.35;
      word-break:break-word;
    }
    .remote-scan__summary-data-line strong{
      color:#0f172a;
    }
  `;
  document.head.appendChild(style);
}

export function renderRemoteScan(mount, { locked = false, onSubmit, onLockedAttempt, onViewScraping } = {}) {
  if (!mount) return null;
  injectStyles();

  mount.innerHTML = `
    <section class="remote-scan">
      <div class="remote-scan__head">
        <div>
          <div class="remote-scan__label">Premium</div>
          <div class="remote-scan__title">Escanear URL(s)</div>
        </div>
        <div class="remote-scan__badge">Hasta 20 URL(s)</div>
      </div>
      <div class="remote-scan__row" style="grid-template-columns:1fr;">
        <textarea class="remote-scan__input remote-scan__textarea" rows="8" placeholder="https://dominio1.com&#10;https://dominio2.com&#10;https://dominio3.com" spellcheck="false"></textarea>
      </div>
      <div class="remote-scan__row" style="margin-top:8px;">
        <div class="remote-scan__copy" style="margin:0;">Pega hasta 20 URL(s). Cada una analiza la URL principal y hasta 4 páginas clave del mismo dominio.</div>
        <button type="button" class="remote-scan__btn">${locked ? "Premium" : "Escanear lote"}</button>
      </div>
      <div class="remote-scan__progress" hidden>
        <div class="remote-scan__progress-copy">Esperando…</div>
        <div class="remote-scan__progress-bar"><div class="remote-scan__progress-meter"></div></div>
      </div>
      <div class="remote-scan__summary" hidden>
        <div class="remote-scan__summary-head">
          <div class="remote-scan__summary-title">Último lote</div>
          <button type="button" class="remote-scan__summary-btn">Ver en Scraping</button>
        </div>
        <div class="remote-scan__summary-copy"></div>
        <div class="remote-scan__summary-list"></div>
      </div>
    </section>
  `;

  const input = mount.querySelector(".remote-scan__textarea");
  const button = mount.querySelector(".remote-scan__btn");
  const progress = mount.querySelector(".remote-scan__progress");
  const progressCopy = mount.querySelector(".remote-scan__progress-copy");
  const progressMeter = mount.querySelector(".remote-scan__progress-meter");
  const summary = mount.querySelector(".remote-scan__summary");
  const summaryCopy = mount.querySelector(".remote-scan__summary-copy");
  const summaryList = mount.querySelector(".remote-scan__summary-list");
  const summaryButton = mount.querySelector(".remote-scan__summary-btn");

  const setProgress = ({ visible, text, percent } = {}) => {
    if (progress) progress.hidden = !visible;
    if (typeof text === "string" && progressCopy) progressCopy.textContent = text;
    if (typeof percent === "number" && progressMeter) progressMeter.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  };

  const setSummary = ({ visible, copy, items = [] } = {}) => {
    if (summary) summary.hidden = !visible;
    if (typeof copy === "string" && summaryCopy) summaryCopy.textContent = copy;
    if (summaryList) {
      summaryList.innerHTML = items.map((item) => `
        <div class="remote-scan__summary-item">
          <div class="remote-scan__summary-item-top">
            <strong>${item.status}</strong>
            ${item.badge ? `<span class="remote-scan__summary-badge">${item.badge}</span>` : ""}
          </div>
          <div class="remote-scan__summary-sub">${item.title || item.url}</div>
          <div class="remote-scan__summary-meta">${item.url}</div>
          ${item.detail ? `<div class="remote-scan__summary-meta" style="margin-top:4px;">${item.detail}</div>` : ""}
          ${(item.emails?.length || item.phones?.length) ? `
            <div class="remote-scan__summary-data">
              ${item.emails?.length ? `<div class="remote-scan__summary-data-line"><strong>Correos:</strong> ${item.emails.join(", ")}</div>` : ""}
              ${item.phones?.length ? `<div class="remote-scan__summary-data-line"><strong>Teléfonos:</strong> ${item.phones.join(", ")}</div>` : ""}
            </div>
          ` : ""}
        </div>
      `).join("");
    }
  };

  const submit = async () => {
    const value = input?.value || "";
    if (locked) {
      if (typeof onLockedAttempt === "function") onLockedAttempt();
      return;
    }
    if (typeof onSubmit === "function") await onSubmit(value, { input, button, setProgress });
  };

  button?.addEventListener("click", submit);
  summaryButton?.addEventListener("click", () => {
    if (typeof onViewScraping === "function") onViewScraping();
  });

  return { input, button, setProgress, setSummary };
}
