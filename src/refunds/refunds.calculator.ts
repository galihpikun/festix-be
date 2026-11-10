import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { CUSTOMER_REFUND_DEDUCTION_RATE } from './refunds.constants';

export type RefundCalculationResult = {
  originalAmount: Prisma.Decimal;
  deductionAmount: Prisma.Decimal;
  refundAmount: Prisma.Decimal;
};

@Injectable()
export class RefundsCalculator {
  calculateCustomerRefund(
    eligiblePaidAmount: Prisma.Decimal | number | string,
  ): RefundCalculationResult {
    const original = new Prisma.Decimal(eligiblePaidAmount);

    if (original.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        'Eligible paid amount must be greater than zero',
      );
    }

    const deduction = original
      .mul(CUSTOMER_REFUND_DEDUCTION_RATE)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    const payout = original.sub(deduction);

    return {
      originalAmount: original,
      deductionAmount: deduction,
      refundAmount: payout,
    };
  }

  calculateCancellationRefund(
    eligiblePaidAmount: Prisma.Decimal | number | string,
  ): RefundCalculationResult {
    const original = new Prisma.Decimal(eligiblePaidAmount);

    if (original.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        'Eligible paid amount must be greater than zero',
      );
    }

    return {
      originalAmount: original,
      deductionAmount: new Prisma.Decimal(0),
      refundAmount: original,
    };
  }

  validateCumulativeRefund(
    existingRefundedSum: Prisma.Decimal | number | string,
    newRefundAmount: Prisma.Decimal | number | string,
    orderTotalAmount: Prisma.Decimal | number | string,
  ): void {
    const existing = new Prisma.Decimal(existingRefundedSum);
    const newAmount = new Prisma.Decimal(newRefundAmount);
    const total = new Prisma.Decimal(orderTotalAmount);

    if (existing.add(newAmount).greaterThan(total)) {
      throw new BadRequestException(
        `Cumulative refund amount (${existing.add(newAmount).toFixed(2)}) cannot exceed total order amount (${total.toFixed(2)})`,
      );
    }
  }
}
