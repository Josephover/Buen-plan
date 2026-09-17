# NOTES
- Las fotos de que hora comence y acabe estan en la raiz del proyecto en la carpeta `fotos`.
## Qué hice

### Backend (`api/src/orders/orders.service.ts`)

- **Validación de duplicados**: se rechaza con `400` si el mismo `ticketTypeId` aparece más de una vez en `items`.
- **Validación de cantidad**: se rechaza con `400` si `quantity` no es un entero positivo.
- **Validación de cupo**: se rechaza con `400` si `quantity` excede `remaining` o `maxPerOrder` de esa localidad.
- **Orden de validación antes de mutar estado**: primero se valida *todo* el conjunto de líneas (duplicados, cantidad, existencia, remaining, maxPerOrder) y solo después de que todas pasan se descuenta `remaining`. Evita dejar el inventario en un estado inconsistente si una línea falla a mitad de camino.
- **Cálculo del cargo por servicio**: `feeCents = Math.round(subtotalCents * SERVICE_FEE_PERCENT / 100)`, en enteros (centavos), sin floats.
- **Confirmación de orden**: se rechaza con `400` si la orden ya no está `pending` (evita doble confirmación).
- Los 14 tests de `orders.service.spec.ts` pasan.

### Frontend

- **`CheckoutPage`**: formulario de nombre/correo con `react-hook-form` + `yup` (vía `@hookform/resolvers`), resumen de compra (localidades, descuento si aplica, cargo del 10%, total) antes de pagar, y manejo de estado de envío (`Procesando…`) y de errores de la API (se muestran en rojo bajo el formulario, sin redirigir).
- **Flujo de pago en dos fases**: al enviar el formulario se crea la orden (`createOrder`); una vez creada, un efecto dispara la confirmación (`confirmOrder`) con los datos del comprador. Se hizo así porque `confirmOrder` necesita el `id` de una orden que no existe hasta que `createOrder` responde, y `useApiMutation` arma el endpoint con los `Args` del render, no en el momento de invocar `mutate`.
- **`ConfirmationPage`**: carga la orden confirmada con `useApiQuery(orderById, { id: orderId })`, muestra localidades, comprador, descuento aplicado (si lo hubo) y totales. Sobrevive a un refresh de página (F5) porque no depende de estado en memoria, solo de la URL.
- Se agregó `@hookform/resolvers` como única dependencia nueva (puente estándar entre `react-hook-form` y `yup`).

### Extra elegido: código de descuento `SAVE10`

- Campo opcional `promoCode` en `CreateOrderDto`.
- Si el código es exactamente `SAVE10`, se aplica 10% de descuento sobre `subtotalCents`.
- El cargo por servicio se calcula sobre el **subtotal ya descontado**, tal como pedía el enunciado.
- Código inválido o vacío → `discountCents: 0`, comportamiento idéntico al original.
- Input de texto en `CheckoutPage` para ingresar el código, con preview local del descuento antes de enviar; la fuente de verdad del cálculo sigue siendo la respuesta del backend.
- `ConfirmationPage` también muestra la línea de descuento cuando la orden confirmada tiene `discountCents > 0`.
- Test en `orders.service.spec.ts` cubriendo el código válido.

## Qué probé manualmente


- Flujo feliz completo: elegir entradas → checkout → confirmación → refrescar la página de confirmación.
- El `remaining` de una localidad baja después de comprar y se refleja en el listado/detalle del evento.
- Validación de formulario vacío (nombre/correo) bloquea el envío sin tocar la API.
- Caso de "se agotó mientras alguien está en checkout": con dos pestañas, dejé una en el checkout con cantidad seleccionada mientras en otra agotaba esa misma localidad. Al confirmar en la primera, la API respondió `400` ("Solo quedan 0 entradas de...") y el frontend lo mostró correctamente sin redirigir. Esto confirma que el diseño ya cubre ese caso del "Extra" sin necesidad de código adicional.
- `SAVE10` de punta a punta: subtotal $160.00 → descuento $16.00 → cargo $14.40 (10% sobre $144.00) → total $158.40, verificado tanto en el preview del checkout como en la confirmación final tras el pago.
- Código inválido/vacío: sin cambios en el cálculo, comportamiento idéntico al original.

## Qué no me alcanzó / qué dejé fuera

- No implementé los otros dos puntos del "Extra" (expiración de reserva a 15 minutos) — el enunciado pedía como máximo uno y elegí `SAVE10`.
- No agregué tests automatizados de frontend (unitarios ni e2e). Toda la validación del frontend fue manual.
- No hay manejo de reintento explícito en el checkout cuando la API rechaza por agotado — el usuario ve el error pero tiene que volver atrás y ajustar cantidades manualmente; no hay un botón "ajustar cantidad" ni refetch automático del evento desde esa pantalla.

## Qué haría distinto con más tiempo

- Agregaría un test de integración (o al menos unitario) para `CheckoutPage` que cubra el camino feliz y el camino de error (agotado), en vez de haberlo validado solo a mano.
- En el checkout, si la API rechaza por inventario insuficiente, mostraría un link/botón para volver al detalle del evento con la cantidad ya ajustada al `remaining` actual, en vez de solo mostrar el mensaje de error.
- Extraería la lógica de "crear y luego confirmar" del componente a un hook propio (ej. `useCreateAndConfirmOrder`) para separar la lógica de negocio del JSX y facilitar testearla de forma aislada.
- Si hubiera necesitado el punto 1 del Extra (reserva de 15 minutos), habría agregado un `expiresAt` a la orden `pending` y una revisión perezosa en `findById`/`confirm` que libere `remaining` si se pasó el tiempo sin confirmar.