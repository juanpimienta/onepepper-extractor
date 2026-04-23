let planStylesInjected = false;

function injectStyles() {
  if (planStylesInjected) return;
  planStylesInjected = true;

  const style = document.createElement("style");
  style.id = "plan-status-styles";
  style.textContent = `
    .plan-status{
      margin: 2px 0 8px;
      padding: 10px 12px;
      border: 1px solid #dbe4ea;
      border-radius: 16px;
      background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
      box-shadow: 0 8px 18px rgba(15, 23, 42, 0.05);
      display:flex;
      flex-direction:column;
      gap:8px;
    }
    .plan-status__line{
      margin:0;
      font-size:12px;
      line-height:1.45;
      color:#334155;
      font-weight:600;
    }
    .plan-status__line--primary{
      color:#0f172a;
      font-weight:700;
    }
    .plan-status__meta{
      margin:0;
      padding-top:8px;
      border-top:1px dashed #dbe4ea;
      font-size:11px;
      line-height:1.4;
      color:#64748b;
      font-weight:600;
    }
    .plan-status__email{
      display:grid;
      grid-template-columns:1fr auto;
      gap:8px;
      align-items:center;
    }
    .plan-status__email input{
      min-height:32px;
      border:1px solid #dbe4ea;
      border-radius:12px;
      padding:6px 10px;
      font-size:12px;
      font-weight:650;
      color:#0f172a;
      box-sizing:border-box;
      width:100%;
    }
    .plan-status__email button{
      min-height:32px;
      border:1px solid #27cdf2;
      border-radius:12px;
      background:#27cdf2;
      color:#fff;
      padding:6px 11px;
      font-size:12px;
      font-weight:800;
      cursor:pointer;
      white-space:nowrap;
    }
    .plan-status__email-note{
      margin:-3px 0 0;
      font-size:10px;
      line-height:1.35;
      color:#64748b;
      font-weight:650;
    }
    .plan-status__email-note--success{
      color:#15803d;
    }
    .plan-status__email-note--error{
      color:#dc2626;
    }
    .plan-status__verified{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:8px;
      min-height:28px;
      border:0;
      border-radius:0;
      background:transparent;
      color:#166534;
      padding:0;
      font-size:10px;
      font-weight:800;
      box-sizing:border-box;
    }
    .plan-status__verified-email{
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
      color:#14532d;
    }
    .plan-status__verified-actions{
      display:flex;
      align-items:center;
      gap:6px;
      flex-shrink:0;
    }
    .plan-status__mini-button{
      min-height:22px;
      border:0;
      border-radius:8px;
      background:rgba(34, 197, 94, 0.1);
      color:#166534;
      padding:3px 7px;
      font-size:10px;
      font-weight:800;
      cursor:pointer;
      white-space:nowrap;
    }
    .plan-status__mini-button:hover{
      background:#f0fdf4;
    }
    .plan-status__email--hidden{
      display:none;
    }
  `;
  document.head.appendChild(style);
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function maskEmail(email = "") {
  const [name = "", domain = ""] = String(email || "").split("@");
  if (!name || !domain) return "Correo Premium guardado";
  const visibleName = name.length <= 3 ? name[0] || "" : name.slice(0, 3);
  return `${visibleName}***@${domain}`;
}

function isStrictEmail(email = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || "").trim().toLowerCase());
}

function buildPrimaryCopy(access, isPremium) {
  if (isPremium) {
    return "Tu plan premium incluye exportaciones sin límite y acceso a búsqueda avanzada.";
  }
  return "La exportación de registros está disponible solo en Premium.";
}

function buildSecondaryCopy(isPremium) {
  if (isPremium) {
    return "La búsqueda avanzada revisa páginas clave del dominio para encontrar más correos, teléfonos y enlaces.";
  }
  return "La búsqueda avanzada revisa páginas clave del dominio para ampliar correos, teléfonos y enlaces. Disponible solo en Premium.";
}

function buildMetaCopy(access) {
  const deep = String(access?.lastDeepScanLabel || "").trim();
  if (deep) return deep;

  const query = String(access?.lastQueryLabel || "").trim();
  if (query) return `Último análisis: ${query}`;

  return "";
}

export function renderPlanStatus(mount, { access, premiumEmail = "", onVerifyEmail } = {}) {
  if (!mount) return;

  const isPremium = !!access?.isPremium;

  const primaryCopy = buildPrimaryCopy(access, isPremium);
  const secondaryCopy = buildSecondaryCopy(isPremium);
  const metaCopy = buildMetaCopy(access);
  const rawEmail = String(premiumEmail || access?.email || "").trim();
  const safeEmail = escapeHtml(rawEmail);
  const safeMaskedEmail = escapeHtml(maskEmail(rawEmail));
  const emailBlock = isPremium
    ? `
      <div class="plan-status__verified" title="${safeEmail ? "Premium activo con correo guardado" : "Premium activo"}">
        <span>${safeEmail ? `Correo verificado: ${safeMaskedEmail}` : "Premium verificado."}</span>
        <span class="plan-status__verified-actions">
          <button type="button" class="plan-status__mini-button" id="premium-email-change">Cambiar correo</button>
        </span>
      </div>
      <div class="plan-status__email plan-status__email--hidden" id="premium-email-edit">
        <input id="premium-email-input" type="email" placeholder="Correo Premium" value="${safeEmail}" autocomplete="email" />
        <button type="button" id="premium-email-button">Verificar</button>
      </div>
      <p class="plan-status__email-note plan-status__email-note--success" id="premium-email-note">Este correo es válido para Premium. Queda oculto por privacidad.</p>
    `
    : `
      <div class="plan-status__email">
        <input id="premium-email-input" type="email" placeholder="Correo Premium" value="${safeEmail}" autocomplete="email" />
        <button type="button" id="premium-email-button">Verificar</button>
      </div>
      <p class="plan-status__email-note" id="premium-email-note">Si ya pagaste o tienes acceso manual, escribe tu correo para activar Premium.</p>
    `;

  injectStyles();
  mount.innerHTML = `
    <section class="plan-status" aria-label="Estado del plan">
      <p class="plan-status__line plan-status__line--primary">${primaryCopy}</p>
      <p class="plan-status__line">${secondaryCopy}</p>
      ${emailBlock}
      ${metaCopy ? `<p class="plan-status__meta">${metaCopy}</p>` : ""}
    </section>
  `;

  const input = mount.querySelector("#premium-email-input");
  const button = mount.querySelector("#premium-email-button");
  const changeButton = mount.querySelector("#premium-email-change");
  const editBlock = mount.querySelector("#premium-email-edit");
  const note = mount.querySelector("#premium-email-note");
  const verifiedBlock = mount.querySelector(".plan-status__verified");
  changeButton?.addEventListener("click", () => {
    editBlock?.classList.remove("plan-status__email--hidden");
    verifiedBlock?.classList.add("plan-status__email--hidden");
    if (note) {
      note.textContent = "Escribe otro correo si quieres cambiar el correo Premium.";
      note.classList.remove("plan-status__email-note--success", "plan-status__email-note--error");
    }
    input?.focus();
  });
  input?.addEventListener("input", () => {
    if (!note) return;
    note.classList.remove("plan-status__email-note--success", "plan-status__email-note--error");
    note.textContent = "Pulsa Verificar para comprobar este correo.";
  });
  button?.addEventListener("click", async () => {
    if (typeof onVerifyEmail !== "function") return;
    const value = String(input?.value || "").trim();
    if (!isStrictEmail(value)) {
      input?.reportValidity?.();
      if (note) {
        note.textContent = "Escribe un correo válido para verificar Premium.";
        note.classList.remove("plan-status__email-note--success");
        note.classList.add("plan-status__email-note--error");
      }
      return;
    }
    button.disabled = true;
    const previousText = button.textContent;
    button.textContent = "Verificando";
    const result = await onVerifyEmail(value);
    button.disabled = false;
    button.textContent = previousText;

    if (!note || !result) return;
    note.textContent = result.message || (result.premium ? "Correo verificado. Premium activo." : "Este correo todavía no tiene Premium activo.");
    note.classList.toggle("plan-status__email-note--success", !!result.premium);
    note.classList.toggle("plan-status__email-note--error", !result.premium);
    if (result.premium) {
      editBlock?.classList.add("plan-status__email--hidden");
    }
  });
}
