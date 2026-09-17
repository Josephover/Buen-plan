import { ApiEndpointFn } from '../../types';

export type CreateOrderBody = {
  eventId: string;
  promoCode?: string;
  items: { ticketTypeId: string; quantity: number }[];
};

export const createOrder: ApiEndpointFn<Record<string, never>, CreateOrderBody> =
  () => ({
    query: (body) => ({
      url: '/v1/orders',
      method: 'POST',
      body,
    }),
    queryKey: ['create', 'orders'],
    invalidatesQuery: () => [['events']],
  });
