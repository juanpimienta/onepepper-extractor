// popup/ui/render-contacts.js
let _contactsStyles = false;

function injectStyles(){
  if (_contactsStyles) return; _contactsStyles = true;
  const s = document.createElement("style");
  s.id = "contacts-v3-styles";
  s.textContent = `
  /* ====== Estilos existentes (se conservan) ====== */
  .section-card{ border:1px solid #e5e7eb; background:#fff; border-radius:16px; padding:10px; margin:10px 0; }
  .section-headbar{ display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin:0 0 8px 0; }
  .contact-list{ display:flex; flex-direction:column; gap:6px; }
  .contact-row{ display:flex; align-items:center; justify-content:space-between; gap:8px; border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:7px 9px; }
  .contact-left{ display:flex; align-items:center; gap:8px; min-width:0; }
  .contact-value{ font-size:14px; font-weight:800; color:#0f172a; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .btn-copy{ border:1px solid #e5e7eb; border-radius:999px; padding:5px 10px; background:#f8fafc; color:#111827; font-weight:700; font-size:12px; cursor:pointer; transition:background .15s ease, color .15s ease, border-color .15s ease; white-space:nowrap; flex:0 0 auto; }
  .btn-copy:hover{ background:#eef2ff; }

  /* ====== Header estilo fantasma (solo texto, sin logo) ====== */
  .section-header{ margin:0; }
  .section-header .tech-label{ font-size:12px; font-weight:700; color:#667085; letter-spacing:.2px; line-height:1.1; }
  .section-header .tech-title{ margin-top:1px; font-size:15px; font-weight:800; color:#0f172a; line-height:1.2; }
  .section-actions{ display:flex; align-items:center; justify-content:flex-end; }
  `;
  document.head.appendChild(s);
}

/**
 * @param {HTMLElement} mount
 * @param {string[]} emails
 * @param {string[]} phones
 * @param {{ only?: "emails" | "phones" }} opts
 */
export function renderContacts(mount, emails = [], phones = [], opts = {}) {
  injectStyles();

  const only = opts.only || "both";
  const wantEmails = only === "both" || only === "emails";
  const wantPhones = only === "both" || only === "phones";

  if (wantEmails) {
    const secMail = document.createElement("section");
    secMail.className = "section-card";
    // Header nuevo SIN logo
    secMail.innerHTML = `
      <div class="section-headbar">
        <div class="section-header">
          <div class="tech-label">Correos</div>
          <div class="tech-title">${emails.length ? "" : "—"}</div>
        </div>
        <div class="section-actions">
          ${emails.length ? `<button class="btn-copy" data-copy-text="${emails.join("\n")}">Copiar todo</button>` : ""}
        </div>
      </div>
      <div class="contact-list" id="mail-list"></div>
    `;
    mount.appendChild(secMail);

    const mailList = secMail.querySelector("#mail-list");
    if (!emails.length) {
      mailList.innerHTML = `<div style="color:#6b7280;font-weight:600;padding:4px 2px;">No se encontraron correos</div>`;
    } else {
      emails.forEach(e => {
        const row = document.createElement("div");
        row.className = "contact-row";
        row.innerHTML = `
          <div class="contact-left"><span class="contact-value" data-copy-value="${e}">${e}</span></div>
          <button class="btn-copy" data-copy-text="${e}">Copiar</button>
        `;
        mailList.appendChild(row);
      });
    }
  }

  if (wantPhones) {
    const secPhone = document.createElement("section");
    secPhone.className = "section-card";
    // Header nuevo SIN logo
    secPhone.innerHTML = `
      <div class="section-headbar">
        <div class="section-header">
          <div class="tech-label">Teléfonos</div>
          <div class="tech-title">${phones.length ? "" : "—"}</div>
        </div>
        <div class="section-actions">
          ${phones.length ? `<button class="btn-copy" data-copy-text="${phones.join("\n")}">Copiar todo</button>` : ""}
        </div>
      </div>
      <div class="contact-list" id="phone-list"></div>
    `;
    mount.appendChild(secPhone);

    const phoneList = secPhone.querySelector("#phone-list");
    if (!phones.length) {
      phoneList.innerHTML = `<div style="color:#6b7280;font-weight:600;padding:4px 2px;">No se encontraron teléfonos</div>`;
    } else {
      phones.forEach(p => {
        const row = document.createElement("div");
        row.className = "contact-row";
        row.innerHTML = `
          <div class="contact-left"><span class="contact-value" data-copy-value="${p}">${p}</span></div>
          <button class="btn-copy" data-copy-text="${p}">Copiar</button>
        `;
        phoneList.appendChild(row);
      });
    }
  }
}
