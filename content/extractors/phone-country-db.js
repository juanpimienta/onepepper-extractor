// content/extractors/phone-country-db.js
// Base de reglas por país (LatAm, Norteamérica, Europa)

const DB = {
  /* =======================
   *  NORTEAMÉRICA (NANP + otros)
   * ======================= */
  US: { cc:"1",  national:[10], dropTrunk0:false, fmt:{ 10:[3,3,4] } },
  CA: { cc:"1",  national:[10], dropTrunk0:false, fmt:{ 10:[3,3,4] } },
  MX: { cc:"52", national:[10], dropTrunk0:false, fmt:{ 10:[3,3,4] } },

  // NANP Caribe (mismo patrón 10 dígitos)
  PR: { cc:"1", national:[10], dropTrunk0:false, fmt:{ 10:[3,3,4] } }, // Puerto Rico
  DO: { cc:"1", national:[10], dropTrunk0:false, fmt:{ 10:[3,3,4] } }, // Rep. Dominicana
  JM: { cc:"1", national:[10], dropTrunk0:false, fmt:{ 10:[3,3,4] } }, // Jamaica
  TT: { cc:"1", national:[10], dropTrunk0:false, fmt:{ 10:[3,3,4] } }, // Trinidad y Tobago
  BS: { cc:"1", national:[10], dropTrunk0:false, fmt:{ 10:[3,3,4] } }, // Bahamas
  BB: { cc:"1", national:[10], dropTrunk0:false, fmt:{ 10:[3,3,4] } }, // Barbados
  // No NANP
  HT: { cc:"509", national:[8], dropTrunk0:false, fmt:{ 8:[4,4] } },    // Haití

  /* =======================
   *  LATINOAMÉRICA
   * ======================= */
  AR: { cc:"54", national:[10], dropTrunk0:false, fmt:{ 10:[3,3,4] } },    // AR es complejo con 9 móvil int., usamos 10 dom.
  BO: { cc:"591", national:[8],  dropTrunk0:false, fmt:{ 8:[2,3,3] } },
  BR: { cc:"55", national:[10,11], dropTrunk0:false, fmt:{ 10:[2,4,4], 11:[2,5,4] } },
  CL: { cc:"56", national:[9],  dropTrunk0:false, fmt:{ 9:[3,3,3] } },
  CO: { cc:"57", national:[10], dropTrunk0:false, fmt:{ 10:[3,3,4] } },    // móvil empieza con 3
  CR: { cc:"506", national:[8], dropTrunk0:false, fmt:{ 8:[4,4] } },
  CU: { cc:"53",  national:[8], dropTrunk0:false, fmt:{ 8:[4,4] } },
  EC: { cc:"593", national:[8,9], dropTrunk0:false, fmt:{ 8:[4,4], 9:[3,3,3] } }, // 9 móvil, 8 fijos
  SV: { cc:"503", national:[8], dropTrunk0:false, fmt:{ 8:[4,4] } },       // El Salvador
  GT: { cc:"502", national:[8], dropTrunk0:false, fmt:{ 8:[4,4] } },
  HN: { cc:"504", national:[8], dropTrunk0:false, fmt:{ 8:[4,4] } },
  NI: { cc:"505", national:[8], dropTrunk0:false, fmt:{ 8:[4,4] } },
  PA: { cc:"507", national:[8], dropTrunk0:false, fmt:{ 8:[4,4] } },
  PY: { cc:"595", national:[9], dropTrunk0:false, fmt:{ 9:[3,3,3] } },
  PE: { cc:"51",  national:[9], dropTrunk0:false, fmt:{ 9:[3,3,3] } },     // 9 móvil; fijos 7-8 (normalizamos a 9)
  UY: { cc:"598", national:[8,9], dropTrunk0:false, fmt:{ 8:[4,4], 9:[3,3,3] } },
  VE: { cc:"58",  national:[10], dropTrunk0:false, fmt:{ 10:[3,3,4] } },

  /* =======================
   *  EUROPA OCCIDENTAL
   * ======================= */
  ES: { cc:"34",  national:[9],  dropTrunk0:false, fmt:{ 9:[3,3,3] },
        starts:{ mobile:[6,7], fixed:[8,9] } },
  PT: { cc:"351", national:[9],  dropTrunk0:false, fmt:{ 9:[3,3,3] } },
  FR: { cc:"33",  national:[9],  dropTrunk0:true,  fmt:{ 9:[1,2,2,2,2] },  // +33 1 23 45 67 89
        starts:{ mobile:[6,7] } },
  IT: { cc:"39",  national:[9,10], dropTrunk0:false, fmt:{ 9:[3,3,3], 10:[3,3,4] } }, // mantiene 0
  DE: { cc:"49",  national:[10,11], dropTrunk0:false, fmt:{} },            // DE muy variable → no forzamos grupos
  GB: { cc:"44",  national:[10], dropTrunk0:true,  fmt:{ 10:[3,3,4] } },   // UK quita 0 troncal
  IE: { cc:"353", national:[9],  dropTrunk0:true,  fmt:{ 9:[3,3,3] } },
  NL: { cc:"31",  national:[9],  dropTrunk0:true,  fmt:{ 9:[3,3,3] } },
  BE: { cc:"32",  national:[9],  dropTrunk0:true,  fmt:{ 9:[3,3,3] } },
  LU: { cc:"352", national:[8,9,10,11], dropTrunk0:false, fmt:{} },
  CH: { cc:"41",  national:[9],  dropTrunk0:true,  fmt:{ 9:[3,3,3] } },
  AT: { cc:"43",  national:[10], dropTrunk0:true,  fmt:{ 10:[3,3,4] } },

  /* =======================
   *  EUROPA NORTE / NÓRDICOS
   * ======================= */
  DK: { cc:"45",  national:[8],  dropTrunk0:false, fmt:{ 8:[2,2,2,2] } },
  NO: { cc:"47",  national:[8],  dropTrunk0:false, fmt:{ 8:[2,2,2,2] } },
  SE: { cc:"46",  national:[9,10], dropTrunk0:true, fmt:{} },
  FI: { cc:"358", national:[9,10], dropTrunk0:true, fmt:{} },
  IS: { cc:"354", national:[7],  dropTrunk0:false, fmt:{ 7:[3,4] } },

  /* =======================
   *  EUROPA CENTRAL / ESTE
   * ======================= */
  PL: { cc:"48",  national:[9],  dropTrunk0:false, fmt:{ 9:[3,3,3] } },
  CZ: { cc:"420", national:[9],  dropTrunk0:false, fmt:{ 9:[3,3,3] } },
  SK: { cc:"421", national:[9],  dropTrunk0:false, fmt:{ 9:[3,3,3] } },
  HU: { cc:"36",  national:[9],  dropTrunk0:true,  fmt:{ 9:[3,3,3] } },
  RO: { cc:"40",  national:[9],  dropTrunk0:false, fmt:{ 9:[3,3,3] } },
  BG: { cc:"359", national:[9],  dropTrunk0:true,  fmt:{ 9:[3,3,3] } },
  GR: { cc:"30",  national:[10], dropTrunk0:false, fmt:{ 10:[3,3,4] } },
  CY: { cc:"357", national:[8],  dropTrunk0:false, fmt:{ 8:[2,3,3] } },
  MT: { cc:"356", national:[8],  dropTrunk0:false, fmt:{ 8:[4,4] } },
  SI: { cc:"386", national:[8],  dropTrunk0:false, fmt:{ 8:[3,3,2] } },
  HR: { cc:"385", national:[8,9], dropTrunk0:false, fmt:{ 8:[3,3,2], 9:[3,3,3] } },
  RS: { cc:"381", national:[9,10], dropTrunk0:false, fmt:{} },             // Serbia
  BA: { cc:"387", national:[8,9], dropTrunk0:false, fmt:{} },              // Bosnia
  MK: { cc:"389", national:[8],  dropTrunk0:false, fmt:{ 8:[3,3,2] } },    // North Macedonia
  AL: { cc:"355", national:[9],  dropTrunk0:false, fmt:{ 9:[3,3,3] } },
  ME: { cc:"382", national:[8],  dropTrunk0:false, fmt:{ 8:[3,3,2] } },
  UA: { cc:"380", national:[9],  dropTrunk0:false, fmt:{ 9:[3,3,3] } },

  /* =======================
   *  PUENTE EUROPA-ASIA
   * ======================= */
  TR: { cc:"90",  national:[10], dropTrunk0:false, fmt:{ 10:[3,3,4] } },
  RU: { cc:"7",   national:[10], dropTrunk0:false, fmt:{ 10:[3,3,4] } }
};

// Devuelve la configuración (o ES por defecto)
export function getCountryCfg(iso = "ES") {
  return DB[iso] || DB.ES;
}

// Por si necesitas listar rápido los países soportados
export function supportedCountries() {
  return Object.keys(DB);
}

// Útil si quieres un mapa ISO -> cc
export function countryToCC() {
  const out = {};
  for (const k of Object.keys(DB)) out[k] = DB[k].cc;
  return out;
}

export default DB;
