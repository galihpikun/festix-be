import { BadRequestException } from '@nestjs/common';
import { RefundsCalculator } from './refunds.calculator';
import { Prisma } from '../../generated/prisma/client';

describe('RefundsCalculator', () => {
  let calculator: RefundsCalculator;

  beforeEach(() => {
    calculator = new RefundsCalculator();
  });

  describe('calculateCustomerRefund', () => {
    it('should deduct 5% and payout 95% accurately', () => {
      const result = calculator.calculateCustomerRefund(100000);
      expect(result.originalAmount.toNumber()).toBe(100000);
      expect(result.deductionAmount.toNumber()).toBe(5000);
      expect(result.refundAmount.toNumber()).toBe(95000);
    });

    it('should round decimal cents accurately using round half up', () => {
      // 100000.55 * 0.05 = 5000.0275 -> 5000.03
      const result = calculator.calculateCustomerRefund(
        new Prisma.Decimal('100000.55'),
      );
      expect(result.deductionAmount.toFixed(2)).toBe('5000.03');
      expect(result.refundAmount.toFixed(2)).toBe('95000.52');
    });

    it('should throw BadRequestException if amount is zero or negative', () => {
      expect(() => calculator.calculateCustomerRefund(0)).toThrow(
        BadRequestException,
      );
      expect(() => calculator.calculateCustomerRefund(-5000)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('calculateCancellationRefund', () => {
    it('should payout 100% with zero deduction', () => {
      const result = calculator.calculateCancellationRefund(250000);
      expect(result.originalAmount.toNumber()).toBe(250000);
      expect(result.deductionAmount.toNumber()).toBe(0);
      expect(result.refundAmount.toNumber()).toBe(250000);
    });

    it('should throw BadRequestException if amount is zero or negative', () => {
      expect(() => calculator.calculateCancellationRefund(0)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('validateCumulativeRefund', () => {
    it('should pass when cumulative amount is within order total', () => {
      expect(() =>
        calculator.validateCumulativeRefund(200000, 300000, 500000),
      ).not.toThrow();
    });

    it('should throw BadRequestException when cumulative amount exceeds order total', () => {
      expect(() =>
        calculator.validateCumulativeRefund(300000, 250000, 500000),
      ).toThrow(BadRequestException);
    });
  });
});
