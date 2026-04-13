import "dotenv/config";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import Stripe from "stripe";

const app = express();
const PORT = Number(process.env.PORT || 8787);
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const APP_SUCCESS_URL = process.env.APP_SUCCESS_URL || `${APP_BASE_URL}/billing/success`;
const APP_CANCEL_URL = process.env.APP_CANCEL_URL || `${APP_BASE_URL}/billing/cancel`;
const LICENSES_FILE = path.join(process.cwd(), "data", "licenses.json");
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const PRICE_BY_PLAN = {
  month: String(process.env.STRIPE_PRICE_MONTHLY_ID || "").trim(),
  year: String(process.env.STRIPE_PRICE_YEARLY_ID || "").trim()
};
const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2026-02-25.clover" })
  : null;

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

function getPriceId(rawPlan) {
  return PRICE_BY_PLAN[resolvePlan(rawPlan)] || "";
}

function toIsoFromUnix(seconds) {
  const value = Number(seconds || 0);
  return value > 0 ? new Date(value * 1000).toISOString() : "";
}

function isPremiumStatus(status = "") {
  const normalized = String(status || "").toLowerCase();
  return ["active", "trialing", "past_due"].includes(normalized);
}

function findLicenseBySubscriptionId(store, subscriptionId = "") {
  const target = String(subscriptionId || "").trim();
  if (!target) return null;
  return Object.values(store.licenses).find((license) => license.subscriptionId === target) || null;
}

function findLicenseByCustomerId(store, customerId = "") {
  const target = String(customerId || "").trim();
  if (!target) return null;
  return Object.values(store.licenses).find((license) => String(license.customerId || "") === target) || null;
}

function findLicenseByCheckoutSessionId(store, checkoutSessionId = "") {
  const target = String(checkoutSessionId || "").trim();
  if (!target) return null;
  return Object.values(store.licenses).find((license) => String(license.checkoutSessionId || "") === target) || null;
}

function upsertLicense(store, installId) {
  const key = String(installId || "").trim();
  if (!key) return null;
  store.licenses[key] = {
    installId: key,
    plan: "free",
    premium: false,
    status: "inactive",
    provider: "stripe",
    updatedAt: new Date().toISOString(),
    ...(store.licenses[key] || {})
  };
  return store.licenses[key];
}

function applyCheckoutSessionToLicense(license, session = {}) {
  if (!license) return;
  const metadata = session.metadata || {};
  const subscriptionId = typeof session.subscription === "string"
    ? session.subscription
    : (session.subscription?.id || "");

  license.provider = "stripe";
  license.checkoutSessionId = String(session.id || license.checkoutSessionId || "");
  license.subscriptionId = String(subscriptionId || license.subscriptionId || "");
  license.customerId = String(session.customer || license.customerId || "");
  license.userEmail = String(
    session.customer_details?.email
    || session.customer_email
    || license.userEmail
    || ""
  );
  license.checkoutSource = String(metadata.source || license.checkoutSource || "");
  license.billingPlan = String(metadata.plan || license.billingPlan || "");
  license.platform = String(metadata.platform || license.platform || "");
  license.updatedAt = new Date().toISOString();
}

function applySubscriptionToLicense(license, subscription = {}) {
  if (!license) return;
  const metadata = subscription.metadata || {};
  const status = String(subscription.status || license.status || "inactive");
  const premium = isPremiumStatus(status);

  license.provider = "stripe";
  license.plan = premium ? "premium" : "free";
  license.premium = premium;
  license.status = status;
  license.subscriptionId = String(subscription.id || license.subscriptionId || "");
  license.customerId = String(subscription.customer || license.customerId || "");
  license.checkoutSource = String(metadata.source || license.checkoutSource || "");
  license.billingPlan = String(metadata.plan || license.billingPlan || "");
  license.platform = String(metadata.platform || license.platform || "");
  license.currentPeriodEnd = toIsoFromUnix(subscription.current_period_end);
  license.cancelAt = toIsoFromUnix(subscription.cancel_at);
  license.cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
  license.updatedAt = new Date().toISOString();
}

function applyInvoiceToLicense(license, invoice = {}) {
  if (!license) return;
  license.provider = "stripe";
  license.customerId = String(invoice.customer || license.customerId || "");
  license.subscriptionId = String(invoice.subscription || license.subscriptionId || "");
  if (invoice.customer_email) {
    license.userEmail = String(invoice.customer_email || license.userEmail || "");
  }
  license.lastInvoiceId = String(invoice.id || license.lastInvoiceId || "");
  license.updatedAt = new Date().toISOString();
}

async function fetchSubscription(subscriptionId) {
  if (!stripe || !subscriptionId) return null;
  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch {
    return null;
  }
}

app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe) {
    return res.status(500).send("Missing STRIPE_SECRET_KEY");
  }
  if (!STRIPE_WEBHOOK_SECRET) {
    return res.status(500).send("Missing STRIPE_WEBHOOK_SECRET");
  }

  const signature = req.get("stripe-signature") || "";
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return res.status(401).send(error?.message || "Invalid signature");
  }

  const store = await readStore();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const installId = String(session.client_reference_id || session.metadata?.installId || "").trim();
    const existing =
      findLicenseByCheckoutSessionId(store, session.id)
      || findLicenseBySubscriptionId(store, session.subscription || "")
      || findLicenseByCustomerId(store, session.customer || "");
    const license = upsertLicense(store, installId || existing?.installId || "");
    applyCheckoutSessionToLicense(license, session);
    if (license?.subscriptionId) {
      const subscription = await fetchSubscription(license.subscriptionId);
      if (subscription) applySubscriptionToLicense(license, subscription);
    }
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;
    const installId = String(subscription.metadata?.installId || "").trim();
    const existing =
      findLicenseBySubscriptionId(store, subscription.id)
      || findLicenseByCustomerId(store, subscription.customer || "");
    const license = upsertLicense(store, installId || existing?.installId || "");
    applySubscriptionToLicense(license, subscription);
  }

  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const invoice = event.data.object;
    const existing =
      findLicenseBySubscriptionId(store, invoice.subscription || "")
      || findLicenseByCustomerId(store, invoice.customer || "");
    if (existing) {
      applyInvoiceToLicense(existing, invoice);
      if (event.type === "invoice.payment_failed") {
        existing.status = "past_due";
        existing.premium = true;
        existing.plan = "premium";
        existing.updatedAt = new Date().toISOString();
      }
      if (event.type === "invoice.paid" && existing.subscriptionId) {
        const subscription = await fetchSubscription(existing.subscriptionId);
        if (subscription) applySubscriptionToLicense(existing, subscription);
      }
    }
  }

  await writeStore(store);
  return res.json({ received: true, event: event.type });
});

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, provider: "stripe" });
});

app.get("/api/stripe/checkout", async (req, res) => {
  const plan = resolvePlan(req.query.plan || "month");
  const installId = String(req.query.installId || "").trim();
  const source = String(req.query.source || "extension").trim();
  const priceId = getPriceId(plan);

  if (!stripe) {
    return res.status(500).json({ message: "Falta STRIPE_SECRET_KEY" });
  }
  if (!priceId) {
    return res.status(400).json({ message: `Plan no soportado: ${plan}` });
  }
  if (!installId) {
    return res.status(400).json({ message: "installId es obligatorio" });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      success_url: `${APP_SUCCESS_URL}?installId=${encodeURIComponent(installId)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_CANCEL_URL}?installId=${encodeURIComponent(installId)}`,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: installId,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      locale: "es",
      metadata: {
        installId,
        source,
        plan,
        platform: "chrome_extension"
      },
      subscription_data: {
        metadata: {
          installId,
          source,
          plan,
          platform: "chrome_extension"
        }
      }
    });

    if (!session.url) {
      throw new Error("Stripe no devolvio una URL de checkout.");
    }

    return res.redirect(303, session.url);
  } catch (error) {
    return res.status(500).json({ message: error?.message || "No se pudo crear el checkout." });
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
    return res.json({ premium: false, plan: "free", status: "inactive", provider: "stripe" });
  }

  return res.json({
    premium: !!license.premium,
    plan: license.premium ? "premium" : "free",
    status: license.status || (license.premium ? "active" : "inactive"),
    expiresAt: license.currentPeriodEnd || license.cancelAt || "",
    customerPortalUrl: license.customerPortalUrl || "",
    provider: "stripe"
  });
});

app.get("/billing/success", (req, res) => {
  res.type("html").send(`
    <html lang="es">
      <body style="font-family:Arial,sans-serif;padding:32px;">
        <h1>Pago completado</h1>
        <p>Tu suscripcion premium se esta activando.</p>
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
