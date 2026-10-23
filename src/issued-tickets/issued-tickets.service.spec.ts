import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { IssuedTicketsService } from './issued-tickets.service';

describe('IssuedTicketsService', () => {
  let service: IssuedTicketsService;

  const mockPrisma = {
    order: {
      findUnique: jest.fn(),
    },
    issuedTicket: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IssuedTicketsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<IssuedTicketsService>(IssuedTicketsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMyTickets', () => {
    it('should query tickets filtered by authenticated userId and PAID status', async () => {
      const mockTickets = [
        {
          id: 'ticket-1',
          ticketCode: 'TCK-TEST-1',
          isRedeemed: false,
          isCancelled: false,
        },
      ];
      mockPrisma.issuedTicket.findMany.mockResolvedValue(mockTickets);

      const result = await service.getMyTickets('user-123');

      expect(result).toEqual(mockTickets);
      expect(mockPrisma.issuedTicket.findMany).toHaveBeenCalledWith({
        where: {
          orderItem: {
            order: {
              userId: 'user-123',
              paymentStatus: 'PAID',
            },
          },
        },
        include: expect.any(Object),
        orderBy: {
          createdAt: 'desc',
        },
      });
    });
  });

  describe('getTicketDetail', () => {
    it('should return ticket if owned by user', async () => {
      const mockTicket = {
        id: 'ticket-1',
        ticketCode: 'TCK-TEST-1',
        orderItem: {
          order: {
            userId: 'user-123',
          },
        },
      };
      mockPrisma.issuedTicket.findUnique.mockResolvedValue(mockTicket);

      const result = await service.getTicketDetail('user-123', 'ticket-1');
      expect(result).toEqual(mockTicket);
    });

    it('should throw NotFoundException if ticket does not exist', async () => {
      mockPrisma.issuedTicket.findUnique.mockResolvedValue(null);

      await expect(
        service.getTicketDetail('user-123', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if ticket belongs to another user', async () => {
      const mockTicket = {
        id: 'ticket-1',
        ticketCode: 'TCK-TEST-1',
        orderItem: {
          order: {
            userId: 'other-user',
          },
        },
      };
      mockPrisma.issuedTicket.findUnique.mockResolvedValue(mockTicket);

      await expect(
        service.getTicketDetail('user-123', 'ticket-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('issueTicketsForOrder', () => {
    it('should throw NotFoundException if order does not exist', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);

      await expect(service.issueTicketsForOrder('order-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if order is not PAID', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        paymentStatus: 'PENDING',
        orderItems: [],
      });

      await expect(service.issueTicketsForOrder('order-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should return existing tickets idempotently if already issued', async () => {
      const existingTickets = [
        {
          id: 'ticket-1',
          ticketCode: 'TCK-1',
          isRedeemed: false,
          isCancelled: false,
        },
      ];

      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        paymentStatus: 'PAID',
        orderItems: [
          {
            id: 'item-1',
            quantity: 1,
            issuedTickets: existingTickets,
          },
        ],
      });

      const result = await service.issueTicketsForOrder('order-1');
      expect(result).toEqual(existingTickets);
      expect(mockPrisma.issuedTicket.create).not.toHaveBeenCalled();
    });

    it('should create tickets according to order items quantity', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        paymentStatus: 'PAID',
        orderItems: [
          {
            id: 'item-1',
            quantity: 2,
            issuedTickets: [],
          },
          {
            id: 'item-2',
            quantity: 1,
            issuedTickets: [],
          },
        ],
      });

      mockPrisma.issuedTicket.create
        .mockResolvedValueOnce({
          id: 't-1',
          ticketCode: 'TCK-A',
          isRedeemed: false,
          isCancelled: false,
          redeemedAt: null,
        })
        .mockResolvedValueOnce({
          id: 't-2',
          ticketCode: 'TCK-B',
          isRedeemed: false,
          isCancelled: false,
          redeemedAt: null,
        })
        .mockResolvedValueOnce({
          id: 't-3',
          ticketCode: 'TCK-C',
          isRedeemed: false,
          isCancelled: false,
          redeemedAt: null,
        });

      const result = await service.issueTicketsForOrder('order-1');

      expect(result).toHaveLength(3);
      expect(mockPrisma.issuedTicket.create).toHaveBeenCalledTimes(3);
    });
  });
});
