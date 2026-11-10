import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RefundsService } from './refunds.service';
import { CreateCustomerRefundDto } from './dto/create-customer-refund.dto';
import { QueryCustomerRefundsDto } from './dto/query-customer-refunds.dto';

type AuthenticatedRequest = Request & {
  user: {
    userId: string;
  };
};

@Controller('refunds')
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  createRefund(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCustomerRefundDto,
  ) {
    return this.refundsService.createCustomerRefund(req.user.userId, dto);
  }

  // 'my' MUST precede ':id' to prevent route collision
  @UseGuards(JwtAuthGuard)
  @Get('my')
  getMyRefunds(
    @Req() req: AuthenticatedRequest,
    @Query() query: QueryCustomerRefundsDto,
  ) {
    return this.refundsService.getCustomerRefunds(req.user.userId, query);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  getRefundDetail(
    @Req() req: AuthenticatedRequest,
    @Param('id') refundId: string,
  ) {
    return this.refundsService.getCustomerRefundDetail(
      req.user.userId,
      refundId,
    );
  }
}
