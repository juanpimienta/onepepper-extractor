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
const ADMIN_PREMIUM_EMAILS = new Set(
  String(process.env.ADMIN_PREMIUM_EMAILS || "")
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter(Boolean)
);
const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2026-02-25.clover" })
  : null;

function normalizeEmail(email = "") {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(email));
}

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
  const parsed = JSON.parse(raw || '{"licenses":{}}');
  return {
    licenses: parsed.licenses || {}
  };
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

function findLicenseByEmail(store, email = "") {
  const target = normalizeEmail(email);
  if (!target) return null;
  return Object.values(store.licenses).find((license) => normalizeEmail(license.userEmail || "") === target) || null;
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

function transferLicenseToInstall(store, sourceLicense, targetInstallId, email = "") {
  if (!store || !sourceLicense || !targetInstallId) return null;
  const normalizedEmail = normalizeEmail(email || sourceLicense.userEmail || "");
  const sourceInstallId = String(sourceLicense.installId || "").trim();
  const target = upsertLicense(store, targetInstallId);
  if (!target) return null;

  Object.assign(target, {
    ...sourceLicense,
    installId: targetInstallId,
    userEmail: normalizedEmail || sourceLicense.userEmail || "",
    linkedFromEmail: normalizedEmail || sourceLicense.userEmail || "",
    updatedAt: new Date().toISOString()
  });

  if (sourceInstallId && sourceInstallId !== targetInstallId && store.licenses[sourceInstallId]) {
    store.licenses[sourceInstallId] = {
      ...store.licenses[sourceInstallId],
      premium: false,
      plan: "free",
      status: "transferred",
      userEmail: "",
      currentPeriodEnd: "",
      cancelAt: "",
      cancelAtPeriodEnd: false,
      linkedFromEmail: "",
      updatedAt: new Date().toISOString()
    };
  }

  return target;
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

function getChargeSubscriptionId(charge = {}) {
  const invoice = charge.invoice;
  if (!invoice || typeof invoice === "string") return "";
  if (typeof invoice.subscription === "string") return invoice.subscription;
  return String(invoice.subscription?.id || "");
}

function getChargeCustomerId(charge = {}) {
  return String(charge.customer || "");
}

function applyRefundToLicense(license, refund = {}, charge = {}) {
  if (!license) return;

  const refundStatus = String(refund.status || "").toLowerCase();
  const chargeAmount = Number(charge.amount || 0);
  const amountRefunded = Number(charge.amount_refunded || refund.amount || 0);
  const fullRefund = chargeAmount > 0 && amountRefunded >= chargeAmount;

  license.provider = "stripe";
  license.lastRefundId = String(refund.id || license.lastRefundId || "");
  license.lastChargeId = String(charge.id || license.lastChargeId || "");
  license.refundStatus = refundStatus || license.refundStatus || "";
  license.refundedAmount = amountRefunded || license.refundedAmount || 0;
  license.updatedAt = new Date().toISOString();

  if (refundStatus === "failed") {
    license.refundFailedAt = new Date().toISOString();
    return;
  }

  if (refundStatus === "succeeded" && fullRefund) {
    license.plan = "free";
    license.premium = false;
    license.status = "refunded";
    license.currentPeriodEnd = "";
  }
}

async function fetchSubscription(subscriptionId) {
  if (!stripe || !subscriptionId) return null;
  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch {
    return null;
  }
}

async function findActiveStripeSubscriptionByEmail(email = "") {
  const normalized = normalizeEmail(email);
  if (!stripe || !isValidEmail(normalized)) return null;

  try {
    const customers = await stripe.customers.list({ email: normalized, limit: 10 });
    for (const customer of customers.data || []) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: "all",
        limit: 10
      });
      const active = (subscriptions.data || []).find((subscription) => isPremiumStatus(subscription.status));
      if (active) {
        return { customer, subscription: active };
      }
    }
  } catch {}

  return null;
}

async function fetchChargeForRefund(refund = {}) {
  if (!stripe) return null;
  const chargeId = typeof refund.charge === "string"
    ? refund.charge
    : (refund.charge?.id || "");

  if (!chargeId) return null;

  try {
    return await stripe.charges.retrieve(chargeId, {
      expand: ["invoice.subscription"]
    });
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

  if (event.type === "refund.created" || event.type === "refund.updated" || event.type === "refund.failed") {
    const refund = event.data.object;
    const charge = await fetchChargeForRefund(refund);
    const existing =
      findLicenseBySubscriptionId(store, getChargeSubscriptionId(charge || {}))
      || findLicenseByCustomerId(store, getChargeCustomerId(charge || {}));

    if (existing) {
      applyRefundToLicense(existing, refund, charge || {});
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
  const email = normalizeEmail(req.query.email || "");
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
      ...(isValidEmail(email) ? { customer_email: email } : {}),
      metadata: {
        installId,
        userEmail: email,
        source,
        plan,
        platform: "chrome_extension"
      },
      subscription_data: {
        metadata: {
          installId,
          userEmail: email,
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
  const email = normalizeEmail(req.query.email || "");
  const takeover = String(req.query.takeover || "").trim() === "1";
  if (!installId) {
    return res.status(400).json({ message: "installId es obligatorio" });
  }

  const store = await readStore();
  const license = store.licenses[installId];
  const emailLicense = email ? findLicenseByEmail(store, email) : null;
  const storedLicenseEmail = normalizeEmail(license?.userEmail || "");
  const strictLicenseEmailMismatch = !!(
    license?.premium
    && email
    && storedLicenseEmail
    && storedLicenseEmail !== email
  );
  const emailLinkedToDifferentInstall = !!(
    emailLicense?.premium
    && String(emailLicense.installId || "").trim()
    && String(emailLicense.installId || "").trim() !== installId
  );

  if (emailLinkedToDifferentInstall) {
    const provider = emailLicense.provider || "stripe";
    const isManual = provider === "manual_email";
    if (takeover) {
      const transferred = transferLicenseToInstall(store, emailLicense, installId, email);
      await writeStore(store);
      return res.json({
        premium: true,
        plan: "premium",
        status: transferred?.status || "active",
        expiresAt: transferred?.currentPeriodEnd || transferred?.cancelAt || "",
        customerPortalUrl: transferred?.customerPortalUrl || "",
        provider,
        source: isManual ? "manual_email_transferred" : "premium_email_transferred",
        email,
        message: isManual
          ? "El acceso manual se movió a esta instalación."
          : "El acceso Premium se movió a esta instalación."
      });
    }
    return res.json({
      premium: false,
      plan: "free",
      status: "inactive",
      provider,
      source: isManual ? "manual_email_in_use" : "premium_email_in_use",
      email,
      takeoverAvailable: true,
      message: isManual
        ? "Este correo manual ya está activo en otra instalación."
        : "Este correo Premium ya está activo en otra instalación."
    });
  }

  if (email && ADMIN_PREMIUM_EMAILS.has(email)) {
    const manual = upsertLicense(store, installId);
    manual.provider = "manual_email";
    manual.userEmail = email;
    manual.plan = "premium";
    manual.premium = true;
    manual.status = "active";
    manual.updatedAt = new Date().toISOString();
    await writeStore(store);
    return res.json({
      premium: true,
      plan: "premium",
      status: "active",
      expiresAt: "",
      customerPortalUrl: "",
      provider: "manual_email",
      source: "manual_email",
      email
    });
  }

  if (emailLicense?.premium) {
    const linked = upsertLicense(store, installId);
    Object.assign(linked, {
      ...emailLicense,
      installId,
      linkedFromEmail: email,
      updatedAt: new Date().toISOString()
    });
    await writeStore(store);
    return res.json({
      premium: true,
      plan: "premium",
      status: emailLicense.status || "active",
      expiresAt: emailLicense.currentPeriodEnd || emailLicense.cancelAt || "",
      customerPortalUrl: emailLicense.customerPortalUrl || "",
      provider: emailLicense.provider || "stripe",
      source: "stored_email",
      email
    });
  }

  if (strictLicenseEmailMismatch) {
    return res.json({
      premium: false,
      plan: "free",
      status: "inactive",
      provider: license?.provider || "stripe",
      source: "email_mismatch",
      email
    });
  }

  if (license?.premium) {
    return res.json({
      premium: true,
      plan: "premium",
      status: license.status || "active",
      expiresAt: license.currentPeriodEnd || license.cancelAt || "",
      customerPortalUrl: license.customerPortalUrl || "",
      provider: license.provider || "stripe",
      email: license.userEmail || email || ""
    });
  }

  const activeByStripeEmail = email ? await findActiveStripeSubscriptionByEmail(email) : null;
  if (activeByStripeEmail) {
    const linked = upsertLicense(store, installId);
    linked.userEmail = email;
    linked.customerId = activeByStripeEmail.customer.id;
    applySubscriptionToLicense(linked, activeByStripeEmail.subscription);
    await writeStore(store);
    return res.json({
      premium: true,
      plan: "premium",
      status: linked.status || "active",
      expiresAt: linked.currentPeriodEnd || linked.cancelAt || "",
      customerPortalUrl: linked.customerPortalUrl || "",
      provider: "stripe",
      source: "stripe_email",
      email
    });
  }

  if (!license) {
    return res.json({ premium: false, plan: "free", status: "inactive", provider: "stripe", email });
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
        <p>Vuelve al popup de la extension. La licencia se sincronizara automaticamente al regresar.</p>
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
