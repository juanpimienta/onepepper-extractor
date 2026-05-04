export const BILLING_CONFIG = {
  provider: "stripe",
  stripe: {
    checkoutBaseUrl: "https://onepepper-licensing.onrender.com/api/stripe/checkout",
    prices: {
      month: "price_1TLhigF8JKKwNyVlisaiLmS7",
      year: "price_1TLhigF8JKKwNyVlmfKMmsGC"
    }
  },
  licenseApi: {
    // Endpoint que devuelve el estado premium para un installId.
    statusUrl: "https://onepepper-licensing.onrender.com/api/license/status",
    bearerToken: "onepepper_license_api_2026",
    timeoutMs: 2500
  }
};

export function resolveBillingPlan(rawPlan = "month") {
  const plan = String(rawPlan || "month").toLowerCase();
  if (plan === "premium" || plan === "monthly" || plan === "month") return "month";
  if (plan === "annual" || plan === "yearly" || plan === "year") return "year";
  return plan;
}

export function buildCheckoutUrl(rawPlan, context = {}) {
  const plan = resolveBillingPlan(rawPlan);
  const { installId = "", source = "popup", email = "" } = context;

  if (BILLING_CONFIG.stripe.checkoutBaseUrl) {
    const url = new URL(BILLING_CONFIG.stripe.checkoutBaseUrl);
    url.searchParams.set("plan", plan);
    if (installId) url.searchParams.set("installId", installId);
    if (email) url.searchParams.set("email", email);
    if (source) url.searchParams.set("source", source);
    url.searchParams.set("platform", "chrome_extension");
    return url.toString();
  }
  return "";
}

export function buildLicenseStatusUrl(context = "") {
  if (!BILLING_CONFIG.licenseApi.statusUrl) return "";
  const installId = typeof context === "string" ? context : (context.installId || "");
  const email = typeof context === "string" ? "" : (context.email || "");
  const takeover = typeof context === "string" ? false : !!context.takeover;
  const url = new URL(BILLING_CONFIG.licenseApi.statusUrl);
  if (installId) url.searchParams.set("installId", installId);
  if (email) url.searchParams.set("email", email);
  if (takeover) url.searchParams.set("takeover", "1");
  return url.toString();
}
