import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Role } from '../../generated/prisma/client';

describe('EventsService Admin Actions', () => {
  let service: EventsService;
  let prisma: any;
  let auditLogs: any;

  beforeEach(async () => {
    prisma = {
      event: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      category: {
        findUnique: jest.fn(),
      },
      staffInvitation: {
        createMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      eventStaff: {
        findUnique: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
      issuedTicket: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    prisma.event.updateMany.mockResolvedValue({ count: 1 });
    prisma.event.findUniqueOrThrow.mockResolvedValue({
      id: 'event-1',
      status: 'PUBLISHED',
    });
    prisma.user.updateMany.mockResolvedValue({ count: 1 });

    auditLogs = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: CloudinaryService,
          useValue: {
            uploadImage: jest
              .fn()
              .mockResolvedValue({ secure_url: 'url', public_id: 'id' }),
          },
        },
        { provide: AuditLogsService, useValue: auditLogs },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  describe('cancelEvent', () => {
    it('should throw BadRequestException if reason is empty', async () => {
      await expect(service.cancelEvent('event-1', '')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if event does not exist', async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(
        service.cancelEvent('event-1', 'Cancelled by admin'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if event has PAID orders', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        title: 'Concert',
        status: 'PUBLISHED',
        ticketTypes: [
          {
            orderItems: [
              {
                order: {
                  paymentStatus: 'PAID',
                },
              },
            ],
          },
        ],
      });

      await expect(
        service.cancelEvent('event-1', 'Cancelled by admin'),
      ).rejects.toThrow(ConflictException);
    });

    it('should cancel event successfully when there are no paid orders', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        title: 'Concert',
        status: 'PUBLISHED',
        ticketTypes: [],
      });

      prisma.event.update.mockResolvedValue({
        id: 'event-1',
        title: 'Concert',
        status: 'CANCELLED',
      });

      const result = await service.cancelEvent(
        'event-1',
        'Event host request',
        'admin-id',
      );
      expect(result.message).toBe('Event cancelled successfully');
      expect(auditLogs.log).toHaveBeenCalledWith(
        'admin-id',
        'CANCEL',
        'Event',
        'event-1',
        expect.any(Object),
        expect.anything(),
      );
    });
  });

  describe('eventDetail', () => {
    it('should only expose published events to public callers', async () => {
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(service.eventDetail('event-1')).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.event.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'event-1', status: 'PUBLISHED' },
        }),
      );
    });

    it('should allow an admin detail lookup to include non-published events', async () => {
      prisma.event.findFirst.mockResolvedValue({ id: 'event-1', status: 'DRAFT' });

      const event = await service.eventDetail('event-1', true);

      expect(event.status).toBe('DRAFT');
      expect(prisma.event.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'event-1' } }),
      );
    });
  });

  describe('createEvent - staff invitations', () => {
    const baseDto = {
      title: 'Test Event',
      description: 'Desc',
      location: 'Jakarta',
      categoryId: 'cat-1',
      startDatetime: '2026-12-01T10:00:00Z',
      endDatetime: '2026-12-01T18:00:00Z',
    };

    const files = {
      coverImage: [
        {
          buffer: Buffer.from('x'),
          originalname: 'cover.jpg',
          mimetype: 'image/jpeg',
          size: 100,
        },
      ],
    };

    const mockOrganizer = {
      id: 'org-1',
      organizerProfile: { status: 'APPROVED' },
    };

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(mockOrganizer);
      prisma.category.findUnique.mockResolvedValue({ id: 'cat-1' });
      prisma.event.create.mockResolvedValue({
        id: 'evt-1',
        ...baseDto,
        status: 'DRAFT',
      });
      prisma.staffInvitation.createMany.mockResolvedValue({ count: 0 });
    });

    it('should create event without invitees (backward compatible)', async () => {
      const result = await service.createEvent('org-1', baseDto, files);
      expect(result.message).toBe('Event created successfully');
      expect(prisma.staffInvitation.createMany).not.toHaveBeenCalled();
    });

    it('should create event with one invitee', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'u-1', emailVerified: true, isSuspended: false, role: Role.USER },
      ]);

      const result = await service.createEvent(
        'org-1',
        { ...baseDto, invitedUserIds: ['u-1'] },
        files,
      );

      expect(result.message).toBe('Event created successfully');
      expect(prisma.staffInvitation.createMany).toHaveBeenCalledWith({
        data: [{ eventId: 'evt-1', userId: 'u-1' }],
      });
    });

    it('should create event with multiple invitees', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'u-1', emailVerified: true, isSuspended: false, role: Role.USER },
        {
          id: 'u-2',
          emailVerified: true,
          isSuspended: false,
          role: Role.STAFF,
        },
      ]);

      const result = await service.createEvent(
        'org-1',
        { ...baseDto, invitedUserIds: ['u-1', 'u-2'] },
        files,
      );

      expect(result.message).toBe('Event created successfully');
      expect(prisma.staffInvitation.createMany).toHaveBeenCalledWith({
        data: [
          { eventId: 'evt-1', userId: 'u-1' },
          { eventId: 'evt-1', userId: 'u-2' },
        ],
      });
    });

    it('should deduplicate invitee IDs', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'u-1', emailVerified: true, isSuspended: false, role: Role.USER },
      ]);

      await service.createEvent(
        'org-1',
        { ...baseDto, invitedUserIds: ['u-1', 'u-1', 'u-1'] },
        files,
      );

      expect(prisma.staffInvitation.createMany).toHaveBeenCalledWith({
        data: [{ eventId: 'evt-1', userId: 'u-1' }],
      });
    });

    it('should reject nonexistent users', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await expect(
        service.createEvent(
          'org-1',
          { ...baseDto, invitedUserIds: ['nonexistent-id'] },
          files,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject unverified users', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'u-1',
          emailVerified: false,
          isSuspended: false,
          role: Role.USER,
        },
      ]);

      await expect(
        service.createEvent(
          'org-1',
          { ...baseDto, invitedUserIds: ['u-1'] },
          files,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject suspended users', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'u-1', emailVerified: true, isSuspended: true, role: Role.USER },
      ]);

      await expect(
        service.createEvent(
          'org-1',
          { ...baseDto, invitedUserIds: ['u-1'] },
          files,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject admin users', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'u-1',
          emailVerified: true,
          isSuspended: false,
          role: Role.ADMIN,
        },
      ]);

      await expect(
        service.createEvent(
          'org-1',
          { ...baseDto, invitedUserIds: ['u-1'] },
          files,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject organizer inviting themselves', async () => {
      await expect(
        service.createEvent(
          'org-1',
          { ...baseDto, invitedUserIds: ['org-1'] },
          files,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('approveEvent - staff invitation activation', () => {
    const baseEvent = {
      id: 'evt-1',
      title: 'Test Event',
      status: 'PENDING_REVIEW',
      organizer: {
        organizerProfile: { status: 'APPROVED' },
      },
      ticketTypes: [{ id: 'tt-1' }],
    };

    it('should approve event and activate eligible invitations', async () => {
      prisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        staffInvitations: [
          {
            id: 'si-1',
            userId: 'u-1',
            activated: false,
            user: {
              id: 'u-1',
              role: Role.USER,
              emailVerified: true,
              isSuspended: false,
            },
          },
        ],
      });

      prisma.eventStaff.upsert.mockResolvedValue({ id: 'es-1' });
      prisma.staffInvitation.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.approveEvent('evt-1', 'admin-1');

      expect(result.message).toBe('Event approved successfully');
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'u-1',
          role: Role.USER,
          emailVerified: true,
          isSuspended: false,
        },
        data: { role: Role.STAFF },
      });
      expect(prisma.eventStaff.upsert).toHaveBeenCalledWith({
        where: { eventId_userId: { eventId: 'evt-1', userId: 'u-1' } },
        create: { eventId: 'evt-1', userId: 'u-1' },
        update: {},
      });
      expect(prisma.staffInvitation.updateMany).toHaveBeenCalledWith({
        where: { id: 'si-1', activated: false },
        data: { activated: true },
      });
    });

    it('should reject approval when assignment creation fails before invitation activation', async () => {
      prisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        staffInvitations: [
          {
            id: 'si-1',
            user: {
              id: 'u-1',
              role: Role.STAFF,
              emailVerified: true,
              isSuspended: false,
            },
          },
        ],
      });
      prisma.eventStaff.upsert.mockRejectedValue(new Error('assignment failed'));

      await expect(service.approveEvent('evt-1')).rejects.toThrow(
        'assignment failed',
      );
      expect(prisma.staffInvitation.updateMany).not.toHaveBeenCalled();
      expect(auditLogs.log).not.toHaveBeenCalled();
    });

    it('should reject an approval when conditional publication affects no event', async () => {
      prisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        staffInvitations: [],
      });
      prisma.event.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.approveEvent('evt-1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.eventStaff.upsert).not.toHaveBeenCalled();
    });

    it('should not change role for existing STAFF users', async () => {
      prisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        staffInvitations: [
          {
            id: 'si-1',
            userId: 'u-1',
            activated: false,
            user: {
              id: 'u-1',
              role: Role.STAFF,
              emailVerified: true,
              isSuspended: false,
            },
          },
        ],
      });

      prisma.event.update.mockResolvedValue({
        ...baseEvent,
        status: 'PUBLISHED',
      });
      prisma.eventStaff.upsert.mockResolvedValue({ id: 'es-1' });
      prisma.staffInvitation.updateMany.mockResolvedValue({ count: 1 });

      await service.approveEvent('evt-1', 'admin-1');

      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(prisma.eventStaff.upsert).toHaveBeenCalled();
    });

    it('should skip ADMIN invitees without downgrading', async () => {
      prisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        staffInvitations: [
          {
            id: 'si-1',
            userId: 'u-admin',
            activated: false,
            user: {
              id: 'u-admin',
              role: Role.ADMIN,
              emailVerified: true,
              isSuspended: false,
            },
          },
        ],
      });

      prisma.event.update.mockResolvedValue({
        ...baseEvent,
        status: 'PUBLISHED',
      });

      await service.approveEvent('evt-1', 'admin-1');

      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(prisma.eventStaff.upsert).not.toHaveBeenCalled();
    });

    it('should skip suspended invitees at approval time', async () => {
      prisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        staffInvitations: [
          {
            id: 'si-1',
            userId: 'u-1',
            activated: false,
            user: {
              id: 'u-1',
              role: Role.USER,
              emailVerified: true,
              isSuspended: true,
            },
          },
        ],
      });

      prisma.event.update.mockResolvedValue({
        ...baseEvent,
        status: 'PUBLISHED',
      });

      await service.approveEvent('evt-1', 'admin-1');

      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(prisma.eventStaff.upsert).not.toHaveBeenCalled();
    });

    it('should skip unverified invitees at approval time', async () => {
      prisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        staffInvitations: [
          {
            id: 'si-1',
            userId: 'u-1',
            activated: false,
            user: {
              id: 'u-1',
              role: Role.USER,
              emailVerified: false,
              isSuspended: false,
            },
          },
        ],
      });

      prisma.event.update.mockResolvedValue({
        ...baseEvent,
        status: 'PUBLISHED',
      });

      await service.approveEvent('evt-1', 'admin-1');

      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(prisma.eventStaff.upsert).not.toHaveBeenCalled();
    });

    it('should not duplicate EventStaff if already assigned', async () => {
      prisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        staffInvitations: [
          {
            id: 'si-1',
            userId: 'u-1',
            activated: false,
            user: {
              id: 'u-1',
              role: Role.STAFF,
              emailVerified: true,
              isSuspended: false,
            },
          },
        ],
      });

      prisma.event.update.mockResolvedValue({
        ...baseEvent,
        status: 'PUBLISHED',
      });
      prisma.eventStaff.upsert.mockResolvedValue({ id: 'existing-es' });
      prisma.staffInvitation.updateMany.mockResolvedValue({ count: 1 });

      await service.approveEvent('evt-1', 'admin-1');

      expect(prisma.eventStaff.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: {} }),
      );
    });

    it('should approve event with no invitations (backward compatible)', async () => {
      prisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        staffInvitations: [],
      });

      prisma.event.update.mockResolvedValue({
        ...baseEvent,
        status: 'PUBLISHED',
      });

      const result = await service.approveEvent('evt-1', 'admin-1');
      expect(result.message).toBe('Event approved successfully');
    });

    it('should reject approval of non-PENDING_REVIEW events (no repeated approval)', async () => {
      prisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        status: 'PUBLISHED',
        staffInvitations: [],
      });
      prisma.event.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.approveEvent('evt-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('rejectEvent - no invitation activation', () => {
    it('should reject event without activating invitations', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'evt-1',
        title: 'Test',
        status: 'PENDING_REVIEW',
      });

      prisma.event.update.mockResolvedValue({
        id: 'evt-1',
        status: 'REJECTED',
      });

      const result = await service.rejectEvent(
        'evt-1',
        'Bad content',
        'admin-1',
      );
      expect(result.event.status).toBe('REJECTED');
      expect(prisma.staffInvitation.update).not.toHaveBeenCalled();
    });
  });

  describe('searchInvitableUsers', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'org-1',
        isSuspended: false,
        organizerProfile: { status: 'APPROVED' },
      });
    });

    it('should reject users without an organizer profile', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        isSuspended: false,
        organizerProfile: null,
      });

      await expect(
        service.searchInvitableUsers({ search: 'alice' }, 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject suspended and unapproved organizers', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'org-1',
        isSuspended: true,
        organizerProfile: { status: 'APPROVED' },
      });

      await expect(
        service.searchInvitableUsers({ search: 'alice' }, 'org-1'),
      ).rejects.toThrow(ForbiddenException);

      prisma.user.findUnique.mockResolvedValue({
        id: 'org-1',
        isSuspended: false,
        organizerProfile: { status: 'PENDING' },
      });

      await expect(
        service.searchInvitableUsers({ search: 'alice' }, 'org-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return eligible users matching search', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'u-1',
          email: 'alice@test.com',
          fullName: 'Alice',
          avatar: null,
          role: Role.USER,
        },
      ]);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.searchInvitableUsers(
        { search: 'alice', page: 1, limit: 10 },
        'org-1',
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('u-1');
      expect(result.data[0]).not.toHaveProperty('password');
      expect(result.meta.total).toBe(1);
    });

    it('should exclude organizer from results', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.searchInvitableUsers(
        { search: 'organizer', page: 1, limit: 10 },
        'org-1',
      );

      const whereArg = prisma.user.findMany.mock.calls[0][0].where;
      expect(whereArg.id).toEqual({ not: 'org-1' });
    });

    it('should filter out suspended and unverified users via query', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.searchInvitableUsers(
        { search: 'test', page: 1, limit: 10 },
        'org-1',
      );

      const whereArg = prisma.user.findMany.mock.calls[0][0].where;
      expect(whereArg.emailVerified).toBe(true);
      expect(whereArg.isSuspended).toBe(false);
      expect(whereArg.role).toEqual({ not: Role.ADMIN });
    });

    it('should cap limit at 20', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.searchInvitableUsers(
        { search: 'test', page: 1, limit: 100 },
        'org-1',
      );

      const takeArg = prisma.user.findMany.mock.calls[0][0].take;
      expect(takeArg).toBe(20);
    });

    it('should respect pagination', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(25);

      const result = await service.searchInvitableUsers(
        { search: 'test', page: 2, limit: 10 },
        'org-1',
      );

      const skipArg = prisma.user.findMany.mock.calls[0][0].skip;
      expect(skipArg).toBe(10);
      expect(result.meta.totalPages).toBe(3);
    });
  });

  describe('getMyEvents', () => {
    it('should throw ForbiddenException if user has unapproved organizer profile', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        organizerProfile: { status: 'PENDING' },
      });

      await expect(service.getMyEvents('u-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return paginated events owned by organizer', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        organizerProfile: { status: 'APPROVED' },
      });

      prisma.event.findMany.mockResolvedValue([
        {
          id: 'evt-1',
          title: 'Concert A',
          organizerId: 'u-1',
          category: { name: 'Music' },
          ticketTypes: [],
          _count: { staffs: 2, staffInvitations: 1 },
        },
      ]);
      prisma.event.count.mockResolvedValue(1);

      const result = await service.getMyEvents('u-1', { page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('evt-1');
      expect(result.meta.total).toBe(1);
    });
  });

  describe('getOrganizerEventDetail', () => {
    it('should throw NotFoundException if event does not exist', async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(
        service.getOrganizerEventDetail('u-1', 'evt-none'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not the owner', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'evt-1',
        organizerId: 'other-user',
      });

      await expect(
        service.getOrganizerEventDetail('u-1', 'evt-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return event details for the owner', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'evt-1',
        title: 'Owned Event',
        organizerId: 'u-1',
        category: { name: 'Tech' },
        ticketTypes: [],
        staffs: [],
        staffInvitations: [],
      });

      const result = await service.getOrganizerEventDetail('u-1', 'evt-1');
      expect(result.title).toBe('Owned Event');
    });
  });

  describe('getOrganizerEventCheckin', () => {
    it('should throw ForbiddenException if user is not the owner', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'evt-1',
        organizerId: 'other-user',
      });

      await expect(
        service.getOrganizerEventCheckin('u-1', 'evt-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return checkin statistics for the event', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'evt-1',
        title: 'Festival',
        status: 'PUBLISHED',
        startDatetime: new Date(),
        endDatetime: new Date(),
        organizerId: 'u-1',
      });

      prisma.issuedTicket.count
        .mockResolvedValueOnce(100) // total valid
        .mockResolvedValueOnce(40); // total redeemed

      prisma.issuedTicket.findMany.mockResolvedValue([
        {
          id: 't-1',
          ticketCode: 'TCK-1',
          redeemedAt: new Date(),
          orderItem: {
            ticketType: { name: 'VIP' },
            order: { user: { fullName: 'Charlie' } },
          },
        },
      ]);

      const result = await service.getOrganizerEventCheckin('u-1', 'evt-1');
      expect(result.statistics.totalParticipants).toBe(100);
      expect(result.statistics.totalRedeemed).toBe(40);
      expect(result.statistics.remainingTickets).toBe(60);
      expect(result.statistics.redemptionRate).toBe(40);
      expect(result.recentRedemptions).toHaveLength(1);
    });
  });

  describe('removeOrganizerStaff', () => {
    it('should throw ForbiddenException if event is not owned by user', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'evt-1',
        organizerId: 'other-user',
      });

      await expect(
        service.removeOrganizerStaff('u-1', 'evt-1', 'es-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should remove staff assignment and log audit', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'evt-1',
        title: 'Festival',
        organizerId: 'u-1',
      });

      prisma.eventStaff.findUnique.mockResolvedValue({
        id: 'es-1',
        eventId: 'evt-1',
        userId: 'staff-1',
        user: { fullName: 'Dave' },
      });

      prisma.eventStaff.delete = jest.fn().mockResolvedValue({ id: 'es-1' });

      const result = await service.removeOrganizerStaff('u-1', 'evt-1', 'es-1');
      expect(result.message).toBe('Staff assignment removed successfully');
      expect(auditLogs.log).toHaveBeenCalledWith(
        'u-1',
        'ORGANIZER_REMOVE_STAFF',
        'EventStaff',
        'es-1',
        expect.any(Object),
        expect.anything(),
      );
    });
  });
});
