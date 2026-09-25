import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TicketRedemptionService } from './ticket-redemption.service';

describe('TicketRedemptionService', () => {
  let service: TicketRedemptionService;

  const mockPrisma = {
    issuedTicket: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    eventStaff: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketRedemptionService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<TicketRedemptionService>(TicketRedemptionService);
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((callback) =>
      callback(mockPrisma),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  const staffUserId = 'staff-user-1';
  const dto = { ticketCode: 'TCK-ABCD-1234ABCD' };

  const mockTicketWithStaff = {
    id: 'ticket-1',
    ticketCode: 'TCK-ABCD-1234ABCD',
    isRedeemed: false,
    isCancelled: false,
    redeemedAt: null,
    createdAt: new Date(),
    orderItem: {
      ticketType: {
        id: 'tt-1',
        name: 'VIP',
        price: 100000,
        eventId: 'event-1',
        event: {
          id: 'event-1',
          title: 'Test Event',
          location: 'Jakarta',
          startDatetime: new Date(),
          endDatetime: new Date(),
          staffs: [{ userId: staffUserId, eventId: 'event-1' }],
        },
      },
      order: {
        paymentStatus: 'PAID',
        user: {
          id: 'user-1',
          fullName: 'John Doe',
          email: 'john@example.com',
        },
      },
    },
  };

  describe('lookupTicket', () => {
    it('should return ticket info for assigned staff', async () => {
      mockPrisma.issuedTicket.findUnique.mockResolvedValue(mockTicketWithStaff);

      const result = await service.lookupTicket(staffUserId, dto);

      expect(result.ticketCode).toBe('TCK-ABCD-1234ABCD');
      expect(result.event.id).toBe('event-1');
      expect(result.owner.fullName).toBe('John Doe');
    });

    it('should throw NotFoundException if ticket does not exist', async () => {
      mockPrisma.issuedTicket.findUnique.mockResolvedValue(null);

      await expect(service.lookupTicket(staffUserId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if order is not paid', async () => {
      mockPrisma.issuedTicket.findUnique.mockResolvedValue({
        ...mockTicketWithStaff,
        orderItem: {
          ...mockTicketWithStaff.orderItem,
          order: {
            ...mockTicketWithStaff.orderItem.order,
            paymentStatus: 'PENDING',
          },
        },
      });

      await expect(service.lookupTicket(staffUserId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if staff is not assigned to event', async () => {
      mockPrisma.issuedTicket.findUnique.mockResolvedValue({
        ...mockTicketWithStaff,
        orderItem: {
          ...mockTicketWithStaff.orderItem,
          ticketType: {
            ...mockTicketWithStaff.orderItem.ticketType,
            event: {
              ...mockTicketWithStaff.orderItem.ticketType.event,
              staffs: [],
            },
          },
        },
      });

      await expect(service.lookupTicket(staffUserId, dto)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('redeemTicket', () => {
    const mockTicketForRedeem = {
      id: 'ticket-1',
      ticketCode: 'TCK-ABCD-1234ABCD',
      isRedeemed: false,
      isCancelled: false,
      redeemedAt: null,
      orderItem: {
        ticketType: {
          eventId: 'event-1',
        },
        order: {
          paymentStatus: 'PAID',
        },
      },
    };

    it('should redeem a valid ticket successfully', async () => {
      mockPrisma.issuedTicket.findUnique
        .mockResolvedValueOnce(mockTicketForRedeem)
        .mockResolvedValueOnce({
          ...mockTicketForRedeem,
          isRedeemed: true,
          redeemedAt: new Date(),
        });
      mockPrisma.eventStaff.findUnique.mockResolvedValue({
        eventId: 'event-1',
        userId: staffUserId,
      });
      mockPrisma.issuedTicket.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.redeemTicket(staffUserId, dto);

      expect(result.message).toBe('Ticket redeemed successfully');
      expect(mockPrisma.issuedTicket.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'ticket-1',
          isRedeemed: false,
          isCancelled: false,
        },
        data: {
          isRedeemed: true,
          redeemedAt: expect.any(Date),
        },
      });
    });

    it('should throw NotFoundException if ticket does not exist', async () => {
      mockPrisma.issuedTicket.findUnique.mockResolvedValue(null);

      await expect(service.redeemTicket(staffUserId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if order is not paid', async () => {
      mockPrisma.issuedTicket.findUnique.mockResolvedValue({
        ...mockTicketForRedeem,
        orderItem: {
          ...mockTicketForRedeem.orderItem,
          order: { paymentStatus: 'PENDING' },
        },
      });

      await expect(service.redeemTicket(staffUserId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if staff is not assigned to event', async () => {
      mockPrisma.issuedTicket.findUnique.mockResolvedValue(mockTicketForRedeem);
      mockPrisma.eventStaff.findUnique.mockResolvedValue(null);

      await expect(service.redeemTicket(staffUserId, dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ConflictException if ticket is cancelled', async () => {
      mockPrisma.issuedTicket.findUnique.mockResolvedValue({
        ...mockTicketForRedeem,
        isCancelled: true,
      });
      mockPrisma.eventStaff.findUnique.mockResolvedValue({
        eventId: 'event-1',
        userId: staffUserId,
      });

      await expect(service.redeemTicket(staffUserId, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException if ticket is already redeemed', async () => {
      mockPrisma.issuedTicket.findUnique.mockResolvedValue({
        ...mockTicketForRedeem,
        isRedeemed: true,
        redeemedAt: new Date(),
      });
      mockPrisma.eventStaff.findUnique.mockResolvedValue({
        eventId: 'event-1',
        userId: staffUserId,
      });

      await expect(service.redeemTicket(staffUserId, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException on concurrent double redemption', async () => {
      mockPrisma.issuedTicket.findUnique.mockResolvedValue(mockTicketForRedeem);
      mockPrisma.eventStaff.findUnique.mockResolvedValue({
        eventId: 'event-1',
        userId: staffUserId,
      });
      mockPrisma.issuedTicket.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.redeemTicket(staffUserId, dto)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
