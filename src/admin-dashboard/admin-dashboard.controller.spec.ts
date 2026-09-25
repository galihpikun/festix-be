import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { RoleGuard } from '../auth/guards/role.guard';

describe('AdminDashboardController', () => {
  let controller: AdminDashboardController;
  let roleGuard: RoleGuard;
  let reflector: Reflector;

  const mockDashboardData = {
    summary: {
      totalUsers: 10,
      totalOrganizers: 3,
      totalEvents: 5,
      publishedEvents: 3,
      pendingEvents: 1,
      totalTicketTypes: 6,
      totalOrders: 15,
      paidOrders: 10,
      totalIssuedTickets: 25,
      totalRedeemedTickets: 12,
    },
    events: {
      byStatus: [{ status: 'PUBLISHED', count: 3 }],
      byCategory: [{ category: 'Music', count: 3 }],
    },
    orders: {
      byStatus: [{ status: 'PAID', count: 10 }],
      totalRevenue: 500000,
      monthly: [{ month: '2026-09', orders: 10, revenue: 500000 }],
    },
    tickets: {
      total: 25,
      redeemed: 12,
      unredeemed: 10,
      cancelled: 3,
    },
    recent: {
      events: [],
      orders: [],
    },
  };

  const mockDashboardService = {
    getDashboardData: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminDashboardController],
      providers: [
        {
          provide: AdminDashboardService,
          useValue: mockDashboardService,
        },
        Reflector,
        RoleGuard,
      ],
    }).compile();

    controller = module.get<AdminDashboardController>(AdminDashboardController);
    roleGuard = module.get<RoleGuard>(RoleGuard);
    reflector = module.get<Reflector>(Reflector);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return dashboard data when getDashboard is called', async () => {
    mockDashboardService.getDashboardData.mockResolvedValue(mockDashboardData);

    const result = await controller.getDashboard();

    expect(result).toEqual(mockDashboardData);
    expect(mockDashboardService.getDashboardData).toHaveBeenCalled();
  });

  describe('RoleGuard protection', () => {
    it('should allow user with ADMIN role', () => {
      const handler = () => controller.getDashboard();
      const mockExecutionContext = {
        getHandler: () => handler,
        getClass: () => AdminDashboardController,
        switchToHttp: () => ({
          getRequest: () => ({
            user: { role: 'ADMIN', userId: 'admin-1' },
          }),
        }),
      } as unknown as ExecutionContext;

      jest.spyOn(reflector, 'get').mockReturnValue(['ADMIN']);

      const canActivate = roleGuard.canActivate(mockExecutionContext);
      expect(canActivate).toBe(true);
    });

    it('should reject non-admin users with ForbiddenException', () => {
      const handler = () => controller.getDashboard();
      const mockExecutionContext = {
        getHandler: () => handler,
        getClass: () => AdminDashboardController,
        switchToHttp: () => ({
          getRequest: () => ({
            user: { role: 'USER', userId: 'user-1' },
          }),
        }),
      } as unknown as ExecutionContext;

      jest.spyOn(reflector, 'get').mockReturnValue(['ADMIN']);

      expect(() => roleGuard.canActivate(mockExecutionContext)).toThrow(
        ForbiddenException,
      );
    });
  });
});
