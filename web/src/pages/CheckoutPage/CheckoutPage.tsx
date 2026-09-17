import { yupResolver } from '@hookform/resolvers/yup';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router';
import * as yup from 'yup';
import {
  ConfirmOrderBody,
  CreateOrderBody,
  confirmOrder,
  createOrder,
  useApiMutation,
} from '~/api';
import { feeFromSubtotal, formatUsd } from '~/lib/money';
import { CheckoutState, Order } from '~/types';

const schema = yup.object({
  name: yup.string().trim().required('Ingresa tu nombre'),
  email: yup
    .string()
    .trim()
    .email('Ingresa un correo válido')
    .required('Ingresa tu correo'),
  promoCode: yup.string().trim().optional(),
});

type FormValues = yup.InferType<typeof schema>;

export function CheckoutPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const selection = location.state as CheckoutState | null;

  const [orderId, setOrderId] = useState<string | null>(null);
  const [buyer, setBuyer] = useState<FormValues | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: yupResolver(schema) });

  const { mutateAsync: createOrderMutate, isPending: isCreating } =
    useApiMutation<Order, Record<string, never>, CreateOrderBody>(createOrder);

  const { mutateAsync: confirmOrderMutate, isPending: isConfirming } =
    useApiMutation<Order, { id: string }, ConfirmOrderBody>(confirmOrder, {
      id: orderId ?? '',
    });

  // confirmar datos del comprador que se guarda al enviar el form
  useEffect(() => {
    if (!orderId || !buyer) return;

    let cancelled = false;

    (async () => {
      try {
        const confirmed = await confirmOrderMutate({
          name: buyer.name,
          email: buyer.email,
        });
        if (!cancelled) navigate(`/orders/${confirmed.id}`);
      } catch (err) {
        if (!cancelled) {
          setApiError(
            err instanceof Error
              ? err.message
              : 'No pudimos confirmar la orden.',
          );
          setOrderId(null);
          setBuyer(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (!selection?.items.length) {
    return <Navigate to="/" replace />;
  }

  const subtotalCents = selection.items.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0,
  );
  const promoCode = (watch('promoCode') ?? '').trim();
  const discountCents =
    promoCode === 'SAVE10' ? Math.round(subtotalCents / 10) : 0;
  const discountedSubtotalCents = subtotalCents - discountCents;
  const discountedFeeCents = feeFromSubtotal(discountedSubtotalCents);
  const totalCents = discountedSubtotalCents + discountedFeeCents;
  const isSubmitting = isCreating || isConfirming;

  //crear orden sin falla
  // si el usuario no avanza la orden queda pendiente
  const onSubmit = async (values: FormValues) => {
    setApiError(null);

    try {
      const order = await createOrderMutate({
        eventId: selection.eventId,
        promoCode: values.promoCode?.trim() || undefined,
        items: selection.items.map((item) => ({
          ticketTypeId: item.ticketTypeId,
          quantity: item.quantity,
        })),
      });
      setBuyer(values);
      setOrderId(order.id);
    } catch (err) {
      setApiError(
        err instanceof Error ? err.message : 'No pudimos crear la orden.',
      );
    }
  };

  return (
    <main className="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-[1fr_280px]">
      <section className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <h1 className="text-2xl font-semibold tracking-tight">Tus datos</h1>
        <p className="mt-2 text-sm text-ink/70">
          Completa el checkout para <strong>{selection.eventTitle}</strong>.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <div>
            <label htmlFor="name" className="text-sm font-medium">
              Nombre
            </label>
            <input
              id="name"
              type="text"
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
              {...register('name')}
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600">
                {errors.name.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="email" className="text-sm font-medium">
              Correo
            </label>
            <input
              id="email"
              type="email"
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
              {...register('email')}
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="promoCode" className="text-sm font-medium">
              Código de descuento
            </label>
            <input
              id="promoCode"
              type="text"
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
              placeholder="SAVE10"
              {...register('promoCode')}
            />
          </div>

          {apiError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {apiError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {isSubmitting ? 'Procesando…' : `Pagar ${formatUsd(totalCents)}`}
          </button>
        </form>
      </section>

      <aside className="h-max rounded-2xl bg-white p-5 ring-1 ring-black/5">
        <h2 className="font-semibold">Resumen</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {selection.items.map((item) => (
            <li key={item.ticketTypeId} className="flex justify-between">
              <span>
                {item.quantity}× {item.name}
              </span>
              <span>{formatUsd(item.unitPriceCents * item.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1 border-t border-black/10 pt-3 text-sm">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{formatUsd(subtotalCents)}</dd>
          </div>
          {discountCents > 0 && (
            <div className="flex justify-between text-green-700">
              <dt>Descuento</dt>
              <dd>-{formatUsd(discountCents)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt>Cargo por servicio</dt>
            <dd>{formatUsd(discountedFeeCents)}</dd>
          </div>
          <div className="flex justify-between font-semibold">
            <dt>Total</dt>
            <dd>{formatUsd(totalCents)}</dd>
          </div>
        </dl>
      </aside>
    </main>
  );
}