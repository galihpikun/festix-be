import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('EventsService Admin Actions', () => {
  let service: EventsService;
  let prisma: any;
  let auditLogs: any;

  beforeEach(async () => {
    prisma = {
      event: {
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
        EventsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CloudinaryService, useValue: {} },
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

      await expect(service.cancelEvent('event-1', 'Cancelled by admin')).rejects.toThrow(
        NotFoundException,
      );
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

      const result = await service.cancelEvent('event-1', 'Event host request', 'admin-id');
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
});
