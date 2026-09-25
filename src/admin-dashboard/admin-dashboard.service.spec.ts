import { Test, TestingModule } from '@nestjs/testing';
import { AdminDashboardService } from './admin-dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AdminDashboardService', () => {
  let service: AdminDashboardService;

  const mockPrisma = {
    user: {
      count: jest.fn(),
    },
    organizerProfile: {
      count: jest.fn(),
    },
    event: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    ticketType: {
      count: jest.fn(),
    },
    order: {
      count: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    issuedTicket: {
      count: jest.fn(),
    },
    category: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminDashboardService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<AdminDashboardService>(AdminDashboardService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return aggregated dashboard data conforming to specifications', async () => {
    mockPrisma.user.count.mockResolvedValue(50);
    mockPrisma.organizerProfile.count.mockResolvedValue(10);
    mockPrisma.event.count
      .mockResolvedValueOnce(20) // totalEvents
      .mockResolvedValueOnce(15) // publishedEvents
      .mockResolvedValueOnce(3); // pendingEvents

    mockPrisma.ticketType.count.mockResolvedValue(30);
    mockPrisma.order.count
      .mockResolvedValueOnce(100) // totalOrders
      .mockResolvedValueOnce(80); // paidOrdersCount

    // totalIssuedTickets: 200, totalRedeemedTickets: 120
    // redeemedTickets: 120, unredeemedTickets: 70, cancelledTickets: 10
    mockPrisma.issuedTicket.count
      .mockResolvedValueOnce(200) // totalIssuedTickets
      .mockResolvedValueOnce(120) // totalRedeemedTickets
      .mockResolvedValueOnce(120) // redeemed
      .mockResolvedValueOnce(70) // unredeemed
      .mockResolvedValueOnce(10); // cancelled

    mockPrisma.event.groupBy.mockResolvedValue([
      { status: 'PUBLISHED', _count: { _all: 15 } },
      { status: 'PENDING_REVIEW', _count: { _all: 3 } },
      { status: 'DRAFT', _count: { _all: 2 } },
    ]);

    mockPrisma.category.findMany.mockResolvedValue([
      { name: 'Festival', _count: { events: 10 } },
      { name: 'Music', _count: { events: 10 } },
    ]);

    mockPrisma.order.groupBy.mockResolvedValue([
      { paymentStatus: 'PAID', _count: { _all: 80 } },
      { paymentStatus: 'PENDING', _count: { _all: 15 } },
      { paymentStatus: 'FAILED', _count: { _all: 5 } },
    ]);

    mockPrisma.order.aggregate.mockResolvedValue({
      _sum: {
        totalAmount: 15000000,
      },
    });

    const now = new Date();
    mockPrisma.order.findMany
      .mockResolvedValueOnce([
        {
          createdAt: now,
          totalAmount: 500000,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'ord-1',
          orderNumber: 'ORD-2026-001',
          totalAmount: 500000,
          paymentStatus: 'PAID',
          createdAt: now,
          user: {
            fullName: 'Jane Doe',
            email: 'jane@example.com',
          },
        },
      ]);

    mockPrisma.event.findMany.mockResolvedValue([
      {
        id: 'evt-1',
        title: 'Summer Fest',
        status: 'PUBLISHED',
        createdAt: now,
        organizer: {
          fullName: 'John Doe',
          organizerProfile: {
            organizationName: 'Sound Org',
          },
        },
        category: {
          name: 'Music',
        },
      },
    ]);

    const result = await service.getDashboardData();

    expect(result.summary).toEqual({
      totalUsers: 50,
      totalOrganizers: 10,
      totalEvents: 20,
      publishedEvents: 15,
      pendingEvents: 3,
      totalTicketTypes: 30,
      totalOrders: 100,
      paidOrders: 80,
      totalIssuedTickets: 200,
      totalRedeemedTickets: 120,
    });

    expect(result.events.byStatus).toEqual([
      { status: 'PUBLISHED', count: 15 },
      { status: 'PENDING_REVIEW', count: 3 },
      { status: 'DRAFT', count: 2 },
    ]);
    expect(result.events.byCategory).toEqual([
      { category: 'Festival', count: 10 },
      { category: 'Music', count: 10 },
    ]);

    expect(result.orders.byStatus).toEqual([
      { status: 'PAID', count: 80 },
      { status: 'PENDING', count: 15 },
      { status: 'FAILED', count: 5 },
    ]);
    expect(result.orders.totalRevenue).toBe(15000000);
    expect(result.orders.monthly.length).toBe(6);

    expect(result.tickets).toEqual({
      total: 200,
      redeemed: 120,
      unredeemed: 70,
      cancelled: 10,
    });

    expect(result.recent.events[0]).toEqual({
      id: 'evt-1',
      title: 'Summer Fest',
      status: 'PUBLISHED',
      createdAt: now,
      organizerName: 'Sound Org',
      categoryName: 'Music',
    });

    expect(result.recent.orders[0]).toEqual({
      id: 'ord-1',
      orderNumber: 'ORD-2026-001',
      totalAmount: 500000,
      paymentStatus: 'PAID',
      createdAt: now,
      purchaserName: 'Jane Doe',
      purchaserEmail: 'jane@example.com',
    });

    expect(mockPrisma.order.aggregate).toHaveBeenCalledWith({
      where: {
        paymentStatus: 'PAID',
      },
      _sum: {
        totalAmount: true,
      },
    });
  });
});
