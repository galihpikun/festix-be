import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTicketTypeDto } from './dto/create-ticket-types.dto';
import { UpdateTicketTypeDto } from './dto/update-ticket-types.dto';

@Injectable()
export class TicketTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async getTicketTypes(eventId: string) {
    const ticketTypes = await this.prisma.ticketType.findMany({
      where: {
        eventId: eventId,
      },
    });

    if (!ticketTypes) {
      throw new NotFoundException(
        `Ticket Types with this event id is not found lol`,
      );
    }

    return ticketTypes;
  }

  async getTicketTypeDetail(ticketTypeId: string) {
    const ticketType = await this.prisma.ticketType.findUnique({
      where: {
        id: ticketTypeId,
      },
    });

    if (!ticketType) {
      throw new NotFoundException(`Ticket Type with this id does not exists`);
    }

    return ticketType;
  }

  async createTicketType(
    userId: string,
    dto: CreateTicketTypeDto,
    eventId: string,
  ) {
    const event = await this.prisma.event.findUnique({
      where: {
        id: eventId,
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.organizerId !== userId) {
      throw new ForbiddenException('You are not the organizer of this event');
    }

    const ticketType = await this.prisma.ticketType.create({
      data: {
        name: dto.name,
        price: dto.price,
        quota: dto.quota,
        availableQuota: dto.quota,
        eventId,
      },
    });

    return ticketType;
  }

  async updateTicketType(
    userId: string,
    dto: UpdateTicketTypeDto,
    ticketTypeId: string,
  ) {
    const ticketType = await this.prisma.ticketType.findUnique({
      where: {
        id: ticketTypeId,
      },
      include: {
        event: true,
      },
    });

    if (!ticketType) {
      throw new NotFoundException('Ticket type not found');
    }

    if (ticketType.event.organizerId !== userId) {
      throw new ForbiddenException('You are not the organizer of this event');
    }

    const soldQuota = ticketType.quota - ticketType.availableQuota;

    if (dto.quota !== undefined && dto.quota < soldQuota) {
      throw new BadRequestException(
        `Quota cannot be less than tickets already sold (${soldQuota})`,
      );
    }

    const availableQuota =
      dto.quota !== undefined
        ? dto.quota - soldQuota
        : ticketType.availableQuota;

    const updatedTicketType = await this.prisma.ticketType.update({
      where: {
        id: ticketTypeId,
      },
      data: {
        ...(dto.name !== undefined && {
          name: dto.name,
        }),
        ...(dto.price !== undefined && {
          price: dto.price,
        }),
        ...(dto.quota !== undefined && {
          quota: dto.quota,
          availableQuota,
        }),
      },
    });

    return updatedTicketType;
  }

  async deleteTicketType(userId: string, ticketTypeId: string) {
    const ticketType = await this.prisma.ticketType.findUnique({
      where: {
        id: ticketTypeId,
      },
      include: {
        orderItems: true,
        event: true,
      },
    });

    if (!ticketType) {
      throw new NotFoundException('Ticket type not found');
    }

    if (ticketType.event.organizerId !== userId) {
      throw new ForbiddenException('You are not the organizer of this event');
    }

    if (ticketType.orderItems.length > 0) {
      throw new ConflictException(
        'Ticket type cannot be deleted because it has orders',
      );
    }

    await this.prisma.ticketType.delete({
      where: {
        id: ticketTypeId,
      },
    });

    return {
      message: 'Ticket type deleted successfully',
    };
  }
}
