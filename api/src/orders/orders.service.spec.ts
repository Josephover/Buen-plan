import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createStore } from '../store/store';
import { APP_STORE } from '../store/store.constants';
import { OrdersService, SERVICE_FEE_PERCENT } from './orders.service';

describe('OrdersService', () => {
  let service: OrdersService;
  let store: ReturnType<typeof createStore>;

  beforeEach(async () => {
    store = createStore();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: APP_STORE, useValue: store },
      ],
    }).compile();

    service = module.get(OrdersService);
  });

  describe('create', () => {
    it('creates a pending order with subtotal, 10% fee, and total in cents', () => {
      const order = service.create({
        eventId: 'noche-salsa',
        items: [{ ticketTypeId: 'salsa-general', quantity: 2 }],
      });

      expect(order.status).toBe('pending');
      expect(order.buyer).toBeNull();
      expect(order.items).toEqual([
        {
          ticketTypeId: 'salsa-general',
          name: 'General',
          quantity: 2,
          unitPriceCents: 2500,
          lineTotalCents: 5000,
        },
      ]);
      expect(order.subtotalCents).toBe(5000);
      expect(order.discountCents).toBe(0);
      expect(order.feeCents).toBe(Math.round((5000 * SERVICE_FEE_PERCENT) / 100));
      expect(order.totalCents).toBe(order.subtotalCents + order.feeCents);
      expect(order.feeCents).toBe(500);
    });

    it('applies SAVE10 before calculating the service fee', () => {
      const order = service.create({
        eventId: 'noche-salsa',
        promoCode: 'SAVE10',
        items: [{ ticketTypeId: 'salsa-general', quantity: 2 }],
      });

      expect(order.subtotalCents).toBe(5000);
      expect(order.discountCents).toBe(500);
      expect(order.feeCents).toBe(450);
      expect(order.totalCents).toBe(4950);
    });

    it('computes the 10% fee with integer math (not floating-point prices)', () => {
      const order = service.create({
        eventId: 'standup-uio',
        items: [{ ticketTypeId: 'standup-mesa', quantity: 1 }],
      });

      expect(order.subtotalCents).toBe(1800);
      expect(order.feeCents).toBe(Math.round((1800 * SERVICE_FEE_PERCENT) / 100));
      expect(order.totalCents).toBe(1980);
    });

    it('decrements remaining inventory', () => {
      service.create({
        eventId: 'noche-salsa',
        items: [{ ticketTypeId: 'salsa-vip', quantity: 2 }],
      });

      const vip = store.events
        .find((event) => event.id === 'noche-salsa')
        ?.ticketTypes.find((type) => type.id === 'salsa-vip');

      expect(vip?.remaining).toBe(6);
    });

    it('rejects when a ticket type is sold out', () => {
      expect(() =>
        service.create({
          eventId: 'indie-fest',
          items: [{ ticketTypeId: 'indie-early', quantity: 1 }],
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects when quantity exceeds remaining', () => {
      expect(() =>
        service.create({
          eventId: 'noche-salsa',
          items: [{ ticketTypeId: 'salsa-vip', quantity: 9 }],
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects when quantity exceeds maxPerOrder', () => {
      expect(() =>
        service.create({
          eventId: 'noche-salsa',
          items: [{ ticketTypeId: 'salsa-vip', quantity: 3 }],
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects unknown events', () => {
      expect(() =>
        service.create({
          eventId: 'missing',
          items: [{ ticketTypeId: 'salsa-general', quantity: 1 }],
        }),
      ).toThrow(NotFoundException);
    });

    it('rejects unknown ticket types', () => {
      expect(() =>
        service.create({
          eventId: 'noche-salsa',
          items: [{ ticketTypeId: 'nope', quantity: 1 }],
        }),
      ).toThrow(NotFoundException);
    });

    it('rejects empty items', () => {
      expect(() =>
        service.create({
          eventId: 'noche-salsa',
          items: [],
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects duplicate ticketTypeId values', () => {
      expect(() =>
        service.create({
          eventId: 'noche-salsa',
          items: [
            { ticketTypeId: 'salsa-general', quantity: 1 },
            { ticketTypeId: 'salsa-general', quantity: 2 },
          ],
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('confirm', () => {
    it('marks a pending order as confirmed and stores the buyer', () => {
      const pending = service.create({
        eventId: 'standup-uio',
        items: [{ ticketTypeId: 'standup-mesa', quantity: 1 }],
      });

      const confirmed = service.confirm(pending.id, {
        name: 'Ana Pérez',
        email: 'ana@example.com',
      });

      expect(confirmed.status).toBe('confirmed');
      expect(confirmed.buyer).toEqual({
        name: 'Ana Pérez',
        email: 'ana@example.com',
      });
    });

    it('rejects unknown orders', () => {
      expect(() =>
        service.confirm('ord_missing', {
          name: 'Ana Pérez',
          email: 'ana@example.com',
        }),
      ).toThrow(NotFoundException);
    });

    it('rejects already confirmed orders', () => {
      const pending = service.create({
        eventId: 'standup-uio',
        items: [{ ticketTypeId: 'standup-mesa', quantity: 1 }],
      });

      service.confirm(pending.id, {
        name: 'Ana Pérez',
        email: 'ana@example.com',
      });

      expect(() =>
        service.confirm(pending.id, {
          name: 'Otra Persona',
          email: 'otra@example.com',
        }),
      ).toThrow(BadRequestException);
    });
  });
});
