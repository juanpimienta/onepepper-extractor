let _modalCss = false;

function injectModalCss(){
  if (_modalCss) return; _modalCss = true;
  const css = `
  .modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:99999;}
  .modal{background:#fff;border:1px solid #e5e7eb;border-radius:16px;max-width:540px;width:92%;padding:16px;box-shadow:0 20px 50px rgba(0,0,0,.18);}
  .modal h3{font-size:16px;font-weight:800;margin:0 0 8px;color:#0f172a;}
  .modal p{font-size:14px;line-height:1.45;color:#111827;margin:0 0 14px;}
  .modal .actions{display:flex;gap:10px;justify-content:flex-end;margin-top:12px;}
  .btn{border:1px solid #e5e7eb;border-radius:12px;padding:8px 12px;background:#f8fafc;cursor:pointer;font-weight:700;}
  .btn.primary{background:#27cdf2;color:#fff;border-color:#27cdf2;}
  `;
  const s = document.createElement("style");
  s.id = "modal-styles";
  s.textContent = css;
  document.head.appendChild(s);
}

export function showInfoModal({title="Aviso", message="", okText="Entendido"}){
  injectModalCss();
  return new Promise((resolve)=> {
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="actions">
          <button class="btn" data-act="close">Cancelar</button>
          <button class="btn primary" data-act="ok">${okText}</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener("click", (e)=>{
      const act = e.target.getAttribute?.("data-act");
      if (act === "ok"){ resolve(true); wrap.remove(); }
      if (act === "close" || e.target === wrap){ resolve(false); wrap.remove(); }
    });
  });
}
