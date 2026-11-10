import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RefundsService } from './refunds.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { RefundsCalculator } from './refunds.calculator';
import { RefundsXenditService } from './refunds-xendit.service';
import {
  Prisma,
  RefundStatus,
  RefundType,
} from '../../generated/prisma/client';

describe('RefundsService', () => {
  let service: RefundsService;
  let prisma: any;
  let auditLogs: any;
  let calculator: RefundsCalculator;
  let xenditService: any;

  beforeEach(async () => {
    prisma = {
      order: {
        findUnique: jest.fn(),
      },
      refund: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      event: {
        findUnique: jest.fn(),
      },
      ticketType: {
        update: jest.fn(),
      },
      issuedTicket: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    auditLogs = {
      log: jest.fn().mockResolvedValue({ id: 'log-1' }),
    };

    xenditService = {
      verifyWebhookToken: jest.fn(),
      createRefund: jest.fn(),
    };

    calculator = new RefundsCalculator();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogs },
        { provide: RefundsCalculator, useValue: calculator },
        { provide: RefundsXenditService, useValue: xenditService },
      ],
    }).compile();

    service = module.get<RefundsService>(RefundsService);
  });

  describe('createCustomerRefund', () => {
    const mockOrder = {
      id: 'order-1',
      userId: 'user-1',
      paymentStatus: 'PAID',
      totalAmount: new Prisma.Decimal('100000'),
      orderItems: [
        {
          id: 'item-1',
          price: new Prisma.Decimal('50000'),
          quantity: 2,
          ticketType: {
            id: 'tt-1',
            eventId: 'event-1',
            event: {
              id: 'event-1',
              title: 'Test Concert',
              isRefundable: true,
              status: 'PUBLISHED',
              startDatetime: new Date(Date.now() + 86400000 * 5), // 5 days in future
            },
          },
          issuedTickets: [
            { id: 't-1', isRedeemed: false, isRefunded: false },
            { id: 't-2', isRedeemed: false, isRefunded: false },
          ],
        },
      ],
    };

    it('should throw NotFoundException if order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      await expect(
        service.createCustomerRefund('user-1', {
          orderId: 'order-1',
          reason: 'Cannot attend',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not order owner', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        userId: 'other-user',
      });
      await expect(
        service.createCustomerRefund('user-1', {
          orderId: 'order-1',
          reason: 'Cannot attend',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if order is not PAID', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        paymentStatus: 'PENDING',
      });
      await expect(
        service.createCustomerRefund('user-1', {
          orderId: 'order-1',
          reason: 'Cannot attend',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if event is non-refundable', async () => {
      const nonRefundableOrder = {
        ...mockOrder,
        orderItems: [
          {
            ...mockOrder.orderItems[0],
            ticketType: {
              ...mockOrder.orderItems[0].ticketType,
              event: {
                ...mockOrder.orderItems[0].ticketType.event,
                isRefundable: false,
              },
            },
          },
        ],
      };
      prisma.order.findUnique.mockResolvedValue(nonRefundableOrder);

      await expect(
        service.createCustomerRefund('user-1', {
          orderId: 'order-1',
          reason: 'Cannot attend',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if any ticket is redeemed', async () => {
      const redeemedOrder = {
        ...mockOrder,
        orderItems: [
          {
            ...mockOrder.orderItems[0],
            issuedTickets: [
              { id: 't-1', isRedeemed: true, isRefunded: false },
              { id: 't-2', isRedeemed: false, isRefunded: false },
            ],
          },
        ],
      };
      prisma.order.findUnique.mockResolvedValue(redeemedOrder);

      await expect(
        service.createCustomerRefund('user-1', {
          orderId: 'order-1',
          reason: 'Cannot attend',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create refund with 5% deduction and 95% payout', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.refund.findFirst.mockResolvedValue(null);
      prisma.refund.findMany.mockResolvedValue([]);
      prisma.refund.create.mockResolvedValue({
        id: 'refund-1',
        orderId: 'order-1',
        eventId: 'event-1',
        originalAmount: new Prisma.Decimal('100000.00'),
        deductionAmount: new Prisma.Decimal('5000.00'),
        amount: new Prisma.Decimal('95000.00'),
        status: RefundStatus.PENDING_APPROVAL,
        createdAt: new Date(),
        event: { id: 'event-1', title: 'Test Concert' },
      });

      const result = await service.createCustomerRefund('user-1', {
        orderId: 'order-1',
        reason: 'Cannot attend due to work',
      });

      expect(result.message).toBe('Refund request submitted successfully');
      expect(result.refunds[0].amount.toNumber()).toBe(95000);
      expect(prisma.refund.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: RefundStatus.PENDING_APPROVAL,
            type: RefundType.CUSTOMER_REQUEST,
          }),
        }),
      );
      expect(auditLogs.log).toHaveBeenCalledWith(
        'user-1',
        'REQUEST_REFUND',
        'Refund',
        'refund-1',
        expect.any(Object),
        expect.anything(),
      );
    });
  });

  describe('rejectRefund', () => {
    it('should set status REJECTED and store adminReason', async () => {
      prisma.refund.findUnique.mockResolvedValue({
        id: 'refund-1',
        status: RefundStatus.PENDING_APPROVAL,
      });
      prisma.refund.updateMany.mockResolvedValue({ count: 1 });

      await service.rejectRefund('admin-1', 'refund-1', {
        reason: 'Invalid request',
      });

      expect(prisma.refund.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'refund-1', status: RefundStatus.PENDING_APPROVAL },
          data: expect.objectContaining({
            status: RefundStatus.REJECTED,
            adminReason: 'Invalid request',
            rejectedById: 'admin-1',
          }),
        }),
      );
    });
  });

  describe('webhook refund.succeeded', () => {
    it('should mark tickets refunded and restore quota', async () => {
      const mockRefund = {
        id: 'refund-1',
        orderId: 'order-1',
        eventId: 'event-1',
        amount: new Prisma.Decimal('95000'),
        status: RefundStatus.PROCESSING,
        order: {
          orderItems: [
            {
              ticketTypeId: 'tt-1',
              quantity: 2,
              ticketType: { eventId: 'event-1' },
              issuedTickets: [{ id: 't-1', isRefunded: false }],
            },
          ],
        },
      };

      prisma.refund.findFirst.mockResolvedValue(mockRefund);
      prisma.refund.updateMany.mockResolvedValue({ count: 1 });
      prisma.issuedTicket.updateMany.mockResolvedValue({ count: 1 });
      prisma.ticketType.update.mockResolvedValue({});

      await service.handleWebhook('token', {
        event: 'refund.succeeded',
        data: { id: 'rfd-123' },
      });

      expect(prisma.issuedTicket.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isRefunded: true,
            isCancelled: true,
          }),
        }),
      );

      expect(prisma.ticketType.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tt-1' },
          data: { availableQuota: { increment: 2 } },
        }),
      );
    });
  });
});
