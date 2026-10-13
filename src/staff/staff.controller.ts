import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { StaffService } from './staff.service';
import { AssignStaffDto } from './dto/assign-staff.dto';
import { QueryStaffDto } from './dto/query-staff.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { Roles } from '../auth/decorators/role.decorator';

type AuthenticatedRequest = Request & {
  user: {
    userId: string;
  };
};

@UseGuards(JwtAuthGuard, RoleGuard)
@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Roles('STAFF')
  @Get('events')
  getAssignedEvents(@Req() req: AuthenticatedRequest) {
    return this.staffService.getAssignedEvents(req.user.userId);
  }

  @Roles('STAFF')
  @Get('events/:eventId/dashboard')
  getEventDashboard(
    @Req() req: AuthenticatedRequest,
    @Param('eventId') eventId: string,
  ) {
    return this.staffService.getEventDashboard(req.user.userId, eventId);
  }

  @Roles('ADMIN')
  @Get('admin')
  findAll(@Query() query: QueryStaffDto) {
    return this.staffService.findAllStaff(query);
  }

  @Roles('ADMIN')
  @Get('admin/event/:eventId')
  getStaffForEvent(@Param('eventId') eventId: string) {
    return this.staffService.getStaffForEvent(eventId);
  }

  @Roles('ADMIN')
  @Get('admin/:id')
  findStaffDetail(@Param('id') userId: string) {
    return this.staffService.findStaffDetail(userId);
  }

  @Roles('ADMIN')
  @Post('admin/assign')
  assignStaff(@Req() req: AuthenticatedRequest, @Body() dto: AssignStaffDto) {
    return this.staffService.assignStaff(dto, req.user.userId);
  }

  @Roles('ADMIN')
  @Delete('admin/assign/:id')
  removeAssignment(
    @Req() req: AuthenticatedRequest,
    @Param('id') assignmentId: string,
  ) {
    return this.staffService.removeAssignment(assignmentId, req.user.userId);
  }
}
