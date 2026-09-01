import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { FileFieldsInterceptor } from '@nestjs/platform-express';

import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RoleGuard } from 'src/auth/guards/role.guard';
import { Roles } from 'src/auth/decorators/role.decorator';

type UploadedFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  // ==========================================
  // PUBLIC
  // ==========================================

  @Get()
  getEvents() {
    return this.eventsService.getEvents();
  }

  // ==========================================
  // ADMIN
  // ==========================================

  // Taruh route admin SEBELUM :id
  // kalau nanti menambahkan GET admin.

  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles('ADMIN')
  @Get('admin')
  getAdminEvents() {
    return this.eventsService.getAdminEvents();
  }

  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles('ADMIN')
  @Get('admin/:id')
  getAdminEventDetail(@Param('id') eventId: string) {
    return this.eventsService.eventDetail(eventId);
  }

  // ==========================================
  // PUBLIC DETAIL
  // ==========================================

  @Get(':id')
  eventDetail(@Param('id') eventId: string) {
    return this.eventsService.eventDetail(eventId);
  }

  // ==========================================
  // ORGANIZER
  // ==========================================

  // CREATE EVENT

  @UseGuards(JwtAuthGuard)
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor([
      {
        name: 'coverImage',
        maxCount: 1,
      },
      {
        name: 'venueImage',
        maxCount: 1,
      },
    ]),
  )
  createEvent(
    @Req() req,
    @Body() dto: CreateEventDto,
    @UploadedFiles()
    files: {
      coverImage?: UploadedFile[];
      venueImage?: UploadedFile[];
    },
  ) {
    return this.eventsService.createEvent(req.user.userId, dto, files);
  }

  // UPDATE EVENT

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @UseInterceptors(
    FileFieldsInterceptor([
      {
        name: 'coverImage',
        maxCount: 1,
      },
      {
        name: 'venueImage',
        maxCount: 1,
      },
    ]),
  )
  updateEvent(
    @Req() req,
    @Param('id') eventId: string,
    @Body() dto: UpdateEventDto,
    @UploadedFiles()
    files: {
      coverImage?: UploadedFile[];
      venueImage?: UploadedFile[];
    },
  ) {
    return this.eventsService.updateEvent(req.user.userId, eventId, dto, files);
  }

  // SUBMIT EVENT

  @UseGuards(JwtAuthGuard)
  @Patch(':id/submit')
  submitEvent(@Req() req, @Param('id') eventId: string) {
    return this.eventsService.submitEvent(req.user.userId, eventId);
  }

  // ==========================================
  // ADMIN ACTION
  // ==========================================

  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles('ADMIN')
  @Patch('admin/:id/approve')
  approveEvent(@Param('id') eventId: string) {
    return this.eventsService.approveEvent(eventId);
  }

  @UseGuards(JwtAuthGuard, RoleGuard)
  @Patch('admin/:id/reject')
  rejectEvent(@Param('id') eventId: string, @Body('reason') reason: string) {
    return this.eventsService.rejectEvent(eventId, reason);
  }
}
