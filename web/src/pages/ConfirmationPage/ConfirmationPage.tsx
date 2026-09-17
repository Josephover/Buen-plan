import { Link, useParams } from 'react-router';
import { orderById, useApiQuery } from '~/api';
import { formatUsd } from '~/lib/money';
import { Order } from '~/types';

export function ConfirmationPage() {
  const { orderId = '' } = useParams();

  const {
    data: order,
    isPending,
    isError,
  } = useApiQuery<Order>(
    orderById,
    { id: orderId },
    { enabled: Boolean(orderId) },
  );

  if (isPending) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center text-ink/60">
        Cargando tu orden…
      </main>
    );
  }

  if (isError || !order) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <p>No encontramos esta orden.</p>
        <Link to="/" className="mt-8 inline-block text-accent">
          Volver a eventos
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-accent">
        ¡Gracias por tu compra!
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        Orden confirmada
      </h1>
      <p className="mt-2 text-sm text-ink/60">
        {order.buyer?.name} · {order.buyer?.email}
      </p>

      <ul className="mt-8 divide-y divide-black/10 rounded-2xl bg-white text-left ring-1 ring-black/5">
        {order.items.map((item) => (
          <li
            key={item.ticketTypeId}
            className="flex items-center justify-between gap-4 p-4"
          >
            <span>
              {item.quantity}× {item.name}
            </span>
            <span>{formatUsd(item.lineTotalCents)}</span>
          </li>
        ))}
      </ul>

      <dl className="mt-4 space-y-1 rounded-2xl bg-white p-4 text-sm ring-1 ring-black/5">
        <div className="flex justify-between">
          <dt>Subtotal</dt>
          <dd>{formatUsd(order.subtotalCents)}</dd>
        </div>
        {order.discountCents > 0 && (
          <div className="flex justify-between text-green-700">
            <dt>Descuento</dt>
            <dd>-{formatUsd(order.discountCents)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt>Cargo por servicio</dt>
          <dd>{formatUsd(order.feeCents)}</dd>
        </div>
        <div className="flex justify-between font-semibold">
          <dt>Total pagado</dt>
          <dd>{formatUsd(order.totalCents)}</dd>
        </div>
      </dl>

      <Link to="/" className="mt-8 inline-block text-accent">
        Volver a eventos
      </Link>
    </main>
  );
}