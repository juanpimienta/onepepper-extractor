# Publish Checklist

## Tecnico

- El popup no debe romperse aunque falle un modulo.
- El deep scan debe excluir productos, carrito, checkout y busquedas.
- `FORCE_PREMIUM_FOR_TESTS` debe quedar en `false`.
- El checkout debe abrir Stripe real, no pagos simulados.
- La extension debe sincronizar la licencia con un backend.
- Prueba minima en:
  - Shopify
  - WordPress
  - Wix
  - Web corporativa simple
  - Marketplace con deep scan desactivado

## Legal y compliance

- Publica una politica de privacidad accesible desde la ficha y la extension.
- Explica que datos procesa la extension y con que fin.
- Justifica permisos y `host_permissions`.
- Declara claramente que Premium requiere pago.
- Revisa politicas oficiales de Chrome Web Store:
  - [Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
  - [Permissions](https://developer.chrome.com/docs/webstore/program-policies/permissions)
  - [Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use/)
  - [Remote hosted code](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)

## Comercial

- Define el posicionamiento:
  - agencias
  - prospectores
  - auditorias rapidas de ecommerce
- Ajusta pricing:
  - mensual
  - anual
- Prepara landing con:
  - propuesta de valor
  - capturas
  - FAQ
  - politica de privacidad
  - contacto
- Graba una demo corta de 30-60 segundos.

## Antes del envio a tienda

- Elimina codigo muerto de PayPal y Mercado Pago si no se usara.
- Reduce permisos si consigues acotar dominios o alcance.
- Verifica que no dependes de codigo remoto ejecutable.
- Revisa copys, errores y estados vacios.
- Prueba instalacion nueva, compra nueva y renovacion/cancelacion.
