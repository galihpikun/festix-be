import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TicketTypesService } from './ticket-types.service';
import { CreateTicketTypeDto } from './dto/create-ticket-types.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { UpdateTicketTypeDto } from './dto/update-ticket-types.dto';

@Controller('ticket-types')
export class TicketTypesController {
  constructor(private readonly ticketTypesService: TicketTypesService) {}

  @Get('event/:eventId')
  getTicketTypes(@Param('eventId') eventId: string) {
    return this.ticketTypesService.getTicketTypes(eventId);
  }

  @Get(':id')
  getTicketTypeDetail(@Param('id') ticketTypeId: string) {
    return this.ticketTypesService.getTicketTypeDetail(ticketTypeId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('event/:eventId')
  createTicketType(
    @Req() req,
    @Body() dto: CreateTicketTypeDto,
    @Param('eventId') eventId: string,
  ) {
    return this.ticketTypesService.createTicketType(req.user.userId, dto, eventId,);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  updateTicketType(
    @Req() req,
    @Body() dto: UpdateTicketTypeDto,
    @Param('id') ticketTypeId: string,
  ) {
    return this.ticketTypesService.updateTicketType(req.user.userId, dto, ticketTypeId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  deleteTicketType(
    @Req() req,
    @Param('id') ticketTypeId: string) {
    return this.ticketTypesService.deleteTicketType(req.user.userId, ticketTypeId);
  }
}
