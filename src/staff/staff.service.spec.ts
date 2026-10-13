import { Test, TestingModule } from '@nestjs/testing';
import { StaffService } from './staff.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Role } from '../../generated/prisma/client';

describe('StaffService', () => {
  let service: StaffService;
  let prisma: any;
  let auditLogs: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
      },
      event: {
        findUnique: jest.fn(),
      },
      eventStaff: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      issuedTicket: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    auditLogs = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogs },
      ],
    }).compile();

    service = module.get<StaffService>(StaffService);
  });

  describe('assignStaff', () => {
    it('should throw BadRequestException if user is not STAFF role', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        role: Role.USER,
      });

      await expect(
        service.assignStaff({ userId: 'u-1', eventId: 'e-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if event not found', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        role: Role.STAFF,
      });

      prisma.event.findUnique.mockResolvedValue(null);

      await expect(
        service.assignStaff({ userId: 'u-1', eventId: 'e-1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if already assigned', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        role: Role.STAFF,
      });

      prisma.event.findUnique.mockResolvedValue({
        id: 'e-1',
        title: 'Event A',
      });

      prisma.eventStaff.findUnique.mockResolvedValue({
        id: 'es-1',
      });

      await expect(
        service.assignStaff({ userId: 'u-1', eventId: 'e-1' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should assign staff successfully and log audit', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        fullName: 'Staff One',
        role: Role.STAFF,
      });

      prisma.event.findUnique.mockResolvedValue({
        id: 'e-1',
        title: 'Event A',
      });

      prisma.eventStaff.findUnique.mockResolvedValue(null);

      prisma.eventStaff.create.mockResolvedValue({
        id: 'es-1',
        eventId: 'e-1',
        userId: 'u-1',
      });

      const res = await service.assignStaff(
        { userId: 'u-1', eventId: 'e-1' },
        'admin-id',
      );

      expect(res.message).toBe('Staff assigned to event successfully');
      expect(auditLogs.log).toHaveBeenCalledWith(
        'admin-id',
        'ASSIGN_STAFF',
        'EventStaff',
        'es-1',
        expect.any(Object),
        expect.anything(),
      );
    });
  });

  describe('getAssignedEvents', () => {
    it('should return empty list when staff has no assigned events', async () => {
      prisma.eventStaff.findMany.mockResolvedValue([]);

      const result = await service.getAssignedEvents('staff-1');

      expect(result).toEqual([]);
      expect(prisma.issuedTicket.count).not.toHaveBeenCalled();
    });

    it('should return only assigned events with participant summary and active state', async () => {
      const now = Date.now();
      const startDatetime = new Date(now - 3600000);
      const endDatetime = new Date(now + 3600000);

      prisma.eventStaff.findMany.mockResolvedValue([
        {
          id: 'es-1',
          userId: 'staff-1',
          createdAt: new Date(),
          event: {
            id: 'event-1',
            title: 'Assigned Fest',
            coverImageUrl: 'https://example.com/cover.jpg',
            status: 'PUBLISHED',
            location: 'Gelora Bung Karno',
            startDatetime,
            endDatetime,
          },
        },
      ]);

      prisma.issuedTicket.count
        .mockResolvedValueOnce(150)
        .mockResolvedValueOnce(50);

      const result = await service.getAssignedEvents('staff-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('event-1');
      expect(result[0].title).toBe('Assigned Fest');
      expect(result[0].isActive).toBe(true);
      expect(result[0].participantSummary).toEqual({
        totalParticipants: 150,
        totalRedeemed: 50,
      });
    });
  });

  describe('getEventDashboard', () => {
    const eventId = 'event-1';
    const staffId = 'staff-1';
    const startDatetime = new Date(Date.now() - 3600000);
    const endDatetime = new Date(Date.now() + 3600000);

    const mockEvent = {
      id: eventId,
      title: 'Assigned Fest',
      location: 'Gelora Bung Karno',
      status: 'PUBLISHED',
      startDatetime,
      endDatetime,
    };

    it('should throw NotFoundException when event does not exist', async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.getEventDashboard(staffId, eventId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when staff is not assigned to event', async () => {
      prisma.event.findUnique.mockResolvedValue(mockEvent);
      prisma.eventStaff.findUnique.mockResolvedValue(null);

      await expect(service.getEventDashboard(staffId, eventId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return aggregated participant statistics, active state, and recent redemptions', async () => {
      prisma.event.findUnique.mockResolvedValue(mockEvent);
      prisma.eventStaff.findUnique.mockResolvedValue({
        eventId,
        userId: staffId,
      });

      prisma.issuedTicket.count
        .mockResolvedValueOnce(200)
        .mockResolvedValueOnce(150);

      const redeemedAt = new Date();
      prisma.issuedTicket.findMany.mockResolvedValue([
        {
          id: 'ticket-1',
          ticketCode: 'TCK-REC-1',
          redeemedAt,
          orderItem: {
            ticketType: { name: 'VIP' },
            order: { user: { fullName: 'Alice' } },
          },
        },
      ]);

      const result = await service.getEventDashboard(staffId, eventId);

      expect(result.event.id).toBe(eventId);
      expect(result.event.isActive).toBe(true);
      expect(result.statistics).toEqual({
        totalParticipants: 200,
        totalRedeemed: 150,
        remainingTickets: 50,
        redemptionRate: 75,
      });
      expect(result.recentRedemptions).toEqual([
        {
          id: 'ticket-1',
          ticketCode: 'TCK-REC-1',
          ticketType: 'VIP',
          buyerName: 'Alice',
          redeemedAt,
        },
      ]);
    });
  });
});
