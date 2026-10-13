import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AssignStaffDto } from './dto/assign-staff.dto';
import { QueryStaffDto } from './dto/query-staff.dto';
import { buildPaginatedResponse } from '../shared/helpers/paginate';
import { Prisma, Role } from '../../generated/prisma/client';

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async getAssignedEvents(userId: string) {
    const assignments = await this.prisma.eventStaff.findMany({
      where: { userId },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            coverImageUrl: true,
            status: true,
            location: true,
            startDatetime: true,
            endDatetime: true,
          },
        },
      },
      orderBy: {
        event: {
          startDatetime: 'asc',
        },
      },
    });

    const eventIds = assignments.map((assignment) => assignment.event.id);

    if (eventIds.length === 0) {
      return [];
    }

    const countsByEventId = new Map<
      string,
      { totalParticipants: number; totalRedeemed: number }
    >();

    await Promise.all(
      eventIds.map(async (eventId) => {
        const [totalParticipants, totalRedeemed] = await Promise.all([
          this.prisma.issuedTicket.count({
            where: {
              isCancelled: false,
              orderItem: {
                ticketType: { eventId },
                order: { paymentStatus: 'PAID' },
              },
            },
          }),
          this.prisma.issuedTicket.count({
            where: {
              isCancelled: false,
              isRedeemed: true,
              orderItem: {
                ticketType: { eventId },
                order: { paymentStatus: 'PAID' },
              },
            },
          }),
        ]);
        countsByEventId.set(eventId, { totalParticipants, totalRedeemed });
      }),
    );

    const now = new Date();

    return assignments.map((assignment) => {
      const event = assignment.event;
      const counts = countsByEventId.get(event.id) ?? {
        totalParticipants: 0,
        totalRedeemed: 0,
      };

      const isActive =
        event.status === 'PUBLISHED' &&
        now >= event.startDatetime &&
        now <= event.endDatetime;

      return {
        id: event.id,
        title: event.title,
        coverImageUrl: event.coverImageUrl,
        status: event.status,
        location: event.location,
        startDatetime: event.startDatetime,
        endDatetime: event.endDatetime,
        isActive,
        assignedAt: assignment.createdAt,
        participantSummary: counts,
      };
    });
  }

  async getEventDashboard(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        location: true,
        status: true,
        startDatetime: true,
        endDatetime: true,
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const staffAssignment = await this.prisma.eventStaff.findUnique({
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

    const [totalValid, totalRedeemed, recentRedemptions] = await Promise.all([
      this.prisma.issuedTicket.count({
        where: {
          isCancelled: false,
          orderItem: {
            ticketType: { eventId },
            order: { paymentStatus: 'PAID' },
          },
        },
      }),
      this.prisma.issuedTicket.count({
        where: {
          isCancelled: false,
          isRedeemed: true,
          orderItem: {
            ticketType: { eventId },
            order: { paymentStatus: 'PAID' },
          },
        },
      }),
      this.prisma.issuedTicket.findMany({
        where: {
          isCancelled: false,
          isRedeemed: true,
          orderItem: {
            ticketType: { eventId },
            order: { paymentStatus: 'PAID' },
          },
        },
        select: {
          id: true,
          ticketCode: true,
          redeemedAt: true,
          orderItem: {
            select: {
              ticketType: {
                select: {
                  name: true,
                },
              },
              order: {
                select: {
                  user: {
                    select: {
                      fullName: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: {
          redeemedAt: 'desc',
        },
        take: 5,
      }),
    ]);

    const remainingTickets = Math.max(0, totalValid - totalRedeemed);
    const redemptionRate =
      totalValid > 0
        ? Number(((totalRedeemed / totalValid) * 100).toFixed(2))
        : 0;

    const now = new Date();
    const isActive =
      event.status === 'PUBLISHED' &&
      now >= event.startDatetime &&
      now <= event.endDatetime;

    return {
      event: {
        id: event.id,
        title: event.title,
        status: event.status,
        location: event.location,
        startDatetime: event.startDatetime,
        endDatetime: event.endDatetime,
        isActive,
      },
      statistics: {
        totalParticipants: totalValid,
        totalRedeemed,
        remainingTickets,
        redemptionRate,
      },
      recentRedemptions: recentRedemptions.map((ticket) => ({
        id: ticket.id,
        ticketCode: ticket.ticketCode,
        ticketType: ticket.orderItem.ticketType.name,
        buyerName: ticket.orderItem.order.user.fullName,
        redeemedAt: ticket.redeemedAt,
      })),
    };
  }

  async findAllStaff(query?: QueryStaffDto) {
    const page = query?.page || 1;
    const limit = query?.limit || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      role: Role.STAFF,
    };

    if (query?.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [staffUsers, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          fullName: true,
          avatar: true,
          role: true,
          emailVerified: true,
          isSuspended: true,
          createdAt: true,
          _count: {
            select: {
              assignedEvents: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return buildPaginatedResponse(staffUsers, total, page, limit);
  }

  async findStaffDetail(userId: string) {
    const staff = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatar: true,
        role: true,
        emailVerified: true,
        isSuspended: true,
        createdAt: true,
        assignedEvents: {
          include: {
            event: {
              select: {
                id: true,
                title: true,
                location: true,
                startDatetime: true,
                endDatetime: true,
                status: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!staff) {
      throw new NotFoundException('Staff user not found');
    }

    if (staff.role !== Role.STAFF) {
      throw new BadRequestException('User does not have the STAFF role');
    }

    return staff;
  }

  async getStaffForEvent(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return this.prisma.eventStaff.findMany({
      where: { eventId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async assignStaff(dto: AssignStaffDto, actorId?: string) {
    // 1. Verify user exists and has STAFF role
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role !== Role.STAFF) {
      throw new BadRequestException(
        'User must have the STAFF role to be assigned to events',
      );
    }

    if (user.isSuspended) {
      throw new BadRequestException('Cannot assign a suspended staff member');
    }

    // 2. Verify event exists
    const event = await this.prisma.event.findUnique({
      where: { id: dto.eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // 3. Check for existing assignment
    const existing = await this.prisma.eventStaff.findUnique({
      where: {
        eventId_userId: {
          eventId: dto.eventId,
          userId: dto.userId,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        'Staff member is already assigned to this event',
      );
    }

    // 4. Create assignment in transaction with audit log
    const assignment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.eventStaff.create({
        data: {
          eventId: dto.eventId,
          userId: dto.userId,
        },
        include: {
          event: {
            select: { id: true, title: true },
          },
          user: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });

      await this.auditLogs.log(
        actorId ?? null,
        'ASSIGN_STAFF',
        'EventStaff',
        created.id,
        {
          eventId: dto.eventId,
          eventTitle: event.title,
          userId: dto.userId,
          staffName: user.fullName,
        },
        tx,
      );

      return created;
    });

    return {
      message: 'Staff assigned to event successfully',
      assignment,
    };
  }

  async removeAssignment(assignmentId: string, actorId?: string) {
    const assignment = await this.prisma.eventStaff.findUnique({
      where: { id: assignmentId },
      include: {
        event: { select: { title: true } },
        user: { select: { fullName: true } },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Staff assignment not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.eventStaff.delete({
        where: { id: assignmentId },
      });

      await this.auditLogs.log(
        actorId ?? null,
        'REMOVE_STAFF',
        'EventStaff',
        assignmentId,
        {
          eventId: assignment.eventId,
          eventTitle: assignment.event.title,
          userId: assignment.userId,
          staffName: assignment.user.fullName,
        },
        tx,
      );
    });

    return {
      message: 'Staff assignment removed successfully',
    };
  }
}
