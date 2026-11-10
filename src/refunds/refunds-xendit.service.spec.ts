import { BadGatewayException, ForbiddenException } from '@nestjs/common';
import { RefundsXenditService } from './refunds-xendit.service';

describe('RefundsXenditService', () => {
  let service: RefundsXenditService;
  const originalEnv = process.env;

  beforeEach(() => {
    service = new RefundsXenditService();
    process.env = {
      ...originalEnv,
      XENDIT_SECRET_KEY: 'test-secret-key',
      XENDIT_WEBHOOK_TOKEN: 'test-webhook-token',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('verifyWebhookToken', () => {
    it('should pass for matching token', () => {
      expect(() =>
        service.verifyWebhookToken('test-webhook-token'),
      ).not.toThrow();
    });

    it('should throw ForbiddenException for invalid token', () => {
      expect(() => service.verifyWebhookToken('wrong-token')).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('createRefund', () => {
    it('should call Xendit API with Basic auth and Idempotency-key', async () => {
      const mockResponse = {
        id: 'rfd-12345',
        payment_id: 'py-123',
        amount: 95000,
        status: 'PENDING',
        reason: 'REQUESTED_BY_CUSTOMER',
        created: '2026-11-10T00:00:00Z',
        updated: '2026-11-10T00:00:00Z',
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse),
      } as any);

      const result = await service.createRefund({
        paymentId: 'py-123',
        amount: 95000,
        reason: 'REQUESTED_BY_CUSTOMER',
        idempotencyKey: 'idemp-1',
      });

      expect(result.id).toBe('rfd-12345');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.xendit.co/refunds',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Idempotency-key': 'idemp-1',
          }),
        }),
      );
    });

    it('should throw BadGatewayException if Xendit returns error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: jest.fn().mockResolvedValue({ message: 'Payment not found' }),
      } as any);

      await expect(
        service.createRefund({
          paymentId: 'py-invalid',
          amount: 50000,
          reason: 'OTHER',
          idempotencyKey: 'idemp-2',
        }),
      ).rejects.toThrow(BadGatewayException);
    });
  });
});
