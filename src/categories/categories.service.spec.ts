import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: any;
  let auditLogs: any;

  beforeEach(async () => {
    prisma = {
      category: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    auditLogs = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogs },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  it('should list categories with event counts', async () => {
    prisma.category.findMany.mockResolvedValue([
      {
        id: '1',
        name: 'Music',
        slug: 'music',
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { events: 5 },
      },
    ]);

    const result = await service.getCategories();
    expect(result).toHaveLength(1);
    expect(result[0].eventCount).toBe(5);
  });

  it('should prevent deleting category with events', async () => {
    prisma.category.findUnique.mockResolvedValue({
      id: '1',
      name: 'Music',
      slug: 'music',
      _count: { events: 3 },
    });

    await expect(service.deleteCat('1')).rejects.toThrow(ConflictException);
  });

  it('should throw NotFoundException when deleting non-existent category', async () => {
    prisma.category.findUnique.mockResolvedValue(null);

    await expect(service.deleteCat('999')).rejects.toThrow(NotFoundException);
  });
});
