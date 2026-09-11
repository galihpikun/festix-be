import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Order, User } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PaymentSessionResponse = {
  payment_session_id?: string;
  id?: string;
  payment_link_url?: string;
};

type WebhookBody = {
  event?: string;
  type?: string;
  id?: string;
  payment_session_id?: string;
  reference_id?: string;
  referenceId?: string;
  metadata?: {
    orderId?: string;
    orderNumber?: string;
  };
  data?: {
    id?: string;
    payment_session_id?: string;
    reference_id?: string;
    referenceId?: string;
    metadata?: {
      orderId?: string;
      orderNumber?: string;
    };
  };
};

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async createPaymentSession(order: Order, user: User) {
    const secretKey = process.env.XENDIT_SECRET_KEY;

    if (!secretKey) {
      throw new BadRequestException('Xendit secret key is not configured');
    }

    const response = await fetch('https://api.xendit.co/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reference_id: order.orderNumber,
        session_type: 'PAY',
        mode: 'PAYMENT_LINK',
        amount: Number(order.totalAmount),
        currency: 'IDR',
        country: 'ID',
        capture_method: 'AUTOMATIC',
        expires_at: order.expiresAt.toISOString(),
        description: `Payment for order ${order.orderNumber}`,
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
        },
        customer: {
          reference_id: `${user.id.replace(/-/g, '')}${order.id.replace(/-/g, '')}`,
          type: 'INDIVIDUAL',
          email: user.email,
          individual_detail: {
            given_names: user.fullName,
          },
        },
      }),
    });

    if (!response.ok) {
      const errorResponse = await response.text();

      console.error('Xendit payment session error', {
        status: response.status,
        body: errorResponse,
      });

      throw new BadRequestException('Failed to create Xendit payment session');
    }

    const paymentSession = (await response.json()) as PaymentSessionResponse;
    const paymentSessionId =
      paymentSession.payment_session_id ?? paymentSession.id;

    if (!paymentSessionId || !paymentSession.payment_link_url) {
      throw new BadRequestException('Invalid Xendit payment session response');
    }

    return {
      paymentSessionId,
      paymentUrl: paymentSession.payment_link_url,
    };
  }

  async handleWebhook(token: string, body: unknown) {
    if (token !== process.env.XENDIT_WEBHOOK_TOKEN) {
      throw new ForbiddenException('Invalid webhook token');
    }

    const webhookBody = this.parseWebhookBody(body);
    const event = webhookBody.event ?? webhookBody.type;

    if (event === 'payment_session.completed') {
      return this.handlePaymentCompleted(webhookBody);
    }

    if (event === 'payment_session.expired') {
      return this.handlePaymentExpired(webhookBody);
    }

    return {
      message: 'Webhook received',
    };
  }

  private async handlePaymentCompleted(body: WebhookBody) {
    const order = await this.findOrderFromWebhook(body);

    if (order.paymentStatus === 'PAID' || order.paymentStatus === 'EXPIRED') {
      return {
        message: 'Payment webhook already processed',
      };
    }

    const paymentSessionId = this.getPaymentSessionId(body);

    await this.prisma.order.updateMany({
      where: {
        id: order.id,
        paymentStatus: 'PENDING',
      },
      data: {
        paymentStatus: 'PAID',
        ...(paymentSessionId && {
          pgTransactionId: paymentSessionId,
        }),
      },
    });

    return {
      message: 'Payment completed',
    };
  }

  private async handlePaymentExpired(body: WebhookBody) {
    const order = await this.findOrderFromWebhook(body);

    if (order.paymentStatus === 'PAID' || order.paymentStatus === 'EXPIRED') {
      return {
        message: 'Payment webhook already processed',
      };
    }

    await this.prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.updateMany({
        where: {
          id: order.id,
          paymentStatus: 'PENDING',
        },
        data: {
          paymentStatus: 'EXPIRED',
        },
      });

      if (updatedOrder.count === 0) {
        return;
      }

      const orderItems = await tx.orderItem.findMany({
        where: {
          orderId: order.id,
        },
      });

      for (const orderItem of orderItems) {
        await tx.ticketType.update({
          where: {
            id: orderItem.ticketTypeId,
          },
          data: {
            availableQuota: {
              increment: orderItem.quantity,
            },
          },
        });
      }
    });

    return {
      message: 'Payment expired',
    };
  }

  private async findOrderFromWebhook(body: WebhookBody) {
    const paymentData = body.data;
    const orderId = paymentData?.metadata?.orderId ?? body.metadata?.orderId;
    const orderNumber =
      paymentData?.reference_id ??
      paymentData?.referenceId ??
      body.reference_id ??
      body.referenceId ??
      paymentData?.metadata?.orderNumber ??
      body.metadata?.orderNumber;

    if (!orderId && !orderNumber) {
      throw new BadRequestException('Order reference is required');
    }

    const order = orderId
      ? await this.prisma.order.findUnique({
          where: {
            id: orderId,
          },
        })
      : await this.prisma.order.findUnique({
          where: {
            orderNumber,
          },
        });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  private getPaymentSessionId(body: WebhookBody) {
    const paymentData = body.data;

    return (
      paymentData?.payment_session_id ??
      paymentData?.id ??
      body.payment_session_id ??
      body.id
    );
  }

  private parseWebhookBody(body: unknown): WebhookBody {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Invalid webhook body');
    }

    return body;
  }
}
