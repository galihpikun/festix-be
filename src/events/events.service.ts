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
import { buildPaginatedResponse } from '../shared/helpers/paginate';
import { Prisma } from '../../generated/prisma/client';

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

  async eventDetail(id: string) {
    const event = await this.prisma.event.findUnique({
      where: {
        id,
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

    const event = await this.prisma.event.create({
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
    const event = await this.prisma.event.findUnique({
      where: {
        id: eventId,
      },
      include: {
        organizer: {
          include: {
            organizerProfile: true,
          },
        },
        ticketTypes: true,
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

    if (event.status !== 'PENDING_REVIEW') {
      throw new ConflictException('Only events pending review can be approved');
    }

    const updatedEvent = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.event.update({
        where: {
          id: eventId,
        },
        data: {
          status: 'PUBLISHED',
          rejectionReason: null,
        },
      });

      await this.auditLogs.log(
        actorId ?? null,
        'APPROVE',
        'Event',
        eventId,
        { title: event.title, previousStatus: event.status },
        tx,
      );

      return updated;
    });

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
      });

      await this.auditLogs.log(
        actorId ?? null,
        'CANCEL',
        'Event',
        eventId,
        { title: event.title, reason: reason.trim(), previousStatus: event.status },
        tx,
      );

      return updated;
    });

    return {
      message: 'Event cancelled successfully',
      event: updatedEvent,
    };
  }
}
