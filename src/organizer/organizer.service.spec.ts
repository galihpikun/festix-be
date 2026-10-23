import { Test, TestingModule } from '@nestjs/testing';
import { OrganizerService } from './organizer.service';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

describe('OrganizerService Admin Review', () => {
  let service: OrganizerService;
  let prisma: any;
  let auditLogs: any;

  beforeEach(async () => {
    prisma = {
      organizerProfile: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      organizerDocument: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      event: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      orderItem: {
        findMany: jest.fn(),
      },
      issuedTicket: {
        count: jest.fn(),
      },
      eventStaff: {
        findMany: jest.fn(),
      },
      staffInvitation: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    auditLogs = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizerService,
        { provide: PrismaService, useValue: prisma },
        { provide: CloudinaryService, useValue: {} },
        { provide: AuditLogsService, useValue: auditLogs },
      ],
    }).compile();

    service = module.get<OrganizerService>(OrganizerService);
  });

  describe('approveOrganizer', () => {
    it('should throw ConflictException if documents are not all approved', async () => {
      prisma.organizerProfile.findUnique.mockResolvedValue({
        id: 'org-1',
        organizationName: 'Org Ltd',
        status: 'PENDING',
        documents: [
          { id: 'doc-1', status: 'APPROVED' },
          { id: 'doc-2', status: 'PENDING' },
        ],
      });

      await expect(service.approveOrganizer('org-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should approve organizer when all documents are approved', async () => {
      prisma.organizerProfile.findUnique.mockResolvedValue({
        id: 'org-1',
        organizationName: 'Org Ltd',
        status: 'PENDING',
        documents: [
          { id: 'doc-1', status: 'APPROVED' },
          { id: 'doc-2', status: 'APPROVED' },
        ],
      });

      prisma.organizerProfile.update.mockResolvedValue({
        id: 'org-1',
        status: 'APPROVED',
      });

      const res = await service.approveOrganizer('org-1', 'admin-id');
      expect(res.message).toBe('Organizer approved successfully');
      expect(auditLogs.log).toHaveBeenCalledWith(
        'admin-id',
        'APPROVE',
        'OrganizerProfile',
        'org-1',
        expect.any(Object),
        expect.anything(),
      );
    });
  });

  describe('approveDocument', () => {
    it('should approve document and log audit', async () => {
      prisma.organizerDocument.findUnique.mockResolvedValue({
        id: 'doc-1',
        type: 'BUSINESS_LICENSE',
        organizerId: 'org-1',
      });

      prisma.organizerDocument.update.mockResolvedValue({
        id: 'doc-1',
        status: 'APPROVED',
      });

      const res = await service.approveDocument('doc-1', 'admin-id');
      expect(res.message).toBe('Document approved successfully');
      expect(auditLogs.log).toHaveBeenCalledWith(
        'admin-id',
        'APPROVE_DOCUMENT',
        'OrganizerDocument',
        'doc-1',
        expect.any(Object),
        expect.anything(),
      );
    });
  });

  describe('getOrganizerDashboard', () => {
    it('should throw NotFoundException if user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getOrganizerDashboard('user-none')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user has no organizer profile or unapproved', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        organizerProfile: null,
      });

      await expect(service.getOrganizerDashboard('u-1')).rejects.toThrow(
        ForbiddenException,
      );

      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        organizerProfile: { status: 'PENDING' },
      });

      await expect(service.getOrganizerDashboard('u-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return scoped organizer metrics, upcoming events, and sales', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-org',
        organizerProfile: {
          organizationName: 'Creative Fest',
          status: 'APPROVED',
        },
      });

      prisma.event.count
        .mockResolvedValueOnce(5) // total
        .mockResolvedValueOnce(3) // published
        .mockResolvedValueOnce(1) // pending
        .mockResolvedValueOnce(1) // draft
        .mockResolvedValueOnce(0); // rejected

      prisma.orderItem.findMany.mockResolvedValue([
        {
          id: 'item-1',
          quantity: 2,
          price: '50000',
          createdAt: new Date(),
          order: {
            id: 'ord-1',
            orderNumber: 'ORD-123',
            user: { fullName: 'Bob', email: 'bob@example.com' },
          },
          ticketType: {
            name: 'VIP',
            event: { id: 'evt-1', title: 'Summer Fest' },
          },
        },
      ]);

      prisma.issuedTicket.count.mockResolvedValue(2);

      prisma.event.findMany
        .mockResolvedValueOnce([
          {
            id: 'evt-1',
            title: 'Summer Fest',
            coverImageUrl: 'https://example.com/cover.jpg',
            location: 'Jakarta',
            startDatetime: new Date(),
            endDatetime: new Date(),
            category: { name: 'Music' },
            status: 'PUBLISHED',
            ticketTypes: [
              { id: 'tt-1', name: 'VIP', quota: 100, availableQuota: 98 },
            ],
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getOrganizerDashboard('u-org');

      expect(result.organizationName).toBe('Creative Fest');
      expect(result.metrics.totalEvents).toBe(5);
      expect(result.metrics.publishedEvents).toBe(3);
      expect(result.metrics.totalTicketsSold).toBe(2);
      expect(result.metrics.grossRevenue).toBe(100000);
      expect(result.metrics.checkedInAttendees).toBe(2);
      expect(result.upcomingEvents).toHaveLength(1);
      expect(result.upcomingEvents[0].soldQuota).toBe(2);
      expect(result.recentSales).toHaveLength(1);
    });
  });

  describe('getOrganizerStaff', () => {
    it('should throw ForbiddenException if user has no approved organizer profile', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        organizerProfile: { status: 'PENDING' },
      });

      await expect(service.getOrganizerStaff('u-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return active assignments and pending invitations scoped to organizer events', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-org',
        organizerProfile: { status: 'APPROVED' },
      });

      prisma.eventStaff.findMany.mockResolvedValue([
        {
          id: 'es-1',
          createdAt: new Date(),
          user: {
            id: 'u-staff',
            fullName: 'Staff Member',
            email: 'staff@example.com',
            avatar: null,
          },
          event: {
            id: 'evt-1',
            title: 'Rock Concert',
            status: 'PUBLISHED',
            startDatetime: new Date(),
          },
        },
      ]);

      prisma.staffInvitation.findMany.mockResolvedValue([
        {
          id: 'si-1',
          createdAt: new Date(),
          user: {
            id: 'u-inv',
            fullName: 'Invited Person',
            email: 'inv@example.com',
            avatar: null,
          },
          event: {
            id: 'evt-2',
            title: 'Jazz Fest',
            status: 'DRAFT',
            startDatetime: new Date(),
          },
        },
      ]);

      const result = await service.getOrganizerStaff('u-org');
      expect(result.active).toHaveLength(1);
      expect(result.active[0].type).toBe('ACTIVE');
      expect(result.active[0].fullName).toBe('Staff Member');
      expect(result.pending).toHaveLength(1);
      expect(result.pending[0].type).toBe('PENDING');
      expect(result.totalCount).toBe(2);
    });
  });
});
