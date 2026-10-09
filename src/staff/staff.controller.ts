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
import { StaffService } from './staff.service';
import { AssignStaffDto } from './dto/assign-staff.dto';
import { QueryStaffDto } from './dto/query-staff.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { Roles } from '../auth/decorators/role.decorator';

@UseGuards(JwtAuthGuard, RoleGuard)
@Roles('ADMIN')
@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get('admin')
  findAll(@Query() query: QueryStaffDto) {
    return this.staffService.findAllStaff(query);
  }

  @Get('admin/event/:eventId')
  getStaffForEvent(@Param('eventId') eventId: string) {
    return this.staffService.getStaffForEvent(eventId);
  }

  @Get('admin/:id')
  findStaffDetail(@Param('id') userId: string) {
    return this.staffService.findStaffDetail(userId);
  }

  @Post('admin/assign')
  assignStaff(@Req() req: any, @Body() dto: AssignStaffDto) {
    return this.staffService.assignStaff(dto, req.user.userId);
  }

  @Delete('admin/assign/:id')
  removeAssignment(@Req() req: any, @Param('id') assignmentId: string) {
    return this.staffService.removeAssignment(assignmentId, req.user.userId);
  }
}
