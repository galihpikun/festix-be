import { ConflictException, NotFoundException } from '@nestjs/common';
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
