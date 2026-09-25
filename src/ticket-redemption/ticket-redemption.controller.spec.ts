import { Test, TestingModule } from '@nestjs/testing';
import { TicketRedemptionController } from './ticket-redemption.controller';
import { TicketRedemptionService } from './ticket-redemption.service';

describe('TicketRedemptionController', () => {
  let controller: TicketRedemptionController;

  const mockService = {
    lookupTicket: jest.fn(),
    redeemTicket: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TicketRedemptionController],
      providers: [
        {
          provide: TicketRedemptionService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<TicketRedemptionController>(
      TicketRedemptionController,
    );
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate lookupTicket to service', async () => {
    const req = { user: { userId: 'staff-1' } } as any;
    const dto = { ticketCode: 'TCK-TEST' };
    const expected = { ticketCode: 'TCK-TEST' };
    mockService.lookupTicket.mockResolvedValue(expected);

    const result = await controller.lookupTicket(req, dto);

    expect(result).toEqual(expected);
    expect(mockService.lookupTicket).toHaveBeenCalledWith('staff-1', dto);
  });

  it('should delegate redeemTicket to service', async () => {
    const req = { user: { userId: 'staff-1' } } as any;
    const dto = { ticketCode: 'TCK-TEST' };
    const expected = { message: 'Ticket redeemed successfully' };
    mockService.redeemTicket.mockResolvedValue(expected);

    const result = await controller.redeemTicket(req, dto);

    expect(result).toEqual(expected);
    expect(mockService.redeemTicket).toHaveBeenCalledWith('staff-1', dto);
  });
});
