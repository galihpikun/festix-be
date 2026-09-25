import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { Roles } from '../auth/decorators/role.decorator';
import { TicketRedemptionService } from './ticket-redemption.service';
import { TicketRedemptionDto } from './dto/ticket-redemption.dto';

type AuthenticatedRequest = Request & {
  user: {
    userId: string;
  };
};

@Controller('ticket-redemption')
export class TicketRedemptionController {
  constructor(
    private readonly ticketRedemptionService: TicketRedemptionService,
  ) {}

  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles('STAFF')
  @Post('lookup')
  lookupTicket(
    @Req() req: AuthenticatedRequest,
    @Body() dto: TicketRedemptionDto,
  ) {
    return this.ticketRedemptionService.lookupTicket(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles('STAFF')
  @Post('redeem')
  redeemTicket(
    @Req() req: AuthenticatedRequest,
    @Body() dto: TicketRedemptionDto,
  ) {
    return this.ticketRedemptionService.redeemTicket(req.user.userId, dto);
  }
}
