import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TicketRedemptionDto } from './dto/ticket-redemption.dto';

@Injectable()
export class TicketRedemptionService {
  constructor(private readonly prisma: PrismaService) {}

  async lookupTicket(userId: string, dto: TicketRedemptionDto) {
    const ticketCode = dto.ticketCode.trim().toUpperCase();

    const ticket = await this.prisma.issuedTicket.findUnique({
      where: { ticketCode },
      include: {
        orderItem: {
          include: {
            ticketType: {
              include: {
                event: {
                  include: {
                    staffs: {
                      where: { userId },
                    },
                  },
                },
              },
            },
            order: {
              include: {
                user: {
                  select: {
                    id: true,
                    fullName: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (ticket.orderItem.order.paymentStatus !== 'PAID') {
      throw new NotFoundException('Ticket not found');
    }

    const staffAssignment = ticket.orderItem.ticketType.event.staffs;

    if (staffAssignment.length === 0) {
      throw new ForbiddenException('You are not assigned to this event');
    }

    const event = ticket.orderItem.ticketType.event;

    return {
      id: ticket.id,
      ticketCode: ticket.ticketCode,
      isRedeemed: ticket.isRedeemed,
      isCancelled: ticket.isCancelled,
      redeemedAt: ticket.redeemedAt,
      createdAt: ticket.createdAt,
      ticketType: {
        id: ticket.orderItem.ticketType.id,
        name: ticket.orderItem.ticketType.name,
        price: ticket.orderItem.ticketType.price,
      },
      event: {
        id: event.id,
        title: event.title,
        location: event.location,
        startDatetime: event.startDatetime,
        endDatetime: event.endDatetime,
      },
      owner: ticket.orderItem.order.user,
    };
  }

  async redeemTicket(userId: string, dto: TicketRedemptionDto) {
    const ticketCode = dto.ticketCode.trim().toUpperCase();

    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.issuedTicket.findUnique({
        where: { ticketCode },
        include: {
          orderItem: {
            include: {
              ticketType: true,
              order: true,
            },
          },
        },
      });

      if (!ticket) {
        throw new NotFoundException('Ticket not found');
      }

      if (ticket.orderItem.order.paymentStatus !== 'PAID') {
        throw new NotFoundException('Ticket not found');
      }

      const eventId = ticket.orderItem.ticketType.eventId;

      const staffAssignment = await tx.eventStaff.findUnique({
        where: {
          eventId_userId: {
            eventId,
            userId,
          },
        },
      });

      if (!staffAssignment) {
        throw new ForbiddenException('You are not assigned to this event');
      }

      if (ticket.isCancelled) {
        throw new ConflictException('Ticket has been cancelled');
      }

      if (ticket.isRedeemed) {
        throw new ConflictException('Ticket has already been redeemed');
      }

      const redeemed = await tx.issuedTicket.updateMany({
        where: {
          id: ticket.id,
          isRedeemed: false,
          isCancelled: false,
        },
        data: {
          isRedeemed: true,
          redeemedAt: new Date(),
        },
      });

      if (redeemed.count === 0) {
        throw new ConflictException('Ticket has already been redeemed');
      }

      const redeemedTicket = await tx.issuedTicket.findUnique({
        where: { id: ticket.id },
        include: {
          orderItem: {
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
        message: 'Ticket redeemed successfully',
        ticket: redeemedTicket,
      };
    });
  }
}
