// Ejemplo de router
export async function extractPhones(countryIso = "ES", opts = {}) {
  const ISO = String(countryIso || "ES").toUpperCase();
  switch (ISO) {
    case "FR": return (await import("./FR.js")).default(opts);
    case "IT": return (await import("./IT.js")).default(opts);
    case "ES": return (await import("./ES.js")).default(opts);

    // Usa el genérico para el resto (UE/LatAm/NANP)
    case "DE": case "PT": case "GB": case "NL": case "BE": case "CH": case "AT":
    case "IE": case "NO": case "SE": case "DK": case "FI":
    case "US": case "CA": case "PR": case "DO":
    case "MX": case "AR": case "BR": case "CL": case "CO": case "PE": case "UY": case "EC":
      return (await import("./INTL.js")).default({ ...opts, iso: ISO });

    default:
      // Fallback: también genérico
      return (await import("./INTL.js")).default({ ...opts, iso: ISO });
  }
}
