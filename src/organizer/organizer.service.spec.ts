import { Test, TestingModule } from '@nestjs/testing';
import { OrganizerService } from './organizer.service';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

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
});
