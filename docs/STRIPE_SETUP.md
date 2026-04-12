# Stripe Setup

## 1. Crear los precios en Stripe

- Crea un producto llamado `Extractor Leads Premium`.
- Crea una suscripcion mensual.
- Crea una suscripcion anual.
- Guarda los dos `price_id`.

## 2. Preparar el backend

- Copia [billing-backend/.env.example](/Users/juanpimienta/Documents/Visual-Studio-Code-2/Juan/Extractor_Leads_5/Extractor_Leads/billing-backend/.env.example) a `.env`.
- Completa:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PRICE_MONTHLY_ID`
  - `STRIPE_PRICE_YEARLY_ID`
  - `APP_BASE_URL`
  - `LICENSE_API_BEARER_TOKEN`

## 3. Configurar la extension

Edita [shared/billing-config.js](/Users/juanpimienta/Documents/Visual-Studio-Code-2/Juan/Extractor_Leads_5/Extractor_Leads/shared/billing-config.js):

```js
export const BILLING_CONFIG = {
  provider: "stripe",
  stripe: {
    checkoutBaseUrl: "https://tu-dominio.com/api/billing/checkout",
    paymentLinks: {
      month: "",
      year: "",
      premium: ""
    }
  },
  licenseApi: {
    statusUrl: "https://tu-dominio.com/api/license/status",
    bearerToken: "tu-token-interno",
    timeoutMs: 8000
  }
};
```

## 4. Webhook de Stripe

Apunta el webhook a:

`POST /api/stripe/webhook`

Eventos minimos recomendados:

- `checkout.session.completed`
- `customer.subscription.deleted`
- `invoice.payment_failed`

## 5. Flujo esperado

1. La extension genera un `installId`.
2. El popup abre `OPEN_CHECKOUT`.
3. El backend crea la `Checkout Session`.
4. Stripe cobra la suscripcion.
5. El webhook marca la licencia como activa.
6. La extension consulta `/api/license/status`.
7. `userPlan` cambia a `premium`.

## 6. Antes de publicar

- Pon `FORCE_PREMIUM_FOR_TESTS = false` en [popup/services/access.js](/Users/juanpimienta/Documents/Visual-Studio-Code-2/Juan/Extractor_Leads_5/Extractor_Leads/popup/services/access.js).
- Prueba el flujo con claves `test`.
- Confirma que Premium se pierde si la suscripcion se cancela.
- Sustituye el almacenamiento JSON del backend por base de datos antes de escalar.
