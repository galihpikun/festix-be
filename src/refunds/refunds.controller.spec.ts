import { Test, TestingModule } from '@nestjs/testing';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';
import { RefundsAdminController } from './refunds-admin.controller';
import { RefundsWebhookController } from './refunds-webhook.controller';

describe('Refunds Controllers', () => {
  let customerController: RefundsController;
  let adminController: RefundsAdminController;
  let webhookController: RefundsWebhookController;
  let service: any;

  beforeEach(async () => {
    service = {
      createCustomerRefund: jest.fn().mockResolvedValue({ message: 'Success' }),
      getCustomerRefunds: jest.fn().mockResolvedValue({ data: [], meta: {} }),
      getCustomerRefundDetail: jest.fn().mockResolvedValue({ id: 'ref-1' }),
      getAdminRefunds: jest.fn().mockResolvedValue({ data: [], meta: {} }),
      getAdminRefundDetail: jest.fn().mockResolvedValue({ id: 'ref-1' }),
      approveRefund: jest.fn().mockResolvedValue({ message: 'Approved' }),
      rejectRefund: jest.fn().mockResolvedValue({ message: 'Rejected' }),
      handleWebhook: jest.fn().mockResolvedValue({ message: 'Processed' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [
        RefundsController,
        RefundsAdminController,
        RefundsWebhookController,
      ],
      providers: [{ provide: RefundsService, useValue: service }],
    }).compile();

    customerController = module.get<RefundsController>(RefundsController);
    adminController = module.get<RefundsAdminController>(
      RefundsAdminController,
    );
    webhookController = module.get<RefundsWebhookController>(
      RefundsWebhookController,
    );
  });

  it('should route customer createRefund', async () => {
    const req = { user: { userId: 'u-1' } } as any;
    await customerController.createRefund(req, {
      orderId: '00000000-0000-0000-0000-000000000001',
      reason: 'Valid reason',
    });
    expect(service.createCustomerRefund).toHaveBeenCalledWith(
      'u-1',
      expect.any(Object),
    );
  });

  it('should route admin approveRefund', async () => {
    const req = { user: { userId: 'admin-1' } } as any;
    await adminController.approveRefund(req, 'ref-1');
    expect(service.approveRefund).toHaveBeenCalledWith('admin-1', 'ref-1');
  });

  it('should route admin rejectRefund', async () => {
    const req = { user: { userId: 'admin-1' } } as any;
    await adminController.rejectRefund(req, 'ref-1', { reason: 'No' });
    expect(service.rejectRefund).toHaveBeenCalledWith('admin-1', 'ref-1', {
      reason: 'No',
    });
  });

  it('should route webhook handleWebhook', async () => {
    await webhookController.handleWebhook('tok-1', {
      event: 'refund.succeeded',
    });
    expect(service.handleWebhook).toHaveBeenCalledWith('tok-1', {
      event: 'refund.succeeded',
    });
  });
});
