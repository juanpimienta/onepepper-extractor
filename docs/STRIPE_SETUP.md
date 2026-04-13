# Stripe Setup

## 1. Datos del producto

- Producto: `Extractor Leads Premium`
- Mensual `7,99 €`: `price_1TLlWVF8JKKwNyVlwZKrskmX`
- Anual `49,99 €`: `price_1TLlQSF8JKKwNyVlgw131SBL`

## 2. Variables del backend

Copia [billing-backend/.env.example](/Users/juanpimienta/Documents/Visual-Studio-Code-2/Juan/Extractor_Leads_5/Extractor_Leads/billing-backend/.env.example) a `.env` y completa:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_MONTHLY_ID`
- `STRIPE_PRICE_YEARLY_ID`
- `APP_BASE_URL`
- `APP_SUCCESS_URL`
- `APP_CANCEL_URL`
- `LICENSE_API_BEARER_TOKEN`

## 3. Endpoints del backend

El backend expone:

- `GET /api/stripe/checkout`
- `POST /api/stripe/webhook`
- `GET /api/license/status`
- `GET /health`

## 4. Configurar la extension

Edita [shared/billing-config.js](/Users/juanpimienta/Documents/Visual-Studio-Code-2/Juan/Extractor_Leads_5/Extractor_Leads/shared/billing-config.js):

```js
export const BILLING_CONFIG = {
  provider: "stripe",
  stripe: {
    checkoutBaseUrl: "https://tu-backend.onrender.com/api/stripe/checkout",
    prices: {
      month: "price_1TLlWVF8JKKwNyVlwZKrskmX",
      year: "price_1TLlQSF8JKKwNyVlgw131SBL"
    }
  },
  licenseApi: {
    statusUrl: "https://tu-backend.onrender.com/api/license/status",
    bearerToken: "tu-token-interno",
    timeoutMs: 8000
  }
};
```

## 5. Configurar el webhook en Stripe

En Stripe apunta el webhook a:

- `https://tu-backend.onrender.com/api/stripe/webhook`

Eventos recomendados:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

## 6. Render

En Render crea o actualiza el `Web Service` para [billing-backend](/Users/juanpimienta/Documents/Visual-Studio-Code-2/Juan/Extractor_Leads_5/Extractor_Leads/billing-backend):

- Runtime: `Node`
- Build command: `npm install`
- Start command: `node server.js`
- Root directory: `billing-backend`

## 7. Flujo esperado

1. La extension genera un `installId`.
2. El popup abre `OPEN_CHECKOUT`.
3. El backend crea la `Checkout Session` de Stripe.
4. Stripe cobra la suscripcion.
5. El webhook marca la licencia como activa.
6. La extension consulta `/api/license/status`.
7. `userPlan` cambia a `premium`.
