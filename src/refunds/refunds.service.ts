import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { RefundsCalculator } from './refunds.calculator';
import { RefundsXenditService } from './refunds-xendit.service';
import { CreateCustomerRefundDto } from './dto/create-customer-refund.dto';
import { QueryCustomerRefundsDto } from './dto/query-customer-refunds.dto';
import { QueryAdminRefundsDto } from './dto/query-admin-refunds.dto';
import { RejectRefundDto } from './dto/reject-refund.dto';
import { buildPaginatedResponse } from '../shared/helpers/paginate';
import {
  Event,
  IssuedTicket,
  Order,
  OrderItem,
  Prisma,
  Refund,
  RefundStatus,
  RefundType,
  TicketType,
} from '../../generated/prisma/client';
import { REFUND_CALENDAR_TIMEZONE } from './refunds.constants';

type OrderItemWithDetails = OrderItem & {
  ticketType: TicketType & {
    event: Event;
  };
  issuedTickets: IssuedTicket[];
};

type RefundWithOrderDetails = Refund & {
  order: Order & {
    orderItems: (OrderItem & {
      ticketType: TicketType;
      issuedTickets: IssuedTicket[];
    })[];
  };
};

type CreatedRefundRecord = Refund & {
  event: {
    id: string;
    title: string;
  };
};

type AutoRefundJob = {
  refundId: string;
  paymentId: string | null;
  amount: number;
  reason: string;
  idempotencyKey: string | null;
};

@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly calculator: RefundsCalculator,
    private readonly xenditService: RefundsXenditService,
  ) {}

  private getEventCalendarDateString(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: REFUND_CALENDAR_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  // ==========================================
  // CUSTOMER WORKFLOW
  // ==========================================

  async createCustomerRefund(userId: string, dto: CreateCustomerRefundDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        orderItems: {
          include: {
            ticketType: {
              include: {
                event: true,
              },
            },
            issuedTickets: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.userId !== userId) {
      throw new ForbiddenException('You do not own this order');
    }

    if (order.paymentStatus !== 'PAID') {
      throw new BadRequestException('Only paid orders can be refunded');
    }

    if (!order.orderItems || order.orderItems.length === 0) {
      throw new BadRequestException('Order does not have any items');
    }

    // Group order items by event
    const itemsByEvent = new Map<string, OrderItemWithDetails[]>();
    for (const item of order.orderItems) {
      const eventId = item.ticketType.event.id;
      const group = itemsByEvent.get(eventId) || [];
      group.push(item);
      itemsByEvent.set(eventId, group);
    }

    const now = new Date();
    const todayCalendarStr = this.getEventCalendarDateString(now);

    const createdRefunds: CreatedRefundRecord[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const [, items] of itemsByEvent.entries()) {
        const event = items[0].ticketType.event;

        if (!event.isRefundable) {
          throw new BadRequestException(
            `Event "${event.title}" is marked as non-refundable`,
          );
        }

        if (event.status === 'CANCELLED') {
          throw new BadRequestException(
            `Event "${event.title}" is cancelled and will be refunded automatically`,
          );
        }

        // Calendar date restriction
        const eventStartCalendarStr = this.getEventCalendarDateString(
          event.startDatetime,
        );
        if (todayCalendarStr >= eventStartCalendarStr) {
          throw new BadRequestException(
            `Refund requests for "${event.title}" must be submitted before the event's calendar date`,
          );
        }

        if (now >= event.startDatetime) {
          throw new BadRequestException(
            `Event "${event.title}" has already started`,
          );
        }

        // Check tickets eligibility
        const allIssuedTickets = items.flatMap((i) => i.issuedTickets);
        const hasRedeemed = allIssuedTickets.some((t) => t.isRedeemed);
        if (hasRedeemed) {
          throw new BadRequestException(
            `Cannot request refund for "${event.title}": one or more tickets have already been redeemed`,
          );
        }

        const hasAlreadyRefunded = allIssuedTickets.some((t) => t.isRefunded);
        if (hasAlreadyRefunded) {
          throw new ConflictException(
            `Tickets for "${event.title}" have already been refunded`,
          );
        }

        // Check for existing active refund for this order and event
        const existingRefund = await tx.refund.findFirst({
          where: {
            orderId: order.id,
            eventId: event.id,
            status: {
              in: [
                RefundStatus.PENDING_APPROVAL,
                RefundStatus.APPROVED,
                RefundStatus.PROCESSING,
                RefundStatus.SUCCEEDED,
              ],
            },
          },
        });

        if (existingRefund) {
          throw new ConflictException(
            `A refund request for "${event.title}" is already active or completed`,
          );
        }

        // Calculate event eligible paid amount
        const eligibleAmount = items.reduce(
          (sum, i) => sum.add(new Prisma.Decimal(i.price).mul(i.quantity)),
          new Prisma.Decimal(0),
        );

        const calculation =
          this.calculator.calculateCustomerRefund(eligibleAmount);

        // Check cumulative refunds on order
        const pastRefunds = await tx.refund.findMany({
          where: {
            orderId: order.id,
            status: { in: [RefundStatus.PROCESSING, RefundStatus.SUCCEEDED] },
          },
          select: { amount: true },
        });
        const cumulativeSum = pastRefunds.reduce(
          (acc, r) => acc.add(r.amount),
          new Prisma.Decimal(0),
        );
        this.calculator.validateCumulativeRefund(
          cumulativeSum,
          calculation.refundAmount,
          order.totalAmount,
        );

        const refund = await tx.refund.create({
          data: {
            orderId: order.id,
            eventId: event.id,
            requestedById: userId,
            type: RefundType.CUSTOMER_REQUEST,
            status: RefundStatus.PENDING_APPROVAL,
            originalAmount: calculation.originalAmount,
            deductionAmount: calculation.deductionAmount,
            amount: calculation.refundAmount,
            reason: dto.reason.trim(),
            idempotencyKey: randomUUID(),
          },
          include: {
            event: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        });

        await this.auditLogs.log(
          userId,
          'REQUEST_REFUND',
          'Refund',
          refund.id,
          {
            orderId: order.id,
            eventId: event.id,
            originalAmount: calculation.originalAmount.toFixed(2),
            deductionAmount: calculation.deductionAmount.toFixed(2),
            refundAmount: calculation.refundAmount.toFixed(2),
            reason: dto.reason.trim(),
          },
          tx,
        );

        createdRefunds.push(refund);
      }
    });

    return {
      message: 'Refund request submitted successfully',
      refunds: createdRefunds.map((r: CreatedRefundRecord) => ({
        id: r.id,
        orderId: r.orderId,
        eventId: r.eventId,
        eventTitle: r.event.title,
        originalAmount: r.originalAmount,
        deductionAmount: r.deductionAmount,
        amount: r.amount,
        status: r.status,
        createdAt: r.createdAt,
      })),
    };
  }

  async getCustomerRefunds(userId: string, query: QueryCustomerRefundsDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.RefundWhereInput = {
      requestedById: userId,
      ...(query.status && { status: query.status }),
      ...(query.type && { type: query.type }),
    };

    const [refunds, total] = await Promise.all([
      this.prisma.refund.findMany({
        where,
        include: {
          event: {
            select: {
              id: true,
              title: true,
              coverImageUrl: true,
              startDatetime: true,
              endDatetime: true,
            },
          },
          order: {
            select: {
              id: true,
              orderNumber: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.refund.count({ where }),
    ]);

    return buildPaginatedResponse(refunds, total, page, limit);
  }

  async getCustomerRefundDetail(userId: string, refundId: string) {
    const refund = await this.prisma.refund.findFirst({
      where: {
        id: refundId,
        requestedById: userId,
      },
      include: {
        event: true,
        order: {
          include: {
            orderItems: {
              include: {
                ticketType: true,
                issuedTickets: true,
              },
            },
          },
        },
      },
    });

    if (!refund) {
      throw new NotFoundException('Refund not found');
    }

    return refund;
  }

  // ==========================================
  // ADMIN WORKFLOW
  // ==========================================

  async getAdminRefunds(query: QueryAdminRefundsDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.RefundWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.type && { type: query.type }),
      ...(query.eventId && { eventId: query.eventId }),
      ...(query.orderId && { orderId: query.orderId }),
      ...(query.search && {
        OR: [
          {
            order: {
              orderNumber: { contains: query.search, mode: 'insensitive' },
            },
          },
          { event: { title: { contains: query.search, mode: 'insensitive' } } },
          {
            requestedBy: {
              fullName: { contains: query.search, mode: 'insensitive' },
            },
          },
          {
            requestedBy: {
              email: { contains: query.search, mode: 'insensitive' },
            },
          },
        ],
      }),
    };

    const [refunds, total] = await Promise.all([
      this.prisma.refund.findMany({
        where,
        include: {
          event: {
            select: {
              id: true,
              title: true,
              startDatetime: true,
            },
          },
          order: {
            select: {
              id: true,
              orderNumber: true,
              totalAmount: true,
              paymentStatus: true,
            },
          },
          requestedBy: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.refund.count({ where }),
    ]);

    return buildPaginatedResponse(refunds, total, page, limit);
  }

  async getAdminRefundDetail(refundId: string) {
    const refund = await this.prisma.refund.findUnique({
      where: { id: refundId },
      include: {
        event: true,
        order: {
          include: {
            orderItems: {
              include: {
                ticketType: true,
                issuedTickets: true,
              },
            },
          },
        },
        requestedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!refund) {
      throw new NotFoundException('Refund not found');
    }

    return refund;
  }

  async approveRefund(adminId: string, refundId: string) {
    const refund = await this.prisma.refund.findUnique({
      where: { id: refundId },
      include: {
        order: true,
        event: true,
      },
    });

    if (!refund) {
      throw new NotFoundException('Refund not found');
    }

    if (refund.status !== RefundStatus.PENDING_APPROVAL) {
      throw new ConflictException(
        `Refund cannot be approved from status "${refund.status}"`,
      );
    }

    const now = new Date();

    // Atomic conditional lock
    const updated = await this.prisma.refund.updateMany({
      where: {
        id: refund.id,
        status: RefundStatus.PENDING_APPROVAL,
      },
      data: {
        status: RefundStatus.APPROVED,
        approvedById: adminId,
        approvedAt: now,
      },
    });

    if (updated.count === 0) {
      throw new ConflictException('Refund is no longer pending approval');
    }

    await this.auditLogs.log(adminId, 'APPROVE_REFUND', 'Refund', refund.id, {
      orderId: refund.orderId,
      eventId: refund.eventId,
      amount: refund.amount.toFixed(2),
    });

    // Initiate Xendit gateway refund
    const paymentId = refund.order.pgTransactionId;
    if (!paymentId) {
      await this.prisma.refund.update({
        where: { id: refund.id },
        data: {
          status: RefundStatus.FAILED,
          failedAt: new Date(),
          failureReason: 'Order does not have a payment gateway transaction ID',
        },
      });
      throw new BadRequestException(
        'Order lacks a payment gateway transaction identifier',
      );
    }

    try {
      const xenditRes = await this.xenditService.createRefund({
        paymentId,
        amount: refund.amount.toNumber(),
        reason: refund.reason,
        idempotencyKey: refund.idempotencyKey || randomUUID(),
        metadata: {
          refundId: refund.id,
          orderId: refund.orderId,
          eventId: refund.eventId,
        },
      });

      const processedRefund = await this.prisma.refund.update({
        where: { id: refund.id },
        data: {
          status: RefundStatus.PROCESSING,
          pgRefundId: xenditRes.id,
        },
      });

      await this.auditLogs.log(
        adminId,
        'INITIATE_REFUND',
        'Refund',
        refund.id,
        {
          pgRefundId: xenditRes.id,
          status: 'PROCESSING',
        },
      );

      return {
        message: 'Refund approved and processing initiated',
        refund: processedRefund,
      };
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error
          ? err.message
          : 'Payment gateway refund request failed';
      await this.prisma.refund.update({
        where: { id: refund.id },
        data: {
          status: RefundStatus.FAILED,
          failedAt: new Date(),
          failureReason: errMsg,
        },
      });

      await this.auditLogs.log(adminId, 'FAIL_REFUND', 'Refund', refund.id, {
        failureReason: errMsg,
      });

      throw err;
    }
  }

  async rejectRefund(adminId: string, refundId: string, dto: RejectRefundDto) {
    const refund = await this.prisma.refund.findUnique({
      where: { id: refundId },
    });

    if (!refund) {
      throw new NotFoundException('Refund not found');
    }

    if (refund.status !== RefundStatus.PENDING_APPROVAL) {
      throw new ConflictException(
        `Refund cannot be rejected from status "${refund.status}"`,
      );
    }

    const updated = await this.prisma.refund.updateMany({
      where: {
        id: refund.id,
        status: RefundStatus.PENDING_APPROVAL,
      },
      data: {
        status: RefundStatus.REJECTED,
        adminReason: dto.reason.trim(),
        rejectedById: adminId,
        rejectedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      throw new ConflictException('Refund is no longer pending approval');
    }

    await this.auditLogs.log(adminId, 'REJECT_REFUND', 'Refund', refund.id, {
      adminReason: dto.reason.trim(),
    });

    const rejected = await this.prisma.refund.findUnique({
      where: { id: refund.id },
    });

    return {
      message: 'Refund request rejected',
      refund: rejected,
    };
  }

  // ==========================================
  // WEBHOOK WORKFLOW
  // ==========================================

  async handleWebhook(token: string, body: unknown) {
    this.xenditService.verifyWebhookToken(token);

    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Invalid webhook body');
    }

    const payload = body as Record<string, unknown>;
    const event = (payload.event as string) || (payload.type as string);
    const data = (payload.data as Record<string, unknown>) || payload;
    const pgRefundId =
      (data.id as string) ||
      (data.refund_id as string) ||
      (payload.id as string);
    const dataMeta = data.metadata as Record<string, unknown> | undefined;
    const payloadMeta = payload.metadata as Record<string, unknown> | undefined;
    const metadataRefundId =
      (dataMeta?.refundId as string) || (payloadMeta?.refundId as string);

    if (!pgRefundId && !metadataRefundId) {
      throw new BadRequestException(
        'Refund reference not found in webhook body',
      );
    }

    const refund = await this.prisma.refund.findFirst({
      where: {
        OR: [
          ...(pgRefundId ? [{ pgRefundId }] : []),
          ...(metadataRefundId ? [{ id: metadataRefundId }] : []),
        ],
      },
      include: {
        order: {
          include: {
            orderItems: {
              include: {
                ticketType: true,
                issuedTickets: true,
              },
            },
          },
        },
      },
    });

    if (!refund) {
      throw new NotFoundException('Associated refund record not found');
    }

    // Idempotency: Ignore already finalized refunds
    if (
      refund.status === RefundStatus.SUCCEEDED ||
      refund.status === RefundStatus.FAILED
    ) {
      return { message: 'Refund webhook already processed' };
    }

    if (event === 'refund.succeeded' || data.status === 'SUCCEEDED') {
      return this.finalizeRefundSucceeded(refund, pgRefundId);
    }

    if (event === 'refund.failed' || data.status === 'FAILED') {
      const reason =
        (typeof data.failure_reason === 'string' && data.failure_reason) ||
        (typeof data.reason === 'string' && data.reason) ||
        'Payment gateway refund failed';
      return this.finalizeRefundFailed(refund, pgRefundId, reason);
    }

    return { message: 'Webhook event acknowledged' };
  }

  private async finalizeRefundSucceeded(
    refund: RefundWithOrderDetails,
    pgRefundId?: string,
  ) {
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // 1. Conditional update on refund to prevent race conditions
      const updateResult = await tx.refund.updateMany({
        where: {
          id: refund.id,
          status: { in: [RefundStatus.PROCESSING, RefundStatus.APPROVED] },
        },
        data: {
          status: RefundStatus.SUCCEEDED,
          succeededAt: now,
          ...(pgRefundId && { pgRefundId }),
        },
      });

      if (updateResult.count === 0) {
        return;
      }

      // 2. Mark matching issued tickets as refunded and cancelled
      const matchingItems = refund.order.orderItems.filter(
        (oi) => oi.ticketType.eventId === refund.eventId,
      );

      const ticketIds = matchingItems
        .flatMap((oi) => oi.issuedTickets)
        .filter((t) => !t.isRefunded)
        .map((t) => t.id);

      if (ticketIds.length > 0) {
        await tx.issuedTicket.updateMany({
          where: { id: { in: ticketIds } },
          data: {
            isRefunded: true,
            refundedAt: now,
            isCancelled: true,
            refundId: refund.id,
          },
        });
      }

      // 3. Restore ticket quota
      for (const item of matchingItems) {
        await tx.ticketType.update({
          where: { id: item.ticketTypeId },
          data: {
            availableQuota: {
              increment: item.quantity,
            },
          },
        });
      }

      // 4. Audit Log
      await this.auditLogs.log(
        null,
        'CONFIRM_REFUND',
        'Refund',
        refund.id,
        {
          orderId: refund.orderId,
          eventId: refund.eventId,
          amount: refund.amount.toFixed(2),
          ticketsRefundedCount: ticketIds.length,
        },
        tx,
      );
    });

    return { message: 'Refund succeeded and processed' };
  }

  private async finalizeRefundFailed(
    refund: RefundWithOrderDetails,
    pgRefundId?: string,
    reason?: string,
  ) {
    const now = new Date();

    await this.prisma.refund.updateMany({
      where: {
        id: refund.id,
        status: { in: [RefundStatus.PROCESSING, RefundStatus.APPROVED] },
      },
      data: {
        status: RefundStatus.FAILED,
        failedAt: now,
        failureReason: reason || 'Gateway refund failed',
        ...(pgRefundId && { pgRefundId }),
      },
    });

    await this.auditLogs.log(null, 'FAIL_REFUND', 'Refund', refund.id, {
      failureReason: reason,
    });

    return { message: 'Refund failure recorded' };
  }

  // ==========================================
  // AUTOMATIC EVENT CANCELLATION REFUNDS
  // ==========================================

  async triggerAutomaticEventCancellationRefunds(
    eventId: string,
    cancelReason: string,
    actorId?: string,
    txClient?: Prisma.TransactionClient,
  ) {
    const client = txClient || this.prisma;

    const event = await client.event.findUnique({
      where: { id: eventId },
      include: {
        ticketTypes: {
          include: {
            orderItems: {
              where: {
                order: {
                  paymentStatus: 'PAID',
                },
              },
              include: {
                order: true,
                issuedTickets: true,
              },
            },
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (!event.isRefundable) {
      return { count: 0, message: 'Event is non-refundable' };
    }

    // Group order items by orderId
    const itemsByOrder = new Map<
      string,
      (OrderItem & { order: Order; issuedTickets: IssuedTicket[] })[]
    >();
    for (const tt of event.ticketTypes) {
      for (const oi of tt.orderItems) {
        const orderId = oi.order.id;
        const group = itemsByOrder.get(orderId) || [];
        group.push(oi);
        itemsByOrder.set(orderId, group);
      }
    }

    const createdRefunds: AutoRefundJob[] = [];

    for (const [orderId, items] of itemsByOrder.entries()) {
      const order = items[0].order;

      // Check existing active refund
      const existing = await client.refund.findFirst({
        where: {
          orderId,
          eventId,
          type: RefundType.EVENT_CANCELLATION,
          status: {
            in: [
              RefundStatus.APPROVED,
              RefundStatus.PROCESSING,
              RefundStatus.SUCCEEDED,
            ],
          },
        },
      });

      if (existing) {
        continue;
      }

      // Calculate 100% refund
      const eligibleAmount = items.reduce(
        (sum, i) => sum.add(new Prisma.Decimal(i.price).mul(i.quantity)),
        new Prisma.Decimal(0),
      );

      const calculation =
        this.calculator.calculateCancellationRefund(eligibleAmount);

      const refund = await client.refund.create({
        data: {
          orderId,
          eventId,
          requestedById: order.userId,
          type: RefundType.EVENT_CANCELLATION,
          status: RefundStatus.APPROVED,
          originalAmount: calculation.originalAmount,
          deductionAmount: calculation.deductionAmount,
          amount: calculation.refundAmount,
          reason: `Event cancelled: ${cancelReason}`,
          idempotencyKey: randomUUID(),
          approvedAt: new Date(),
          approvedById: actorId,
        },
      });

      await this.auditLogs.log(
        actorId || null,
        'AUTO_CANCEL_REFUND',
        'Refund',
        refund.id,
        {
          eventId,
          orderId,
          amount: calculation.refundAmount.toFixed(2),
          reason: cancelReason,
        },
        txClient,
      );

      createdRefunds.push({
        refundId: refund.id,
        paymentId: order.pgTransactionId,
        amount: calculation.refundAmount.toNumber(),
        reason: refund.reason,
        idempotencyKey: refund.idempotencyKey,
      });
    }

    // Asynchronously dispatch Xendit refund jobs
    if (createdRefunds.length > 0) {
      setImmediate(() => {
        void (async () => {
          for (const job of createdRefunds) {
            try {
              if (!job.paymentId) continue;
              const res = await this.xenditService.createRefund({
                paymentId: job.paymentId,
                amount: job.amount,
                reason: job.reason,
                idempotencyKey: job.idempotencyKey || randomUUID(),
                metadata: { refundId: job.refundId, eventId },
              });
              await this.prisma.refund.update({
                where: { id: job.refundId },
                data: {
                  status: RefundStatus.PROCESSING,
                  pgRefundId: res.id,
                },
              });
            } catch (err: unknown) {
              const errMsg =
                err instanceof Error
                  ? err.message
                  : 'Auto cancellation refund failed';
              await this.prisma.refund.update({
                where: { id: job.refundId },
                data: {
                  status: RefundStatus.FAILED,
                  failedAt: new Date(),
                  failureReason: errMsg,
                },
              });
            }
          }
        })();
      });
    }

    return {
      count: createdRefunds.length,
      message: `Created ${createdRefunds.length} cancellation refund record(s)`,
    };
  }
}
