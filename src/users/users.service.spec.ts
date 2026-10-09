import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { Role } from '../../generated/prisma/client';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: any;
  let auditLogs: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    auditLogs = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogs },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('changeRole', () => {
    it('should prevent self-role change', async () => {
      await expect(
        service.changeRole('admin-1', { role: Role.USER }, 'admin-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should prevent demoting the last admin', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin-2',
        role: Role.ADMIN,
      });

      prisma.user.count.mockResolvedValue(1);

      await expect(
        service.changeRole('admin-2', { role: Role.USER }, 'admin-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should change role successfully and log audit', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        role: Role.USER,
      });

      prisma.user.update.mockResolvedValue({
        id: 'user-1',
        email: 'u@test.com',
        fullName: 'User Test',
        role: Role.STAFF,
      });

      const res = await service.changeRole(
        'user-1',
        { role: Role.STAFF },
        'admin-1',
      );

      expect(res.user.role).toBe(Role.STAFF);
      expect(auditLogs.log).toHaveBeenCalledWith(
        'admin-1',
        'CHANGE_ROLE',
        'User',
        'user-1',
        expect.any(Object),
        expect.anything(),
      );
    });
  });

  describe('suspendUser', () => {
    it('should prevent self-suspension', async () => {
      await expect(
        service.suspendUser('admin-1', { reason: 'test' }, 'admin-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should prevent suspending another admin', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin-2',
        role: Role.ADMIN,
        isSuspended: false,
      });

      await expect(
        service.suspendUser('admin-2', { reason: 'test' }, 'admin-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should suspend user successfully and log audit', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        role: Role.USER,
        isSuspended: false,
      });

      prisma.user.update.mockResolvedValue({
        id: 'user-1',
        isSuspended: true,
        suspendedAt: new Date(),
        suspendReason: 'Policy violation',
      });

      const res = await service.suspendUser(
        'user-1',
        { reason: 'Policy violation' },
        'admin-1',
      );

      expect(res.user.isSuspended).toBe(true);
      expect(auditLogs.log).toHaveBeenCalledWith(
        'admin-1',
        'SUSPEND',
        'User',
        'user-1',
        expect.any(Object),
        expect.anything(),
      );
    });
  });
});
