export const BILLING_CONFIG = {
  provider: "lemonsqueezy",
  lemonsqueezy: {
    // Recomendado: backend propio que crea el checkout por API.
    checkoutBaseUrl: "",

    // Fallback opcional: checkout directo si ya conoces tu subdominio.
    storeSubdomain: "",
    variants: {
      month: "1515006",
      year: "1515032"
    }
  },
  licenseApi: {
    // Endpoint que devuelve el estado premium para un installId.
    statusUrl: "",
    bearerToken: "",
    timeoutMs: 8000
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
  const { installId = "", source = "popup" } = context;

  if (BILLING_CONFIG.lemonsqueezy.checkoutBaseUrl) {
    const url = new URL(BILLING_CONFIG.lemonsqueezy.checkoutBaseUrl);
    url.searchParams.set("plan", plan);
    if (installId) url.searchParams.set("installId", installId);
    if (source) url.searchParams.set("source", source);
    url.searchParams.set("platform", "chrome_extension");
    return url.toString();
  }

  const subdomain = String(BILLING_CONFIG.lemonsqueezy.storeSubdomain || "").trim();
  const variantId = BILLING_CONFIG.lemonsqueezy.variants?.[plan] || "";
  if (!subdomain || !variantId) return "";

  const url = new URL(`https://${subdomain}.lemonsqueezy.com/checkout/buy/${variantId}`);
  if (installId) url.searchParams.set("checkout[custom][installId]", installId);
  if (source) url.searchParams.set("checkout[custom][source]", source);
  url.searchParams.set("checkout[custom][plan]", plan);
  url.searchParams.set("checkout[custom][platform]", "chrome_extension");
  url.searchParams.set("checkout[lang]", "es");
  return url.toString();
}

export function buildLicenseStatusUrl(installId = "") {
  if (!BILLING_CONFIG.licenseApi.statusUrl) return "";
  const url = new URL(BILLING_CONFIG.licenseApi.statusUrl);
  if (installId) url.searchParams.set("installId", installId);
  return url.toString();
}
