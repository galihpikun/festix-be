import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IssuedTicketsService } from './issued-tickets.service';

type AuthenticatedRequest = Request & {
  user: {
    userId: string;
  };
};

@Controller('issued-tickets')
export class IssuedTicketsController {
  constructor(private readonly issuedTicketsService: IssuedTicketsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('my')
  getMyTickets(@Req() req: AuthenticatedRequest) {
    return this.issuedTicketsService.getMyTickets(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  getTicketDetail(
    @Req() req: AuthenticatedRequest,
    @Param('id') ticketId: string,
  ) {
    return this.issuedTicketsService.getTicketDetail(req.user.userId, ticketId);
  }
}
