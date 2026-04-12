import { getOrCreateInstallId } from "../../popup/services/license.js";

export async function startCheckout(plan = "month") {
  const installId = await getOrCreateInstallId();
  const res = await chrome.runtime.sendMessage({
    type: "OPEN_CHECKOUT",
    plan,
    installId,
    source: "payment-screen"
  });
  return !!res?.ok;
}
