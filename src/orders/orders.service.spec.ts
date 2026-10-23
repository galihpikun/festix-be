import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../../generated/prisma/client';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  let service: OrdersService;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    fullName: 'Test User',
    password: 'hashed',
    role: 'USER',
    emailVerified: true,
    isSuspended: false,
  };

  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const mockTicketTypeA = {
    id: 'tt-a',
    eventId: 'event-1',
    name: 'Regular',
    price: new Prisma.Decimal(100000),
    quota: 100,
    availableQuota: 50,
    event: {
      id: 'event-1',
      status: 'PUBLISHED',
      endDatetime: futureDate,
    },
  };

  const mockTicketTypeB = {
    id: 'tt-b',
    eventId: 'event-1',
    name: 'VIP',
    price: new Prisma.Decimal(250000),
    quota: 50,
    availableQuota: 20,
    event: {
      id: 'event-1',
      status: 'PUBLISHED',
      endDatetime: futureDate,
    },
  };

  const mockTx = {
    ticketType: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    order: {
      create: jest.fn(),
    },
  };

  const mockPrisma = {
    user: { findUnique: jest.fn() },
    order: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    orderItem: { findMany: jest.fn() },
    ticketType: { update: jest.fn() },
    $transaction: jest.fn(),
  };

  const mockPayments = {
    createPaymentSession: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PaymentsService, useValue: mockPayments },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createOrder - multi-item', () => {
    it('should create order with multiple ticket types', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.order.findUnique.mockResolvedValue(null);

      const createdOrder = {
        id: 'order-1',
        orderNumber: 'ORD-20261023-ABCD1234',
        userId: 'user-1',
        totalAmount: new Prisma.Decimal(350000),
        paymentStatus: 'PENDING',
        paymentUrl: null,
        idempotencyKey: null,
        requestFingerprint: null,
        orderItems: [
          {
            ticketTypeId: 'tt-a',
            quantity: 1,
            price: new Prisma.Decimal(100000),
            ticketType: mockTicketTypeA,
          },
          {
            ticketTypeId: 'tt-b',
            quantity: 1,
            price: new Prisma.Decimal(250000),
            ticketType: mockTicketTypeB,
          },
        ],
      };

      mockPrisma.$transaction.mockImplementation(
        async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
          mockTx.ticketType.findUnique
            .mockResolvedValueOnce(mockTicketTypeA)
            .mockResolvedValueOnce(mockTicketTypeB);
          mockTx.ticketType.updateMany.mockResolvedValue({ count: 1 });
          mockTx.order.create.mockResolvedValue(createdOrder);
          return cb(mockTx);
        },
      );

      mockPayments.createPaymentSession.mockResolvedValue({
        paymentSessionId: 'ps-1',
        paymentUrl: 'https://pay.xendit.co/test',
      });

      const updatedOrder = {
        ...createdOrder,
        paymentUrl: 'https://pay.xendit.co/test',
        pgTransactionId: 'ps-1',
      };
      mockPrisma.order.update.mockResolvedValue(updatedOrder);

      const result = await service.createOrder('user-1', {
        items: [
          { ticketTypeId: 'tt-a', quantity: 1 },
          { ticketTypeId: 'tt-b', quantity: 1 },
        ],
      });

      expect(result.message).toBe('Order created successfully');
      expect(result.paymentUrl).toBe('https://pay.xendit.co/test');
      expect(mockTx.ticketType.updateMany).toHaveBeenCalledTimes(2);
    });

    it('should reject duplicate ticket types in items', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.order.findUnique.mockResolvedValue(null);

      await expect(
        service.createOrder('user-1', {
          items: [
            { ticketTypeId: 'tt-a', quantity: 1 },
            { ticketTypeId: 'tt-a', quantity: 2 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject ticket types from different events', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.order.findUnique.mockResolvedValue(null);

      const ticketTypeOtherEvent = {
        ...mockTicketTypeB,
        eventId: 'event-2',
        event: { ...mockTicketTypeB.event, id: 'event-2' },
      };

      mockPrisma.$transaction.mockImplementation(
        async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
          mockTx.ticketType.findUnique
            .mockResolvedValueOnce(mockTicketTypeA)
            .mockResolvedValueOnce(ticketTypeOtherEvent);
          return cb(mockTx);
        },
      );

      await expect(
        service.createOrder('user-1', {
          items: [
            { ticketTypeId: 'tt-a', quantity: 1 },
            { ticketTypeId: 'tt-b', quantity: 1 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if ticket type not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.order.findUnique.mockResolvedValue(null);

      mockPrisma.$transaction.mockImplementation(
        async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
          mockTx.ticketType.findUnique.mockResolvedValueOnce(null);
          return cb(mockTx);
        },
      );

      await expect(
        service.createOrder('user-1', {
          items: [{ ticketTypeId: 'tt-nonexist', quantity: 1 }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject unpublished event', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.order.findUnique.mockResolvedValue(null);

      const draftTicket = {
        ...mockTicketTypeA,
        event: { ...mockTicketTypeA.event, status: 'DRAFT' },
      };

      mockPrisma.$transaction.mockImplementation(
        async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
          mockTx.ticketType.findUnique.mockResolvedValueOnce(draftTicket);
          return cb(mockTx);
        },
      );

      await expect(
        service.createOrder('user-1', {
          items: [{ ticketTypeId: 'tt-a', quantity: 1 }],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject ended event', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.order.findUnique.mockResolvedValue(null);

      const endedTicket = {
        ...mockTicketTypeA,
        event: {
          ...mockTicketTypeA.event,
          endDatetime: new Date(Date.now() - 1000),
        },
      };

      mockPrisma.$transaction.mockImplementation(
        async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
          mockTx.ticketType.findUnique.mockResolvedValueOnce(endedTicket);
          return cb(mockTx);
        },
      );

      await expect(
        service.createOrder('user-1', {
          items: [{ ticketTypeId: 'tt-a', quantity: 1 }],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject insufficient quota', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.order.findUnique.mockResolvedValue(null);

      mockPrisma.$transaction.mockImplementation(
        async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
          mockTx.ticketType.findUnique.mockResolvedValueOnce(mockTicketTypeA);
          mockTx.ticketType.updateMany.mockResolvedValue({ count: 0 });
          return cb(mockTx);
        },
      );

      await expect(
        service.createOrder('user-1', {
          items: [{ ticketTypeId: 'tt-a', quantity: 999 }],
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('createOrder - idempotency', () => {
    it('should return existing order on idempotent retry with same fingerprint', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const existingOrder = {
        id: 'order-existing',
        orderNumber: 'ORD-20261023-EXIST',
        userId: 'user-1',
        paymentStatus: 'PENDING',
        paymentUrl: 'https://pay.xendit.co/existing',
        requestFingerprint: expect.any(String),
        idempotencyKey: 'idem-key-1',
        orderItems: [],
      };

      const dto = {
        items: [{ ticketTypeId: 'tt-a', quantity: 2 }],
        idempotencyKey: 'idem-key-1',
      };

      const fingerprint = (service as any).computeFingerprint(dto);
      existingOrder.requestFingerprint = fingerprint;

      mockPrisma.order.findUnique.mockResolvedValue(existingOrder);

      const result = await service.createOrder('user-1', dto);

      expect(result.message).toBe('Order created successfully');
      expect(result.paymentUrl).toBe('https://pay.xendit.co/existing');
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should reject idempotency key reuse with different fingerprint', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const existingOrder = {
        id: 'order-existing',
        orderNumber: 'ORD-20261023-EXIST',
        userId: 'user-1',
        paymentStatus: 'PENDING',
        paymentUrl: 'https://pay.xendit.co/existing',
        requestFingerprint: 'different-fingerprint',
        idempotencyKey: 'idem-key-1',
        orderItems: [],
      };

      mockPrisma.order.findUnique.mockResolvedValue(existingOrder);

      await expect(
        service.createOrder('user-1', {
          items: [{ ticketTypeId: 'tt-a', quantity: 2 }],
          idempotencyKey: 'idem-key-1',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('createOrder - Xendit failure', () => {
    it('should cancel order and restore quota on Xendit failure', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.order.findUnique.mockResolvedValue(null);

      const createdOrder = {
        id: 'order-fail',
        orderNumber: 'ORD-20261023-FAIL',
        userId: 'user-1',
        totalAmount: new Prisma.Decimal(100000),
        paymentStatus: 'PENDING',
        paymentUrl: null,
        idempotencyKey: null,
        requestFingerprint: null,
        orderItems: [
          {
            id: 'oi-1',
            ticketTypeId: 'tt-a',
            quantity: 2,
            price: new Prisma.Decimal(100000),
            ticketType: mockTicketTypeA,
          },
        ],
      };

      const cancelTx = {
        order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        orderItem: {
          findMany: jest.fn().mockResolvedValue(createdOrder.orderItems),
        },
        ticketType: { update: jest.fn().mockResolvedValue({}) },
      };

      mockPrisma.$transaction
        .mockImplementationOnce(
          async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
            mockTx.ticketType.findUnique.mockResolvedValueOnce(mockTicketTypeA);
            mockTx.ticketType.updateMany.mockResolvedValue({ count: 1 });
            mockTx.order.create.mockResolvedValue(createdOrder);
            return cb(mockTx);
          },
        )
        .mockImplementationOnce(
          async (cb: (tx: typeof cancelTx) => Promise<unknown>) => {
            return cb(cancelTx);
          },
        );

      mockPayments.createPaymentSession.mockRejectedValue(
        new Error('Xendit down'),
      );

      await expect(
        service.createOrder('user-1', {
          items: [{ ticketTypeId: 'tt-a', quantity: 2 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createOrder - user not found', () => {
    it('should throw NotFoundException if user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.createOrder('user-missing', {
          items: [{ ticketTypeId: 'tt-a', quantity: 1 }],
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
