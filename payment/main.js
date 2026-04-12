import { renderPaywall } from "./ui/paywall.js";
import { setUserPlan } from "../popup/services/access.js";

export async function setPaid(val) {
  await setUserPlan(val ? "premium" : "free");
}

document.addEventListener("DOMContentLoaded", async ()=>{
  const el = document.getElementById("paywall");
  if (el) renderPaywall(el, setPaid);
});
