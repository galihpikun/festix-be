import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { FileFieldsInterceptor } from '@nestjs/platform-express';

import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { QueryAdminEventsDto } from './dto/query-admin-events.dto';
import { QueryOrganizerEventsDto } from './dto/query-organizer-events.dto';
import { SearchInvitableUsersDto } from './dto/search-invitable-users.dto';

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

  @Get('most-popular')
  getMostPop() {
    return this.eventsService.getMostPopularEvents();
  }

  // ==========================================
  // ADMIN
  // ==========================================

  // Taruh route admin SEBELUM :id
  // kalau nanti menambahkan GET admin.

  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles('ADMIN')
  @Get('admin')
  getAdminEvents(@Query() query: QueryAdminEventsDto) {
    return this.eventsService.getAdminEvents(query);
  }

  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles('ADMIN')
  @Get('admin/:id')
  getAdminEventDetail(@Param('id') eventId: string) {
    return this.eventsService.eventDetail(eventId, true);
  }

  // ==========================================
  // ORGANIZER
  // ==========================================

  // MY EVENTS
  @UseGuards(JwtAuthGuard)
  @Get('organizer/my-events')
  getMyEvents(@Req() req, @Query() query: QueryOrganizerEventsDto) {
    return this.eventsService.getMyEvents(req.user.userId, query);
  }

  // ORGANIZER EVENT DETAIL
  @UseGuards(JwtAuthGuard)
  @Get('organizer/:id')
  getOrganizerEventDetail(@Req() req, @Param('id') eventId: string) {
    return this.eventsService.getOrganizerEventDetail(req.user.userId, eventId);
  }

  // ORGANIZER EVENT CHECKIN MONITOR
  @UseGuards(JwtAuthGuard)
  @Get('organizer/:id/checkin')
  getOrganizerEventCheckin(@Req() req, @Param('id') eventId: string) {
    return this.eventsService.getOrganizerEventCheckin(req.user.userId, eventId);
  }

  // REMOVE STAFF FROM ORGANIZER EVENT
  @UseGuards(JwtAuthGuard)
  @Delete('organizer/:eventId/staff/:assignmentId')
  removeOrganizerStaff(
    @Req() req,
    @Param('eventId') eventId: string,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.eventsService.removeOrganizerStaff(
      req.user.userId,
      eventId,
      assignmentId,
    );
  }

  // SEARCH INVITABLE USERS
  @UseGuards(JwtAuthGuard)
  @Get('search-invitable-users')
  searchInvitableUsers(@Req() req, @Query() query: SearchInvitableUsersDto) {
    return this.eventsService.searchInvitableUsers(query, req.user.userId);
  }

  // ==========================================
  // PUBLIC DETAIL
  // ==========================================

  @Get(':id')
  eventDetail(@Param('id') eventId: string) {
    return this.eventsService.eventDetail(eventId);
  }

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
  approveEvent(@Req() req: any, @Param('id') eventId: string) {
    return this.eventsService.approveEvent(eventId, req.user?.userId);
  }

  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles('ADMIN')
  @Patch('admin/:id/reject')
  rejectEvent(
    @Req() req: any,
    @Param('id') eventId: string,
    @Body('reason') reason: string,
  ) {
    return this.eventsService.rejectEvent(eventId, reason, req.user?.userId);
  }

  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles('ADMIN')
  @Patch('admin/:id/cancel')
  cancelEvent(
    @Req() req: any,
    @Param('id') eventId: string,
    @Body('reason') reason: string,
  ) {
    return this.eventsService.cancelEvent(eventId, reason, req.user?.userId);
  }
}
