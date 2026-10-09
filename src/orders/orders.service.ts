import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
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

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
    const orderNumber = this.generateOrderNumber(now);

    const order = await this.prisma.$transaction(async (tx) => {
      const ticketType = await tx.ticketType.findUnique({
        where: {
          id: dto.ticketTypeId,
        },
        include: {
          event: true,
        },
      });

      if (!ticketType) {
        throw new NotFoundException('Ticket type not found');
      }

      if (ticketType.event.status !== 'PUBLISHED') {
        throw new ConflictException('Event is not available for ticket sales');
      }

      if (ticketType.event.endDatetime <= now) {
        throw new ConflictException('Event has already ended');
      }

      const reservedQuota = await tx.ticketType.updateMany({
        where: {
          id: ticketType.id,
          availableQuota: {
            gte: dto.quantity,
          },
        },
        data: {
          availableQuota: {
            decrement: dto.quantity,
          },
        },
      });

      if (reservedQuota.count === 0) {
        throw new ConflictException('Insufficient ticket quota');
      }

      const totalAmount = ticketType.price.mul(dto.quantity);

      return tx.order.create({
        data: {
          orderNumber,
          userId,
          totalAmount,
          paymentStatus: 'PENDING',
          expiresAt,
          orderItems: {
            create: {
              ticketTypeId: ticketType.id,
              quantity: dto.quantity,
              price: ticketType.price,
            },
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
}
