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
import { UsersService } from './users.service';
import { QueryUsersDto } from './dto/query-users.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { Roles } from '../auth/decorators/role.decorator';

@UseGuards(JwtAuthGuard, RoleGuard)
@Roles('ADMIN')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('admin')
  findAll(@Query() query: QueryUsersDto) {
    return this.usersService.findAll(query);
  }

  @Get('admin/:id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch('admin/:id/role')
  changeRole(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ChangeRoleDto,
  ) {
    return this.usersService.changeRole(id, dto, req.user.userId);
  }

  @Patch('admin/:id/suspend')
  suspendUser(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: SuspendUserDto,
  ) {
    return this.usersService.suspendUser(id, dto, req.user.userId);
  }

  @Patch('admin/:id/unsuspend')
  unsuspendUser(@Req() req: any, @Param('id') id: string) {
    return this.usersService.unsuspendUser(id, req.user.userId);
  }
}
