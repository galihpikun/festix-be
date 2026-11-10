import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

export type XenditRefundRequestPayload = {
  paymentId: string;
  amount: number;
  reason: string;
  idempotencyKey: string;
  metadata?: Record<string, any>;
};

export type XenditRefundResponse = {
  id: string;
  payment_id: string;
  amount: number;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  reason: string;
  created: string;
  updated: string;
};

@Injectable()
export class RefundsXenditService {
  private readonly baseUrl = 'https://api.xendit.co';

  private getSecretKey(): string {
    const key = process.env.XENDIT_SECRET_KEY;
    if (!key) {
      throw new BadRequestException('XENDIT_SECRET_KEY is not configured');
    }
    return key;
  }

  getWebhookToken(): string {
    const token = process.env.XENDIT_WEBHOOK_TOKEN;
    if (!token) {
      throw new BadRequestException('XENDIT_WEBHOOK_TOKEN is not configured');
    }
    return token;
  }

  verifyWebhookToken(receivedToken: string): void {
    const expected = this.getWebhookToken();
    if (receivedToken !== expected) {
      throw new ForbiddenException('Invalid webhook verification token');
    }
  }

  async createRefund(
    payload: XenditRefundRequestPayload,
  ): Promise<XenditRefundResponse> {
    const secretKey = this.getSecretKey();
    const authHeader = Buffer.from(`${secretKey}:`).toString('base64');

    const body: Record<string, any> = {
      payment_id: payload.paymentId,
      amount: payload.amount,
      reason: payload.reason || 'REQUESTED_BY_CUSTOMER',
    };

    if (payload.metadata) {
      body.metadata = payload.metadata;
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/refunds`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${authHeader}`,
          'Idempotency-key': payload.idempotencyKey,
        },
        body: JSON.stringify(body),
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Network error';
      throw new BadGatewayException(
        `Failed to reach Xendit refund gateway: ${msg}`,
      );
    }

    const data = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!response.ok) {
      const errorMsg =
        (typeof data?.message === 'string' && data.message) ||
        (typeof data?.error_code === 'string' && data.error_code) ||
        `Xendit refund request rejected with status ${response.status}`;
      throw new BadGatewayException(errorMsg);
    }

    if (!data?.id || typeof data.id !== 'string') {
      throw new BadGatewayException('Xendit refund response missing refund ID');
    }

    return data as unknown as XenditRefundResponse;
  }
}
