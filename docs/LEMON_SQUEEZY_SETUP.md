# Lemon Squeezy Setup

## 1. Datos que ya tienes

- Variante mensual: `1515006`
- Variante anual: `1515032`

## 2. Variables del backend

Copia [billing-backend/.env.example](/Users/juanpimienta/Documents/Visual-Studio-Code-2/Juan/Extractor_Leads_5/Extractor_Leads/billing-backend/.env.example) a `.env` y completa:

- `LEMON_SQUEEZY_API_KEY`
- `LEMON_SQUEEZY_STORE_ID`
- `LEMON_SQUEEZY_WEBHOOK_SECRET`
- `LEMON_SQUEEZY_VARIANT_MONTHLY_ID`
- `LEMON_SQUEEZY_VARIANT_YEARLY_ID`
- `APP_BASE_URL`
- `APP_SUCCESS_URL`
- `APP_CANCEL_URL`
- `LICENSE_API_BEARER_TOKEN`

## 3. Endpoints del backend

El backend expone:

- `GET /api/lemonsqueezy/checkout`
- `POST /api/lemonsqueezy/webhook`
- `GET /api/license/status`
- `GET /health`

## 4. Configurar la extension

Edita [shared/billing-config.js](/Users/juanpimienta/Documents/Visual-Studio-Code-2/Juan/Extractor_Leads_5/Extractor_Leads/shared/billing-config.js):

```js
export const BILLING_CONFIG = {
  provider: "lemonsqueezy",
  lemonsqueezy: {
    checkoutBaseUrl: "https://tu-backend.onrender.com/api/lemonsqueezy/checkout",
    storeSubdomain: "",
    variants: {
      month: "1515006",
      year: "1515032"
    }
  },
  licenseApi: {
    statusUrl: "https://tu-backend.onrender.com/api/license/status",
    bearerToken: "tu-token-interno",
    timeoutMs: 8000
  }
};
```

## 5. Configurar el webhook en Lemon Squeezy

En `Settings -> Webhooks`:

- `Callback URL`: `https://tu-backend.onrender.com/api/lemonsqueezy/webhook`
- `Signing secret`: el mismo valor de `LEMON_SQUEEZY_WEBHOOK_SECRET`

Eventos minimos:

- `subscription_created`
- `subscription_updated`
- `subscription_payment_success`
- `license_key_created`

## 6. Render

En Render crea un `Web Service` para [billing-backend](/Users/juanpimienta/Documents/Visual-Studio-Code-2/Juan/Extractor_Leads_5/Extractor_Leads/billing-backend):

- Runtime: `Node`
- Build command: `npm install`
- Start command: `node server.js`
- Root directory: `billing-backend`

Cuando Render te de una URL, actualiza:

- `shared/billing-config.js`
- webhook de Lemon Squeezy

## 7. Flujo esperado

1. La extension genera un `installId`.
2. El popup abre `OPEN_CHECKOUT`.
3. El backend crea el checkout en Lemon Squeezy con `custom.installId`.
4. Lemon Squeezy cobra la suscripcion.
5. El webhook marca la licencia como activa.
6. La extension consulta `/api/license/status`.
7. `userPlan` cambia a `premium`.
