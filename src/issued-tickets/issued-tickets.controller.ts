import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { Roles } from '../auth/decorators/role.decorator';
import { IssuedTicketsService } from './issued-tickets.service';
import { QueryAdminTicketsDto } from './dto/query-admin-tickets.dto';

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

  // ADMIN routes MUST come before :id to prevent 'admin' being parsed as ticketId
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles('ADMIN')
  @Get('admin')
  getAdminTickets(@Query() query: QueryAdminTicketsDto) {
    return this.issuedTicketsService.getAdminTickets(query);
  }

  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles('ADMIN')
  @Get('admin/:id')
  getAdminTicketDetail(@Param('id') ticketId: string) {
    return this.issuedTicketsService.getAdminTicketDetail(ticketId);
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
