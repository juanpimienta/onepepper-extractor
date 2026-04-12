import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";

const app = express();
const PORT = Number(process.env.PORT || 8787);
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const APP_SUCCESS_URL = process.env.APP_SUCCESS_URL || `${APP_BASE_URL}/billing/success`;
const APP_CANCEL_URL = process.env.APP_CANCEL_URL || `${APP_BASE_URL}/billing/cancel`;
const LICENSES_FILE = path.join(process.cwd(), "data", "licenses.json");
const LS_API_BASE = "https://api.lemonsqueezy.com/v1";
const LS_API_KEY = process.env.LEMON_SQUEEZY_API_KEY || "";
const LS_STORE_ID = String(process.env.LEMON_SQUEEZY_STORE_ID || "").trim();
const LS_WEBHOOK_SECRET = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET || "";
const VARIANT_BY_PLAN = {
  month: String(process.env.LEMON_SQUEEZY_VARIANT_MONTHLY_ID || "").trim(),
  year: String(process.env.LEMON_SQUEEZY_VARIANT_YEARLY_ID || "").trim()
};

async function ensureStore() {
  await fs.mkdir(path.dirname(LICENSES_FILE), { recursive: true });
  try {
    await fs.access(LICENSES_FILE);
  } catch {
    await fs.writeFile(LICENSES_FILE, JSON.stringify({ licenses: {} }, null, 2), "utf8");
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(LICENSES_FILE, "utf8");
  return JSON.parse(raw || '{"licenses":{}}');
}

async function writeStore(store) {
  await ensureStore();
  await fs.writeFile(LICENSES_FILE, JSON.stringify(store, null, 2), "utf8");
}

function auth(req, res, next) {
  const expected = process.env.LICENSE_API_BEARER_TOKEN || "";
  if (!expected) return next();

  const header = req.get("authorization") || "";
  if (header !== `Bearer ${expected}`) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

function resolvePlan(rawPlan = "month") {
  const plan = String(rawPlan || "month").toLowerCase();
  if (plan === "premium" || plan === "monthly" || plan === "month") return "month";
  if (plan === "annual" || plan === "yearly" || plan === "year") return "year";
  return plan;
}

function getVariantId(rawPlan) {
  return VARIANT_BY_PLAN[resolvePlan(rawPlan)] || "";
}

function getCustomData(payload = {}) {
  return payload?.meta?.custom_data || {};
}

function getInstallId(payload = {}) {
  const custom = getCustomData(payload);
  return String(custom.installId || custom.install_id || "").trim();
}

function getAttributes(payload = {}) {
  return payload?.data?.attributes || {};
}

function verifyWebhookSignature(rawBody, headerSignature) {
  if (!LS_WEBHOOK_SECRET) return false;
  const digest = crypto
    .createHmac("sha256", LS_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  const expected = Buffer.from(digest, "utf8");
  const received = Buffer.from(headerSignature || "", "utf8");
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
}

function isPremiumStatus(status = "") {
  const normalized = String(status || "").toLowerCase();
  return !["expired", "refunded", "unpaid"].includes(normalized);
}

function findLicenseBySubscriptionId(store, subscriptionId = "") {
  const target = String(subscriptionId || "").trim();
  if (!target) return null;
  return Object.values(store.licenses).find((license) => license.subscriptionId === target) || null;
}

function findLicenseByOrderId(store, orderId = "") {
  const target = String(orderId || "").trim();
  if (!target) return null;
  return Object.values(store.licenses).find((license) => String(license.orderId || "") === target) || null;
}

function findLicenseByCustomerId(store, customerId = "") {
  const target = String(customerId || "").trim();
  if (!target) return null;
  return Object.values(store.licenses).find((license) => String(license.customerId || "") === target) || null;
}

function upsertLicense(store, installId) {
  const key = String(installId || "").trim();
  if (!key) return null;
  store.licenses[key] = {
    installId: key,
    plan: "free",
    premium: false,
    status: "inactive",
    updatedAt: new Date().toISOString(),
    ...(store.licenses[key] || {})
  };
  return store.licenses[key];
}

function applySubscriptionToLicense(license, payload = {}) {
  if (!license) return;
  const attrs = getAttributes(payload);
  const status = String(attrs.status || license.status || "inactive");
  const premium = isPremiumStatus(status);
  const custom = getCustomData(payload);

  license.plan = premium ? "premium" : "free";
  license.premium = premium;
  license.status = status;
  license.variantId = String(attrs.variant_id || license.variantId || "");
  license.subscriptionId = String(payload?.data?.id || attrs.subscription_id || license.subscriptionId || "");
  license.customerId = String(attrs.customer_id || license.customerId || "");
  license.orderId = String(attrs.order_id || license.orderId || "");
  license.productId = String(attrs.product_id || license.productId || "");
  license.storeId = String(attrs.store_id || license.storeId || "");
  license.renewsAt = attrs.renews_at || license.renewsAt || "";
  license.endsAt = attrs.ends_at || license.endsAt || "";
  license.trialEndsAt = attrs.trial_ends_at || license.trialEndsAt || "";
  license.urls = attrs.urls || license.urls || {};
  license.checkoutSource = String(custom.source || license.checkoutSource || "");
  license.billingPlan = String(custom.plan || license.billingPlan || "");
  license.updatedAt = new Date().toISOString();
}

function applyOrderToLicense(license, payload = {}) {
  if (!license) return;
  const attrs = getAttributes(payload);
  const custom = getCustomData(payload);
  license.orderId = String(payload?.data?.id || attrs.identifier || attrs.order_id || license.orderId || "");
  license.customerId = String(attrs.customer_id || license.customerId || "");
  license.productId = String(attrs.product_id || license.productId || "");
  license.storeId = String(attrs.store_id || license.storeId || "");
  license.userEmail = String(attrs.user_email || license.userEmail || "");
  license.userName = String(attrs.user_name || license.userName || "");
  license.checkoutSource = String(custom.source || license.checkoutSource || "");
  license.billingPlan = String(custom.plan || license.billingPlan || "");
  license.updatedAt = new Date().toISOString();
}

function applyLicenseKeyToLicense(license, payload = {}) {
  if (!license) return;
  const attrs = getAttributes(payload);
  license.licenseKeyId = String(payload?.data?.id || license.licenseKeyId || "");
  license.licenseKey = String(attrs.key || license.licenseKey || "");
  license.licenseStatus = String(attrs.status || license.licenseStatus || "");
  license.activationLimit = Number(attrs.activation_limit || license.activationLimit || 0);
  license.activationUsage = Number(attrs.activation_usage || license.activationUsage || 0);
  license.updatedAt = new Date().toISOString();
}

async function lemonRequest(endpoint, body) {
  if (!LS_API_KEY) {
    throw new Error("Falta LEMON_SQUEEZY_API_KEY");
  }

  const res = await fetch(`${LS_API_BASE}${endpoint}`, {
    method: body ? "POST" : "GET",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${LS_API_KEY}`
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      data?.errors?.[0]?.detail
      || data?.message
      || `Error Lemon Squeezy (${res.status})`;
    throw new Error(message);
  }

  return data;
}

app.post("/api/lemonsqueezy/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!LS_WEBHOOK_SECRET) {
    return res.status(500).send("Missing LEMON_SQUEEZY_WEBHOOK_SECRET");
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
  const signature = req.get("x-signature") || "";

  if (!verifyWebhookSignature(rawBody, signature)) {
    return res.status(401).send("Invalid signature");
  }

  const payload = JSON.parse(rawBody.toString("utf8"));
  const eventName = String(payload?.meta?.event_name || "").trim();
  const attrs = getAttributes(payload);
  const store = await readStore();

  if (eventName === "order_created") {
    const installId = getInstallId(payload);
    const existing =
      findLicenseByOrderId(store, payload?.data?.id || attrs.identifier || attrs.order_id || "")
      || findLicenseByCustomerId(store, attrs.customer_id || "");
    const license = upsertLicense(store, installId || existing?.installId || "");
    applyOrderToLicense(license, payload);
  }

  if (eventName.startsWith("subscription_")) {
    const installId = getInstallId(payload);
    const existing =
      findLicenseBySubscriptionId(store, payload?.data?.id || attrs.subscription_id || "")
      || findLicenseByOrderId(store, attrs.order_id || "")
      || findLicenseByCustomerId(store, attrs.customer_id || "");
    const license = upsertLicense(store, installId || existing?.installId || "");
    applySubscriptionToLicense(license, payload);

    if (eventName === "subscription_payment_failed" && license) {
      license.status = "past_due";
      license.updatedAt = new Date().toISOString();
    }
  }

  if (eventName.startsWith("license_key_")) {
    const installId = getInstallId(payload);
    const attrsLicense = getAttributes(payload);
    const existing =
      findLicenseBySubscriptionId(store, attrsLicense.subscription_id || "")
      || findLicenseByOrderId(store, attrsLicense.order_id || "")
      || findLicenseByCustomerId(store, attrsLicense.customer_id || "")
      || store.licenses[installId];
    const license = upsertLicense(store, installId || existing?.installId || "");
    applyLicenseKeyToLicense(license, payload);
  }

  await writeStore(store);
  return res.json({ received: true, event: eventName });
});

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, provider: "lemonsqueezy" });
});

app.get("/api/lemonsqueezy/checkout", async (req, res) => {
  const plan = resolvePlan(req.query.plan || "month");
  const installId = String(req.query.installId || "").trim();
  const source = String(req.query.source || "extension").trim();
  const variantId = getVariantId(plan);

  if (!LS_STORE_ID) {
    return res.status(500).json({ message: "Falta LEMON_SQUEEZY_STORE_ID" });
  }
  if (!variantId) {
    return res.status(400).json({ message: `Plan no soportado: ${plan}` });
  }
  if (!installId) {
    return res.status(400).json({ message: "installId es obligatorio" });
  }

  try {
    const payload = {
      data: {
        type: "checkouts",
        attributes: {
          product_options: {
            redirect_url: `${APP_SUCCESS_URL}?installId=${encodeURIComponent(installId)}`,
            receipt_button_text: "Abrir OnePepper",
            receipt_link_url: APP_SUCCESS_URL,
            receipt_thank_you_note: "Tu plan premium se activara al abrir de nuevo la extension.",
            enabled_variants: [Number(variantId)]
          },
          checkout_options: {
            embed: false,
            media: false,
            logo: true,
            desc: true,
            discount: true,
            subscription_preview: true,
            button_color: "#27cdf2",
            button_text_color: "#ffffff",
            headings_color: "#0f172a",
            primary_text_color: "#0f172a",
            secondary_text_color: "#64748b",
            links_color: "#0891b2",
            borders_color: "#dbe4ea",
            active_state_color: "#27cdf2",
            locale: "es"
          },
          checkout_data: {
            custom: {
              installId,
              source,
              plan,
              platform: "chrome_extension"
            }
          }
        },
        relationships: {
          store: {
            data: { type: "stores", id: LS_STORE_ID }
          },
          variant: {
            data: { type: "variants", id: String(variantId) }
          }
        }
      }
    };

    const data = await lemonRequest("/checkouts", payload);
    const checkoutUrl = data?.data?.attributes?.url || "";
    if (!checkoutUrl) {
      throw new Error("Lemon Squeezy no devolvio una URL de checkout.");
    }
    return res.redirect(303, checkoutUrl);
  } catch (error) {
    return res.status(500).json({ message: error.message || "No se pudo crear el checkout." });
  }
});

app.get("/api/license/status", auth, async (req, res) => {
  const installId = String(req.query.installId || "").trim();
  if (!installId) {
    return res.status(400).json({ message: "installId es obligatorio" });
  }

  const store = await readStore();
  const license = store.licenses[installId];
  if (!license) {
    return res.json({ premium: false, plan: "free", status: "inactive", provider: "lemonsqueezy" });
  }

  return res.json({
    premium: !!license.premium,
    plan: license.premium ? "premium" : "free",
    status: license.status || (license.premium ? "active" : "inactive"),
    expiresAt: license.endsAt || license.renewsAt || "",
    customerPortalUrl: license.urls?.customer_portal || "",
    provider: "lemonsqueezy",
    licenseKey: license.licenseKey || ""
  });
});

app.get("/billing/success", (req, res) => {
  res.type("html").send(`
    <html lang="es">
      <body style="font-family:Arial,sans-serif;padding:32px;">
        <h1>Pago completado</h1>
        <p>Tu licencia premium se esta activando.</p>
        <p>Vuelve a abrir la extension en unos segundos para sincronizar Premium.</p>
        <p><small>installId: ${String(req.query.installId || "")}</small></p>
      </body>
    </html>
  `);
});

app.get("/billing/cancel", (_req, res) => {
  res.type("html").send(`
    <html lang="es">
      <body style="font-family:Arial,sans-serif;padding:32px;">
        <h1>Pago cancelado</h1>
        <p>No se realizo ningun cargo.</p>
        <p>Puedes volver a intentarlo desde la extension cuando quieras.</p>
      </body>
    </html>
  `);
});

app.listen(PORT, async () => {
  await ensureStore();
  console.log(`Billing backend listo en ${APP_BASE_URL}`);
});
