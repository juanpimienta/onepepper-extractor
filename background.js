import { BILLING_CONFIG, buildCheckoutUrl, buildLicenseStatusUrl, buildAccessStatusUrl } from "./shared/billing-config.js";

function setActionIcon(tabId, path) {
  if (!tabId) return;
  chrome.action.setIcon({ tabId, path });
}

function handleIconMessage(action, tabId) {
  if (!action?.startsWith("icon:")) return;

  if (action === "icon:never" || action === "icon:error") {
    setActionIcon(tabId, {
      16: "icons/state/pepper-rojo-16.png",
      24: "icons/state/pepper-rojo-24.png",
      32: "icons/state/pepper-rojo-32.png"
    });
  }
  if (action === "icon:loading") {
    setActionIcon(tabId, {
      16: "icons/state/pepper-amarillo-16.png",
      24: "icons/state/pepper-amarillo-24.png",
      32: "icons/state/pepper-amarillo-32.png"
    });
  }
  if (action === "icon:saved" || action === "icon:done") {
    setActionIcon(tabId, {
      16: "icons/state/pepper-azul-16.png",
      24: "icons/state/pepper-azul-24.png",
      32: "icons/state/pepper-azul-32.png"
    });
  }
}

async function handleOpenCheckout(msg) {
  const checkoutUrl = buildCheckoutUrl(msg?.plan, {
    installId: msg?.installId || "",
    source: msg?.source || "popup"
  });

  if (!checkoutUrl) {
    return {
      ok: false,
      message: "Configura Stripe en shared/billing-config.js antes de abrir el checkout."
    };
  }

  await chrome.tabs.create({ url: checkoutUrl, active: true });
  return { ok: true, url: checkoutUrl };
}

async function handleSyncLicenseStatus(msg) {
  const statusUrl = buildLicenseStatusUrl(msg?.installId || "");
  if (!statusUrl) {
    return {
      ok: false,
      configured: false,
      message: "Configura licenseApi.statusUrl en shared/billing-config.js para verificar licencias."
    };
  }

  const ctrl = new AbortController();
  const timeoutMs = Number(BILLING_CONFIG.licenseApi.timeoutMs) || 8000;
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const headers = { Accept: "application/json" };
    if (BILLING_CONFIG.licenseApi.bearerToken) {
      headers.Authorization = `Bearer ${BILLING_CONFIG.licenseApi.bearerToken}`;
    }

    const res = await fetch(statusUrl, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: ctrl.signal
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        configured: true,
        message: data?.message || `Error verificando licencia (${res.status}).`
      };
    }

    const premium = Boolean(data?.premium || data?.plan === "premium" || data?.status === "active");
    return {
      ok: true,
      configured: true,
      premium,
      plan: premium ? "premium" : "free",
      status: data?.status || (premium ? "active" : "inactive"),
      customerPortalUrl: data?.customerPortalUrl || "",
      expiresAt: data?.expiresAt || "",
      raw: data
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      message: error?.name === "AbortError"
        ? "La verificacion de licencia excedio el tiempo de espera."
        : (error?.message || "No se pudo consultar la licencia.")
    };
  } finally {
    clearTimeout(timer);
  }
}

async function callAccessApi(url, { method = "GET", body } = {}) {
  if (!url) {
    return {
      ok: false,
      configured: false,
      message: "Configura accessApi en shared/billing-config.js para controlar las descargas gratuitas."
    };
  }

  const ctrl = new AbortController();
  const timeoutMs = Number(BILLING_CONFIG.accessApi?.timeoutMs) || 8000;
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const headers = { Accept: "application/json" };
    if (body) headers["Content-Type"] = "application/json";
    if (BILLING_CONFIG.accessApi?.bearerToken) {
      headers.Authorization = `Bearer ${BILLING_CONFIG.accessApi.bearerToken}`;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: ctrl.signal
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        configured: true,
        status: res.status,
        message: data?.message || `Error de acceso (${res.status}).`,
        raw: data
      };
    }

    return {
      ok: true,
      configured: true,
      raw: data,
      ...data
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      message: error?.name === "AbortError"
        ? "La verificación de descargas excedió el tiempo de espera."
        : (error?.message || "No se pudo consultar el acceso.")
    };
  } finally {
    clearTimeout(timer);
  }
}

async function handleAccessStatus(msg) {
  const statusUrl = buildAccessStatusUrl(msg?.installId || "");
  return callAccessApi(statusUrl, { method: "GET" });
}

async function handleAccessExportCheck(msg) {
  const url = BILLING_CONFIG.accessApi?.checkUrl || "";
  return callAccessApi(url, {
    method: "POST",
    body: {
      installId: msg?.installId || "",
      format: msg?.format || "",
      country: msg?.country || "",
      recordsCount: Number(msg?.recordsCount || 0),
      domain: msg?.domain || ""
    }
  });
}

async function handleAccessExportCommit(msg) {
  const url = BILLING_CONFIG.accessApi?.commitUrl || "";
  return callAccessApi(url, {
    method: "POST",
    body: {
      installId: msg?.installId || "",
      format: msg?.format || "",
      country: msg?.country || "",
      recordsCount: Number(msg?.recordsCount || 0),
      domain: msg?.domain || ""
    }
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "OPEN_CHECKOUT") {
    handleOpenCheckout(msg).then(sendResponse);
    return true;
  }

  if (msg?.type === "SYNC_LICENSE_STATUS") {
    handleSyncLicenseStatus(msg).then(sendResponse);
    return true;
  }

  if (msg?.type === "ACCESS_STATUS") {
    handleAccessStatus(msg).then(sendResponse);
    return true;
  }

  if (msg?.type === "ACCESS_EXPORT_CHECK") {
    handleAccessExportCheck(msg).then(sendResponse);
    return true;
  }

  if (msg?.type === "ACCESS_EXPORT_COMMIT") {
    handleAccessExportCommit(msg).then(sendResponse);
    return true;
  }

  const tabId = msg?.tabId ?? sender.tab?.id;
  if (msg?.action?.startsWith("icon:")) {
    handleIconMessage(msg.action, tabId);
  }
});
