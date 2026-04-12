import { setUserPlan } from "./access.js";

const INSTALL_ID_KEY = "licenseInstallId";
const LICENSE_CACHE_KEY = "licenseCache";
const LICENSE_LAST_SYNC_KEY = "licenseLastSyncAt";

export async function getOrCreateInstallId() {
  const stored = await chrome.storage.local.get({ [INSTALL_ID_KEY]: "" });
  if (stored[INSTALL_ID_KEY]) return stored[INSTALL_ID_KEY];

  const installId = crypto.randomUUID();
  await chrome.storage.local.set({ [INSTALL_ID_KEY]: installId });
  return installId;
}

export async function getCachedLicenseState() {
  const stored = await chrome.storage.local.get({
    [LICENSE_CACHE_KEY]: null,
    [LICENSE_LAST_SYNC_KEY]: 0
  });
  return {
    cache: stored[LICENSE_CACHE_KEY],
    lastSyncAt: Number(stored[LICENSE_LAST_SYNC_KEY]) || 0
  };
}

export async function syncLicenseStatus({ force = false, maxAgeMs = 5 * 60 * 1000 } = {}) {
  const { cache, lastSyncAt } = await getCachedLicenseState();
  const now = Date.now();

  if (!force && cache && lastSyncAt > 0 && (now - lastSyncAt) < maxAgeMs) {
    return { ok: true, cached: true, ...cache };
  }

  const installId = await getOrCreateInstallId();
  const res = await chrome.runtime.sendMessage({
    type: "SYNC_LICENSE_STATUS",
    installId
  });

  if (!res?.ok) return { ok: false, ...res };

  const next = {
    premium: !!res.premium,
    plan: res.plan === "premium" ? "premium" : "free",
    status: res.status || "inactive",
    customerPortalUrl: res.customerPortalUrl || "",
    expiresAt: res.expiresAt || ""
  };

  await setUserPlan(next.plan);
  await chrome.storage.local.set({
    [LICENSE_CACHE_KEY]: next,
    [LICENSE_LAST_SYNC_KEY]: now
  });

  return { ok: true, cached: false, ...next };
}

