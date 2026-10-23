import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { QueryAdminEventsDto } from './dto/query-admin-events.dto';
import { QueryOrganizerEventsDto } from './dto/query-organizer-events.dto';
import { SearchInvitableUsersDto } from './dto/search-invitable-users.dto';
import { buildPaginatedResponse } from '../shared/helpers/paginate';
import { Prisma, Role } from '../../generated/prisma/client';

type UploadedFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async getEvents() {
    return await this.prisma.event.findMany({
      where: {
        status: 'PUBLISHED',
      },
      include: {
        category: true,
        ticketTypes: true,
      },
      orderBy: {
        startDatetime: 'asc',
      },
    });
  }

  async getMostPopularEvents() {
    return await this.prisma.event.findMany({
      where: {
        status: 'PUBLISHED',
      },
      include: {
        category: true,
        ticketTypes: true,
      },
      orderBy: {
        ticketTypes: {
          _count: 'desc',
        },
      },
    });
  }

  async getAdminEvents(query?: QueryAdminEventsDto) {
    const page = query?.page || 1;
    const limit = query?.limit || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.EventWhereInput = {};

    if (query?.status) {
      where.status = query.status;
    }

    if (query?.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query?.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { location: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        include: {
          category: true,
          organizer: {
            select: {
              id: true,
              email: true,
              fullName: true,
              organizerProfile: {
                select: {
                  id: true,
                  organizationName: true,
                  status: true,
                },
              },
            },
          },
          ticketTypes: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.event.count({ where }),
    ]);

    return buildPaginatedResponse(events, total, page, limit);
  }

  async eventDetail(id: string, includeNonPublished = false) {
    const event = await this.prisma.event.findFirst({
      where: {
        id,
        ...(includeNonPublished ? {} : { status: 'PUBLISHED' }),
      },
      include: {
        category: true,
        organizer: {
          select: {
            id: true,
            fullName: true,
            organizerProfile: {
              select: {
                organizationName: true,
              },
            },
          },
        },
        ticketTypes: true,
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return event;
  }

  async createEvent(
    userId: string,
    dto: CreateEventDto,
    files: {
      coverImage?: UploadedFile[];
      venueImage?: UploadedFile[];
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        organizerProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.organizerProfile) {
      throw new ForbiddenException('You do not have an organizer profile');
    }

    if (user.organizerProfile.status !== 'APPROVED') {
      throw new ForbiddenException(
        'Your organizer account has not been approved',
      );
    }

    if (!files.coverImage?.length) {
      throw new BadRequestException('Cover image is required');
    }

    const coverImage = files.coverImage?.[0];
    const venueImage = files.venueImage?.[0];

    const images = [coverImage, venueImage].filter(
      (file): file is UploadedFile => !!file,
    );

    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

    for (const file of images) {
      const extension = file.originalname
        .substring(file.originalname.lastIndexOf('.'))
        .toLowerCase();

      if (!allowedExtensions.includes(extension)) {
        throw new BadRequestException(
          `Invalid image type: ${file.originalname}`,
        );
      }
    }

    const maxFileSize = 5 * 1024 * 1024;

    for (const file of images) {
      if (file.size > maxFileSize) {
        throw new BadRequestException(`File ${file.originalname} exceeds 5 MB`);
      }
    }

    const startDatetime = new Date(dto.startDatetime);
    const endDatetime = new Date(dto.endDatetime);

    if (isNaN(startDatetime.getTime())) {
      throw new BadRequestException('Invalid start datetime');
    }

    if (isNaN(endDatetime.getTime())) {
      throw new BadRequestException('Invalid end datetime');
    }

    if (startDatetime >= endDatetime) {
      throw new BadRequestException(
        'End datetime must be after start datetime',
      );
    }

    const category = await this.prisma.category.findUnique({
      where: {
        id: dto.categoryId,
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const coverUpload = await this.cloudinary.uploadImage(coverImage);

    const venueUpload = venueImage
      ? await this.cloudinary.uploadImage(venueImage)
      : null;

    const uniqueInvitedIds = dto.invitedUserIds
      ? [...new Set(dto.invitedUserIds)]
      : [];

    if (uniqueInvitedIds.length > 0) {
      if (uniqueInvitedIds.includes(userId)) {
        throw new BadRequestException('You cannot invite yourself as staff');
      }

      const invitedUsers = await this.prisma.user.findMany({
        where: { id: { in: uniqueInvitedIds } },
        select: {
          id: true,
          emailVerified: true,
          isSuspended: true,
          role: true,
        },
      });

      const foundIds = new Set(invitedUsers.map((u) => u.id));
      const missingIds = uniqueInvitedIds.filter((id) => !foundIds.has(id));

      if (missingIds.length > 0) {
        throw new BadRequestException(
          `Users not found: ${missingIds.join(', ')}`,
        );
      }

      const errors: string[] = [];

      for (const u of invitedUsers) {
        if (!u.emailVerified) {
          errors.push(`User ${u.id} has not verified their email`);
        }
        if (u.isSuspended) {
          errors.push(`User ${u.id} is suspended`);
        }
        if (u.role === Role.ADMIN) {
          errors.push(
            `User ${u.id} is an admin and cannot be invited as staff`,
          );
        }
      }

      if (errors.length > 0) {
        throw new BadRequestException(errors);
      }
    }

    const event = await this.prisma.$transaction(async (tx) => {
      const created = await tx.event.create({
        data: {
          organizerId: userId,
          categoryId: dto.categoryId,
          title: dto.title,
          description: dto.description,
          location: dto.location,
          coverImageUrl: coverUpload.secure_url,
          coverImageId: coverUpload.public_id,
          venueImageUrl: venueUpload?.secure_url,
          venueImageId: venueUpload?.public_id,
          startDatetime,
          endDatetime,
          isRefundable: dto.isRefundable ?? true,
          status: 'DRAFT',
        },
      });

      if (uniqueInvitedIds.length > 0) {
        await tx.staffInvitation.createMany({
          data: uniqueInvitedIds.map((inviteeId) => ({
            eventId: created.id,
            userId: inviteeId,
          })),
        });
      }

      return created;
    });

    return {
      message: 'Event created successfully',
      event,
    };
  }

  async updateEvent(
    userId: string,
    eventId: string,
    dto: UpdateEventDto,
    files: {
      coverImage?: UploadedFile[];
      venueImage?: UploadedFile[];
    },
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
      throw new ForbiddenException('You are not the owner of this event');
    }

    if (event.status !== 'DRAFT' && event.status !== 'REJECTED') {
      throw new ConflictException(
        'Only draft or rejected events can be updated',
      );
    }

    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: {
          id: dto.categoryId,
        },
      });

      if (!category) {
        throw new NotFoundException('Category not found');
      }
    }

    const startDatetime = dto.startDatetime
      ? new Date(dto.startDatetime)
      : event.startDatetime;

    const endDatetime = dto.endDatetime
      ? new Date(dto.endDatetime)
      : event.endDatetime;

    if (isNaN(startDatetime.getTime()) || isNaN(endDatetime.getTime())) {
      throw new BadRequestException('Invalid datetime');
    }

    if (startDatetime >= endDatetime) {
      throw new BadRequestException(
        'End datetime must be after start datetime',
      );
    }

    const coverImage = files.coverImage?.[0];
    const venueImage = files.venueImage?.[0];

    const images = [coverImage, venueImage].filter(
      (file): file is UploadedFile => !!file,
    );

    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

    for (const file of images) {
      const extension = file.originalname
        .substring(file.originalname.lastIndexOf('.'))
        .toLowerCase();

      if (!allowedExtensions.includes(extension)) {
        throw new BadRequestException(
          `Invalid image type: ${file.originalname}`,
        );
      }
    }

    const maxFileSize = 5 * 1024 * 1024;

    for (const file of images) {
      if (file.size > maxFileSize) {
        throw new BadRequestException(`File ${file.originalname} exceeds 5 MB`);
      }
    }

    let coverUpload;

    if (coverImage) {
      coverUpload = await this.cloudinary.uploadImage(coverImage);
    }

    let venueUpload;

    if (venueImage) {
      venueUpload = await this.cloudinary.uploadImage(venueImage);
    }

    const updatedEvent = await this.prisma.event.update({
      where: {
        id: eventId,
      },
      data: {
        ...(dto.title !== undefined && {
          title: dto.title,
        }),

        ...(dto.description !== undefined && {
          description: dto.description,
        }),

        ...(dto.location !== undefined && {
          location: dto.location,
        }),

        ...(dto.categoryId !== undefined && {
          categoryId: dto.categoryId,
        }),

        ...(dto.startDatetime !== undefined && {
          startDatetime,
        }),

        ...(dto.endDatetime !== undefined && {
          endDatetime,
        }),

        ...(dto.isRefundable !== undefined && {
          isRefundable: dto.isRefundable,
        }),

        ...(coverUpload && {
          coverImageUrl: coverUpload.secure_url,
          coverImageId: coverUpload.public_id,
        }),

        ...(venueUpload && {
          venueImageUrl: venueUpload.secure_url,
          venueImageId: venueUpload.public_id,
        }),

        ...(event.status === 'REJECTED' && {
          rejectionReason: null,
        }),
      },
    });

    return {
      message: 'Event updated successfully',
      event: updatedEvent,
    };
  }

  async submitEvent(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: {
        id: eventId,
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.organizerId !== userId) {
      throw new ForbiddenException('You are not the owner of this event');
    }

    if (event.status !== 'DRAFT' && event.status !== 'REJECTED') {
      throw new ConflictException(
        'Only draft or rejected events can be submitted',
      );
    }

    const updatedEvent = await this.prisma.event.update({
      where: {
        id: eventId,
      },
      data: {
        status: 'PENDING_REVIEW',
        rejectionReason: null,
      },
    });

    return {
      message: 'Event submitted for review',
      event: updatedEvent,
    };
  }

  async approveEvent(eventId: string, actorId?: string) {
    const updatedEvent = await this.prisma.$transaction(
      async (tx) => {
        const event = await tx.event.findUnique({
          where: { id: eventId },
          include: {
            organizer: {
              include: {
                organizerProfile: true,
              },
            },
            ticketTypes: true,
            staffInvitations: {
              where: { activated: false },
              include: {
                user: {
                  select: {
                    id: true,
                    role: true,
                    emailVerified: true,
                    isSuspended: true,
                  },
                },
              },
            },
          },
        });

        if (!event) {
          throw new NotFoundException('Event not found');
        }

        if (
          !event.organizer.organizerProfile ||
          event.organizer.organizerProfile.status !== 'APPROVED'
        ) {
          throw new ConflictException('Organizer is not approved');
        }

        if (event.ticketTypes.length === 0) {
          throw new ConflictException(
            'EVent Must atleast have one ticket type before approval',
          );
        }

        const published = await tx.event.updateMany({
          where: {
            id: eventId,
            status: 'PENDING_REVIEW',
          },
          data: {
            status: 'PUBLISHED',
            rejectionReason: null,
          },
        });

        if (published.count === 0) {
          throw new ConflictException(
            'Only events pending review can be approved',
          );
        }

        for (const invitation of event.staffInvitations) {
          const user = invitation.user;

          if (
            !user.emailVerified ||
            user.isSuspended ||
            user.role === Role.ADMIN
          ) {
            continue;
          }

          if (user.role === Role.USER) {
            const promoted = await tx.user.updateMany({
              where: {
                id: user.id,
                role: Role.USER,
                emailVerified: true,
                isSuspended: false,
              },
              data: { role: Role.STAFF },
            });

            if (promoted.count === 0) {
              continue;
            }
          }

          await tx.eventStaff.upsert({
            where: {
              eventId_userId: {
                eventId,
                userId: user.id,
              },
            },
            create: {
              eventId,
              userId: user.id,
            },
            update: {},
          });

          await tx.staffInvitation.updateMany({
            where: {
              id: invitation.id,
              activated: false,
            },
            data: { activated: true },
          });
        }

        await this.auditLogs.log(
          actorId ?? null,
          'APPROVE',
          'Event',
          eventId,
          {
            title: event.title,
            previousStatus: event.status,
            staffInvitationsProcessed: event.staffInvitations.length,
          },
          tx,
        );

        return tx.event.findUniqueOrThrow({
          where: { id: eventId },
          include: {
            category: true,
            organizer: {
              select: {
                id: true,
                fullName: true,
                organizerProfile: {
                  select: {
                    organizationName: true,
                  },
                },
              },
            },
            ticketTypes: true,
            staffs: {
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
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return {
      message: 'Event approved successfully',
      event: updatedEvent,
    };
  }

  async rejectEvent(eventId: string, reason: string, actorId?: string) {
    if (!reason || !reason.trim()) {
      throw new BadRequestException('Rejection reason is required');
    }

    const event = await this.prisma.event.findUnique({
      where: {
        id: eventId,
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.status !== 'PENDING_REVIEW') {
      throw new ConflictException('Only events pending review can be rejected');
    }

    const updatedEvent = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.event.update({
        where: {
          id: eventId,
        },
        data: {
          status: 'REJECTED',
          rejectionReason: reason.trim(),
        },
        include: {
          category: true,
          organizer: {
            select: {
              id: true,
              fullName: true,
              organizerProfile: {
                select: {
                  organizationName: true,
                },
              },
            },
          },
          ticketTypes: true,
          staffs: {
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
      });

      await this.auditLogs.log(
        actorId ?? null,
        'REJECT',
        'Event',
        eventId,
        { title: event.title, reason: reason.trim() },
        tx,
      );

      return updated;
    });

    return {
      message: 'Event rejected successfully',
      event: updatedEvent,
    };
  }

  async cancelEvent(eventId: string, reason: string, actorId?: string) {
    if (!reason || !reason.trim()) {
      throw new BadRequestException('Cancellation reason is required');
    }

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        ticketTypes: {
          include: {
            orderItems: {
              include: {
                order: true,
              },
            },
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.status !== 'PUBLISHED' && event.status !== 'PENDING_REVIEW') {
      throw new ConflictException(
        'Only published or pending review events can be cancelled',
      );
    }

    // Check if there are any PAID orders associated with this event
    const paidOrders = event.ticketTypes.flatMap((tt) =>
      tt.orderItems
        .filter((oi) => oi.order.paymentStatus === 'PAID')
        .map((oi) => oi.order),
    );

    if (paidOrders.length > 0) {
      throw new ConflictException(
        `Cannot cancel event with ${paidOrders.length} existing paid order(s). Refund operations are required first.`,
      );
    }

    const updatedEvent = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.event.update({
        where: { id: eventId },
        data: {
          status: 'CANCELLED',
          rejectionReason: reason.trim(),
        },
        include: {
          category: true,
          organizer: {
            select: {
              id: true,
              fullName: true,
              organizerProfile: {
                select: {
                  organizationName: true,
                },
              },
            },
          },
          ticketTypes: true,
          staffs: {
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
      });

      await this.auditLogs.log(
        actorId ?? null,
        'CANCEL',
        'Event',
        eventId,
        {
          title: event.title,
          reason: reason.trim(),
          previousStatus: event.status,
        },
        tx,
      );

      return updated;
    });

    return {
      message: 'Event cancelled successfully',
      event: updatedEvent,
    };
  }

  async searchInvitableUsers(
    query: SearchInvitableUsersDto,
    organizerId: string,
  ) {
    const organizer = await this.prisma.user.findUnique({
      where: { id: organizerId },
      include: { organizerProfile: true },
    });

    if (!organizer?.organizerProfile) {
      throw new ForbiddenException('You do not have an organizer profile');
    }

    if (
      organizer.isSuspended ||
      organizer.organizerProfile.status !== 'APPROVED'
    ) {
      throw new ForbiddenException(
        'Your organizer account has not been approved',
      );
    }

    const page = query.page || 1;
    const limit = Math.min(query.limit || 10, 20);
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      emailVerified: true,
      isSuspended: false,
      role: { not: Role.ADMIN },
      id: { not: organizerId },
      OR: [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ],
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          fullName: true,
          avatar: true,
          role: true,
        },
        orderBy: { fullName: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return buildPaginatedResponse(users, total, page, limit);
  }

  async getMyEvents(userId: string, query?: QueryOrganizerEventsDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organizerProfile: true },
    });

    if (
      !user?.organizerProfile ||
      user.organizerProfile.status !== 'APPROVED'
    ) {
      throw new ForbiddenException(
        'Your organizer account has not been approved',
      );
    }

    const page = query?.page || 1;
    const limit = query?.limit || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.EventWhereInput = {
      organizerId: userId,
    };

    if (query?.status) {
      where.status = query.status;
    }

    if (query?.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query?.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { location: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        include: {
          category: true,
          ticketTypes: true,
          _count: {
            select: {
              staffs: true,
              staffInvitations: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.event.count({ where }),
    ]);

    return buildPaginatedResponse(events, total, page, limit);
  }

  async getOrganizerEventDetail(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        category: true,
        ticketTypes: true,
        staffs: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                avatar: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        staffInvitations: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                avatar: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.organizerId !== userId) {
      throw new ForbiddenException('You are not the owner of this event');
    }

    return event;
  }

  async getOrganizerEventCheckin(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        status: true,
        startDatetime: true,
        endDatetime: true,
        organizerId: true,
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.organizerId !== userId) {
      throw new ForbiddenException('You are not the owner of this event');
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
              ticketType: { select: { name: true } },
              order: { select: { user: { select: { fullName: true } } } },
            },
          },
        },
        orderBy: { redeemedAt: 'desc' },
        take: 20,
      }),
    ]);

    const remainingTickets = Math.max(0, totalValid - totalRedeemed);
    const redemptionRate =
      totalValid > 0
        ? Number(((totalRedeemed / totalValid) * 100).toFixed(2))
        : 0;

    return {
      eventId: event.id,
      eventTitle: event.title,
      eventStatus: event.status,
      startDatetime: event.startDatetime,
      endDatetime: event.endDatetime,
      statistics: {
        totalParticipants: totalValid,
        totalRedeemed,
        remainingTickets,
        redemptionRate,
      },
      recentRedemptions: recentRedemptions.map((t) => ({
        id: t.id,
        ticketCode: t.ticketCode,
        ticketType: t.orderItem.ticketType.name,
        buyerName: t.orderItem.order.user.fullName,
        redeemedAt: t.redeemedAt,
      })),
    };
  }

  async removeOrganizerStaff(
    userId: string,
    eventId: string,
    assignmentId: string,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, organizerId: true },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.organizerId !== userId) {
      throw new ForbiddenException('You are not the owner of this event');
    }

    const assignment = await this.prisma.eventStaff.findUnique({
      where: { id: assignmentId },
      include: { user: { select: { fullName: true } } },
    });

    if (!assignment || assignment.eventId !== eventId) {
      throw new NotFoundException('Staff assignment not found for this event');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.eventStaff.delete({
        where: { id: assignmentId },
      });

      await this.auditLogs.log(
        userId,
        'ORGANIZER_REMOVE_STAFF',
        'EventStaff',
        assignmentId,
        {
          eventId,
          eventTitle: event.title,
          staffUserId: assignment.userId,
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
