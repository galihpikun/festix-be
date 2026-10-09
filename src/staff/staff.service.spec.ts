import { Test, TestingModule } from '@nestjs/testing';
import { StaffService } from './staff.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
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
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
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
});
