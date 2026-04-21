const USER_PLAN_KEY = "userPlan";
const LEGACY_PAID_KEY = "paid";
const FREE_DOWNLOADS_USED_KEY = "freeDownloadsUsed";
const INSTALL_ID_KEY = "licenseInstallId";
const FORCE_PREMIUM_FOR_TESTS = false;

export const FREE_DOWNLOADS_LIMIT = 10;

function normalizePlan(rawPlan, legacyPaid) {
  if (rawPlan === "premium") return "premium";
  if (legacyPaid === true) return "premium";
  return "free";
}

function normalizeUsage(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

async function getInstallId() {
  const stored = await chrome.storage.local.get({ [INSTALL_ID_KEY]: "" });
  return String(stored[INSTALL_ID_KEY] || "").trim();
}

async function cacheUsage(used, limit = FREE_DOWNLOADS_LIMIT) {
  await chrome.storage.local.set({
    [FREE_DOWNLOADS_USED_KEY]: normalizeUsage(used),
    freeDownloadsLimit: Number(limit) || FREE_DOWNLOADS_LIMIT
  });
}

async function requestAccessStatus() {
  const installId = await getInstallId();
  if (!installId) {
    return { ok: false, message: "installId no disponible." };
  }

  return chrome.runtime.sendMessage({
    type: "ACCESS_STATUS",
    installId
  });
}

async function requestAccessCheck(payload = {}) {
  const installId = await getInstallId();
  if (!installId) {
    return { ok: false, message: "installId no disponible." };
  }

  return chrome.runtime.sendMessage({
    type: "ACCESS_EXPORT_CHECK",
    installId,
    ...payload
  });
}

async function requestAccessCommit(payload = {}) {
  const installId = await getInstallId();
  if (!installId) {
    return { ok: false, message: "installId no disponible." };
  }

  return chrome.runtime.sendMessage({
    type: "ACCESS_EXPORT_COMMIT",
    installId,
    ...payload
  });
}

function toAccessState(plan, used, limit) {
  const premium = isPremiumPlan(plan);
  const normalizedUsed = normalizeUsage(used);
  const normalizedLimit = Number(limit) > 0 ? Number(limit) : FREE_DOWNLOADS_LIMIT;
  const remaining = premium ? Infinity : Math.max(0, normalizedLimit - normalizedUsed);

  return {
    plan,
    isPremium: premium,
    freeDownloadsUsed: normalizedUsed,
    freeDownloadsLimit: normalizedLimit,
    downloadsRemaining: remaining,
    canDownload: premium ? true : normalizedUsed < normalizedLimit,
    canUseDeepExploration: canUseDeepExploration(plan),
    planLabel: premium ? "Premium" : "Gratis",
    usageLabel: premium ? "Ilimitadas" : `${normalizedUsed}/${normalizedLimit}`
  };
}

export function isPremiumPlan(plan) {
  return plan === "premium";
}

export async function getUserPlan() {
  if (FORCE_PREMIUM_FOR_TESTS) return "premium";

  const stored = await chrome.storage.local.get({
    [USER_PLAN_KEY]: "free",
    [LEGACY_PAID_KEY]: false
  });

  const plan = normalizePlan(stored[USER_PLAN_KEY], stored[LEGACY_PAID_KEY]);

  if (stored[USER_PLAN_KEY] !== plan || stored[LEGACY_PAID_KEY] !== isPremiumPlan(plan)) {
    await chrome.storage.local.set({
      [USER_PLAN_KEY]: plan,
      [LEGACY_PAID_KEY]: isPremiumPlan(plan)
    });
  }

  return plan;
}

export async function setUserPlan(plan) {
  const normalized = isPremiumPlan(plan) ? "premium" : "free";
  await chrome.storage.local.set({
    [USER_PLAN_KEY]: normalized,
    [LEGACY_PAID_KEY]: normalized === "premium"
  });
  return normalized;
}

export async function isPremium() {
  return isPremiumPlan(await getUserPlan());
}

export async function getDownloadUsage() {
  const stored = await chrome.storage.local.get({ [FREE_DOWNLOADS_USED_KEY]: 0 });
  return normalizeUsage(stored[FREE_DOWNLOADS_USED_KEY]);
}

export function canDownload(currentUsage, plan) {
  if (isPremiumPlan(plan)) return true;
  return normalizeUsage(currentUsage) < FREE_DOWNLOADS_LIMIT;
}

export function canUseDeepExploration(plan) {
  return isPremiumPlan(plan);
}

export async function registerDownload(payload = {}) {
  if (FORCE_PREMIUM_FOR_TESTS) {
    return {
      allowed: true,
      plan: "premium",
      freeDownloadsUsed: 0,
      freeDownloadsLimit: FREE_DOWNLOADS_LIMIT,
      registered: false
    };
  }

  const plan = await getUserPlan();
  if (isPremiumPlan(plan)) {
    const committed = await requestAccessCommit(payload);
    if (committed?.ok) {
      await cacheUsage(committed.exportsUsed, committed.exportsLimit);
      return {
        allowed: true,
        plan: "premium",
        freeDownloadsUsed: normalizeUsage(committed.exportsUsed),
        freeDownloadsLimit: Number(committed.exportsLimit) || FREE_DOWNLOADS_LIMIT,
        registered: false
      };
    }
    return {
      allowed: false,
      plan,
      freeDownloadsUsed: await getDownloadUsage(),
      freeDownloadsLimit: FREE_DOWNLOADS_LIMIT,
      message: committed?.message || "No se pudo validar la exportación."
    };
  }

  const checked = await requestAccessCheck(payload);
  if (!checked?.ok) {
    return {
      allowed: false,
      plan,
      freeDownloadsUsed: await getDownloadUsage(),
      freeDownloadsLimit: Number(checked?.exportsLimit) || FREE_DOWNLOADS_LIMIT,
      reason: checked?.reason || "backend_error",
      message: checked?.message || "No se pudo validar la exportación."
    };
  }

  if (!checked.allowed) {
    await cacheUsage(checked.exportsUsed, checked.exportsLimit);
    return {
      allowed: false,
      plan: checked.plan === "premium" ? "premium" : "free",
      freeDownloadsUsed: normalizeUsage(checked.exportsUsed),
      freeDownloadsLimit: Number(checked.exportsLimit) || FREE_DOWNLOADS_LIMIT,
      reason: checked.reason || "downloads_limit",
      message: checked.message || ""
    };
  }

  const committed = await requestAccessCommit(payload);
  if (!committed?.ok) {
    return {
      allowed: false,
      plan,
      freeDownloadsUsed: await getDownloadUsage(),
      freeDownloadsLimit: Number(checked.exportsLimit) || FREE_DOWNLOADS_LIMIT,
      reason: committed?.reason || "backend_error",
      message: committed?.message || "No se pudo registrar la exportación."
    };
  }

  await cacheUsage(committed.exportsUsed, committed.exportsLimit);
  return {
    allowed: true,
    plan: committed.plan === "premium" ? "premium" : "free",
    freeDownloadsUsed: normalizeUsage(committed.exportsUsed),
    freeDownloadsLimit: Number(committed.exportsLimit) || FREE_DOWNLOADS_LIMIT,
    registered: !isPremiumPlan(committed.plan)
  };
}

export async function getAccessState() {
  if (FORCE_PREMIUM_FOR_TESTS) {
    return toAccessState("premium", 0, FREE_DOWNLOADS_LIMIT);
  }

  const [plan, used] = await Promise.all([getUserPlan(), getDownloadUsage()]);
  const fallback = toAccessState(plan, used, FREE_DOWNLOADS_LIMIT);

  const res = await requestAccessStatus();
  if (!res?.ok) {
    return fallback;
  }

  const nextPlan = res.plan === "premium" ? "premium" : "free";
  await setUserPlan(nextPlan);
  await cacheUsage(res.exportsUsed, res.exportsLimit);

  return {
    ...toAccessState(nextPlan, res.exportsUsed, res.exportsLimit),
    lastExportAt: res.lastExportAt || "",
    lastExportFormat: res.lastExportFormat || "",
    lastCountry: res.lastCountry || "",
    lastDomain: res.lastDomain || ""
  };
}
