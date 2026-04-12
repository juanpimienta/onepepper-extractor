import * as Billing from "../processors/stripe.js";
import { getUserPlan } from "../../popup/services/access.js";

async function isPaid(){
  return (await getUserPlan()) === "premium";
}

export function renderPaywall(container, setPaid){
  (async ()=>{
    const paid = await isPaid();
    if (paid) { container.innerHTML = "<p>✅ Pago verificado. Descargas habilitadas.</p>"; return; }

    container.innerHTML = `
      <h2>Pago</h2>
      <p>Activa Premium con Lemon Squeezy para habilitar descargas ilimitadas y exploracion profunda.</p>
      <div class="pay-options">
        <button id="pay-month" class="primary-btn">Premium mensual 7,99 €</button>
        <button id="pay-year" class="primary-btn">Premium anual 49,99 €</button>
      </div>
      <small class="muted">La opcion anual se mostrara como oferta y la extension sincronizara la licencia premium automaticamente.</small>
    `;

    container.querySelector("#pay-month").addEventListener("click", async ()=>{
      await Billing.startCheckout("month");
    });
    container.querySelector("#pay-year").addEventListener("click", async ()=>{
      await Billing.startCheckout("year");
    });
  })();
}
