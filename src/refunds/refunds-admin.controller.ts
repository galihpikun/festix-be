import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { Roles } from '../auth/decorators/role.decorator';
import { RefundsService } from './refunds.service';
import { QueryAdminRefundsDto } from './dto/query-admin-refunds.dto';
import { RejectRefundDto } from './dto/reject-refund.dto';

type AuthenticatedRequest = Request & {
  user: {
    userId: string;
  };
};

@Controller('refunds/admin')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles('ADMIN')
export class RefundsAdminController {
  constructor(private readonly refundsService: RefundsService) {}

  @Get()
  getAdminRefunds(@Query() query: QueryAdminRefundsDto) {
    return this.refundsService.getAdminRefunds(query);
  }

  @Get(':id')
  getAdminRefundDetail(@Param('id') refundId: string) {
    return this.refundsService.getAdminRefundDetail(refundId);
  }

  @Patch(':id/approve')
  approveRefund(
    @Req() req: AuthenticatedRequest,
    @Param('id') refundId: string,
  ) {
    return this.refundsService.approveRefund(req.user.userId, refundId);
  }

  @Patch(':id/reject')
  rejectRefund(
    @Req() req: AuthenticatedRequest,
    @Param('id') refundId: string,
    @Body() dto: RejectRefundDto,
  ) {
    return this.refundsService.rejectRefund(req.user.userId, refundId, dto);
  }
}
