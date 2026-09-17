import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConfirmOrderDto } from './dto/confirm-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { APP_STORE } from '../store/store.constants';
import { AppStore, Order } from '../store/store';

export const SERVICE_FEE_PERCENT = 10;

@Injectable()
export class OrdersService {
  constructor(@Inject(APP_STORE) private readonly store: AppStore) {}

  /**
   * Creates a pending order and holds inventory.
   */
  create(dto: CreateOrderDto): Order {
    if (dto.items.length === 0) {
      throw new BadRequestException(
        'Debes seleccionar al menos una localidad',
      );
    }

    const event = this.store.events.find((item) => item.id === dto.eventId);

    if (!event) {
      throw new NotFoundException('Evento no encontrado');
    }

    // Cantidades inválidas y ticketTypeId repetido en la misma request
    const seen = new Set<string>();
    for (const line of dto.items) {
      if (seen.has(line.ticketTypeId)) {
        throw new BadRequestException(
          `La localidad "${line.ticketTypeId}" está repetida en la orden`,
        );
      }
      seen.add(line.ticketTypeId);

      if (!Number.isInteger(line.quantity) || line.quantity < 1) {
        throw new BadRequestException(
          `La cantidad para "${line.ticketTypeId}" debe ser al menos 1`,
        );
      }
    }

    // Resolver y validar cupo/tope ANTES de descontar inventario
    const resolved = dto.items.map((line) => {
      const ticketType = event.ticketTypes.find(
        (type) => type.id === line.ticketTypeId,
      );

      if (!ticketType) {
        throw new NotFoundException(
          `Localidad "${line.ticketTypeId}" no encontrada`,
        );
      }

      if (line.quantity > ticketType.maxPerOrder) {
        throw new BadRequestException(
          `No puedes pedir más de ${ticketType.maxPerOrder} entradas de "${ticketType.name}" por orden`,
        );
      }

      if (line.quantity > ticketType.remaining) {
        throw new BadRequestException(
          `Solo quedan ${ticketType.remaining} entradas de "${ticketType.name}"`,
        );
      }

      return { ticketType, quantity: line.quantity };
    });

    // Todo validado ahora se descuenta inventario y se arma la orden
    const items = resolved.map(({ ticketType, quantity }) => {
      ticketType.remaining -= quantity;

      return {
        ticketTypeId: ticketType.id,
        name: ticketType.name,
        quantity,
        unitPriceCents: ticketType.priceCents,
        lineTotalCents: ticketType.priceCents * quantity,
      };
    });

    const subtotalCents = items.reduce(
      (sum, item) => sum + item.lineTotalCents,
      0,
    );

    const feeCents = Math.round((subtotalCents * SERVICE_FEE_PERCENT) / 100);

    const order: Order = {
      id: `ord_${randomUUID()}`,
      eventId: event.id,
      status: 'pending',
      items,
      subtotalCents,
      feeCents,
      totalCents: subtotalCents + feeCents,
      buyer: null,
      createdAt: new Date().toISOString(),
    };

    this.store.orders.set(order.id, order);
    return order;
  }

  findById(id: string): Order {
    const order = this.store.orders.get(id);

    if (!order) {
      throw new NotFoundException('Orden no encontrada');
    }

    return order;
  }

  confirm(id: string, dto: ConfirmOrderDto): Order {
    const order = this.findById(id);

    if (order.status !== 'pending') {
      throw new BadRequestException(
        `La orden ya está "${order.status}" y no se puede confirmar de nuevo`,
      );
    }

    order.status = 'confirmed';
    order.buyer = { name: dto.name, email: dto.email };
    return order;
  }
}