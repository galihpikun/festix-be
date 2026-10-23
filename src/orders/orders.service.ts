import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryAdminOrdersDto } from './dto/query-admin-orders.dto';
import { buildPaginatedResponse } from '../shared/helpers/paginate';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async createOrder(userId: string, dto: CreateOrderDto) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const fingerprint = this.computeFingerprint(dto);

    if (dto.idempotencyKey) {
      const existing = await this.prisma.order.findUnique({
        where: {
          userId_idempotencyKey: {
            userId,
            idempotencyKey: dto.idempotencyKey,
          },
        },
        include: {
          orderItems: {
            include: {
              ticketType: {
                include: {
                  event: true,
                },
              },
            },
          },
        },
      });

      if (existing) {
        if (existing.requestFingerprint !== fingerprint) {
          throw new ConflictException(
            'Idempotency key already used with a different request',
          );
        }

        if (existing.paymentUrl) {
          return {
            message: 'Order created successfully',
            order: existing,
            paymentUrl: existing.paymentUrl,
          };
        }

        if (
          existing.paymentStatus === 'FAILED' ||
          existing.paymentStatus === 'EXPIRED'
        ) {
          throw new ConflictException(
            'Previous order with this idempotency key has failed or expired. Use a new idempotency key.',
          );
        }

        return {
          message: 'Order created successfully',
          order: existing,
          paymentUrl: existing.paymentUrl,
        };
      }
    }

    const ticketTypeIds = dto.items.map((item) => item.ticketTypeId);
    const uniqueIds = [...new Set(ticketTypeIds)];
    if (uniqueIds.length !== ticketTypeIds.length) {
      throw new BadRequestException(
        'Duplicate ticket types in order items are not allowed',
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
    const orderNumber = this.generateOrderNumber(now);

    const order = await this.prisma.$transaction(async (tx) => {
      const ticketTypes = await Promise.all(
        dto.items.map((item) =>
          tx.ticketType.findUnique({
            where: { id: item.ticketTypeId },
            include: { event: true },
          }),
        ),
      );

      let eventId: string | null = null;

      for (let i = 0; i < dto.items.length; i++) {
        const ticketType = ticketTypes[i];
        const item = dto.items[i];

        if (!ticketType) {
          throw new NotFoundException(
            `Ticket type not found: ${item.ticketTypeId}`,
          );
        }

        if (eventId === null) {
          eventId = ticketType.eventId;
        } else if (ticketType.eventId !== eventId) {
          throw new BadRequestException(
            'All ticket types must belong to the same event',
          );
        }

        if (ticketType.event.status !== 'PUBLISHED') {
          throw new ConflictException(
            'Event is not available for ticket sales',
          );
        }

        if (ticketType.event.endDatetime <= now) {
          throw new ConflictException('Event has already ended');
        }
      }

      for (let i = 0; i < dto.items.length; i++) {
        const ticketType = ticketTypes[i]!;
        const item = dto.items[i];

        const reservedQuota = await tx.ticketType.updateMany({
          where: {
            id: ticketType.id,
            availableQuota: {
              gte: item.quantity,
            },
          },
          data: {
            availableQuota: {
              decrement: item.quantity,
            },
          },
        });

        if (reservedQuota.count === 0) {
          throw new ConflictException(
            `Insufficient ticket quota for: ${ticketType.name}`,
          );
        }
      }

      let totalAmount = new Prisma.Decimal(0);
      const orderItemsData = dto.items.map((item, i) => {
        const ticketType = ticketTypes[i]!;
        const lineTotal = ticketType.price.mul(item.quantity);
        totalAmount = totalAmount.add(lineTotal);
        return {
          ticketTypeId: ticketType.id,
          quantity: item.quantity,
          price: ticketType.price,
        };
      });

      return tx.order.create({
        data: {
          orderNumber,
          userId,
          totalAmount,
          paymentStatus: 'PENDING',
          expiresAt,
          idempotencyKey: dto.idempotencyKey ?? null,
          requestFingerprint: dto.idempotencyKey ? fingerprint : null,
          orderItems: {
            create: orderItemsData,
          },
        },
        include: {
          orderItems: {
            include: {
              ticketType: {
                include: {
                  event: true,
                },
              },
            },
          },
        },
      });
    });

    let paymentSession: {
      paymentSessionId: string;
      paymentUrl: string;
    };

    try {
      paymentSession = await this.paymentsService.createPaymentSession(
        order,
        user,
      );
    } catch {
      await this.cancelFailedPaymentOrder(order.id);
      throw new BadRequestException('Failed to create payment session');
    }

    try {
      const updatedOrder = await this.prisma.order.update({
        where: {
          id: order.id,
        },
        data: {
          pgTransactionId: paymentSession.paymentSessionId,
          paymentUrl: paymentSession.paymentUrl,
          paymentMethod: 'XENDIT_PAYMENT_SESSION',
        },
        include: {
          orderItems: {
            include: {
              ticketType: {
                include: {
                  event: true,
                },
              },
            },
          },
        },
      });

      return {
        message: 'Order created successfully',
        order: updatedOrder,
        paymentUrl: paymentSession.paymentUrl,
      };
    } catch {
      throw new BadRequestException('Failed to save payment session');
    }
  }

  async getOrders(userId: string) {
    return this.prisma.order.findMany({
      where: {
        userId,
      },
      include: {
        orderItems: {
          include: {
            ticketType: {
              include: {
                event: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getOrderDetail(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: {
        id: orderId,
      },
      include: {
        orderItems: {
          include: {
            ticketType: {
              include: {
                event: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.userId !== userId) {
      throw new ForbiddenException('You do not have access to this order');
    }

    return order;
  }

  async getAdminOrders(query?: QueryAdminOrdersDto) {
    const page = query?.page || 1;
    const limit = query?.limit || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {};

    if (query?.status) {
      where.paymentStatus = query.status;
    }

    if (query?.search) {
      where.OR = [
        { orderNumber: { contains: query.search, mode: 'insensitive' } },
        { user: { fullName: { contains: query.search, mode: 'insensitive' } } },
        { user: { email: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    if (query?.dateFrom || query?.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) {
        where.createdAt.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        where.createdAt.lte = new Date(query.dateTo);
      }
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          orderItems: {
            include: {
              ticketType: {
                include: {
                  event: {
                    select: {
                      id: true,
                      title: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return buildPaginatedResponse(orders, total, page, limit);
  }

  async getAdminOrderDetail(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        orderItems: {
          include: {
            ticketType: {
              include: {
                event: {
                  select: {
                    id: true,
                    title: true,
                    location: true,
                    startDatetime: true,
                    endDatetime: true,
                  },
                },
              },
            },
            issuedTickets: {
              select: {
                id: true,
                ticketCode: true,
                isRedeemed: true,
                isCancelled: true,
                redeemedAt: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  private async cancelFailedPaymentOrder(orderId: string) {
    await this.prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.updateMany({
        where: {
          id: orderId,
          paymentStatus: 'PENDING',
        },
        data: {
          paymentStatus: 'FAILED',
        },
      });

      if (updatedOrder.count === 0) {
        return;
      }

      const orderItems = await tx.orderItem.findMany({
        where: {
          orderId,
        },
      });

      for (const orderItem of orderItems) {
        await tx.ticketType.update({
          where: {
            id: orderItem.ticketTypeId,
          },
          data: {
            availableQuota: {
              increment: orderItem.quantity,
            },
          },
        });
      }
    });
  }

  private generateOrderNumber(date: Date) {
    const datePart = date.toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = randomBytes(4).toString('hex').toUpperCase();

    return `ORD-${datePart}-${randomPart}`;
  }

  private computeFingerprint(dto: CreateOrderDto): string {
    const normalized = dto.items
      .map((item) => `${item.ticketTypeId}:${item.quantity}`)
      .sort()
      .join('|');
    return createHash('sha256').update(normalized).digest('hex');
  }
}
