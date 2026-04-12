const USER_PLAN_KEY = "userPlan";
const LEGACY_PAID_KEY = "paid";
const FREE_DOWNLOADS_USED_KEY = "freeDownloadsUsed";
const FORCE_PREMIUM_FOR_TESTS = true;

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

export async function registerDownload() {
  const [plan, used] = await Promise.all([getUserPlan(), getDownloadUsage()]);

  if (!canDownload(used, plan)) {
    return {
      allowed: false,
      plan,
      freeDownloadsUsed: used,
      freeDownloadsLimit: FREE_DOWNLOADS_LIMIT
    };
  }

  if (isPremiumPlan(plan)) {
    return {
      allowed: true,
      plan,
      freeDownloadsUsed: used,
      freeDownloadsLimit: FREE_DOWNLOADS_LIMIT,
      registered: false
    };
  }

  const next = used + 1;
  await chrome.storage.local.set({ [FREE_DOWNLOADS_USED_KEY]: next });

  return {
    allowed: true,
    plan,
    freeDownloadsUsed: next,
    freeDownloadsLimit: FREE_DOWNLOADS_LIMIT,
    registered: true
  };
}

export async function getAccessState() {
  const [plan, used] = await Promise.all([getUserPlan(), getDownloadUsage()]);
  const premium = isPremiumPlan(plan);
  const remaining = premium ? Infinity : Math.max(0, FREE_DOWNLOADS_LIMIT - used);

  return {
    plan,
    isPremium: premium,
    freeDownloadsUsed: used,
    freeDownloadsLimit: FREE_DOWNLOADS_LIMIT,
    downloadsRemaining: remaining,
    canDownload: canDownload(used, plan),
    canUseDeepExploration: canUseDeepExploration(plan),
    planLabel: premium ? "Premium" : "Gratis",
    usageLabel: premium ? "Ilimitadas" : `${used}/${FREE_DOWNLOADS_LIMIT}`
  };
}
