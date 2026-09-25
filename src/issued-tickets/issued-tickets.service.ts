import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { IssuedTicket, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IssuedTicketsService {
  constructor(private readonly prisma: PrismaService) {}

  generateTicketCode(): string {
    const randomHex = randomBytes(4).toString('hex').toUpperCase();
    const timestampPart = Date.now().toString(36).toUpperCase().slice(-4);
    return `TCK-${timestampPart}-${randomHex}`;
  }

  async issueTicketsForOrder(orderId: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;

    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: {
          include: {
            issuedTickets: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.paymentStatus !== 'PAID') {
      throw new ConflictException('Cannot issue tickets for unpaid order');
    }

    const alreadyIssued = order.orderItems.some(
      (item) => item.issuedTickets.length > 0,
    );

    if (alreadyIssued) {
      return order.orderItems.flatMap((item) => item.issuedTickets);
    }

    const createdTickets: IssuedTicket[] = [];

    for (const item of order.orderItems) {
      for (let i = 0; i < item.quantity; i++) {
        let ticketCreated = false;
        let attempts = 0;

        while (!ticketCreated && attempts < 5) {
          attempts++;
          const ticketCode = this.generateTicketCode();

          try {
            const ticket = await db.issuedTicket.create({
              data: {
                orderItemId: item.id,
                ticketCode,
                isRedeemed: false,
                isCancelled: false,
                redeemedAt: null,
              },
            });
            createdTickets.push(ticket);
            ticketCreated = true;
          } catch (error) {
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === 'P2002' &&
              attempts < 5
            ) {
              continue;
            }
            throw error;
          }
        }

        if (!ticketCreated) {
          throw new ConflictException('Failed to generate unique ticket code');
        }
      }
    }

    return createdTickets;
  }

  async getMyTickets(userId: string) {
    return this.prisma.issuedTicket.findMany({
      where: {
        orderItem: {
          order: {
            userId,
            paymentStatus: 'PAID',
          },
        },
      },
      include: {
        orderItem: {
          include: {
            ticketType: {
              include: {
                event: true,
              },
            },
            order: {
              select: {
                id: true,
                orderNumber: true,
                createdAt: true,
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

  async getTicketDetail(userId: string, ticketId: string) {
    const ticket = await this.prisma.issuedTicket.findUnique({
      where: { id: ticketId },
      include: {
        orderItem: {
          include: {
            ticketType: {
              include: {
                event: true,
              },
            },
            order: true,
          },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (ticket.orderItem.order.userId !== userId) {
      throw new ForbiddenException('You do not have access to this ticket');
    }

    return ticket;
  }
}
