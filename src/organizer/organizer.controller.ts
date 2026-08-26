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
import { OrganizerService } from './organizer.service';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApplyOrganizerDto } from './dto/apply-org';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RoleGuard } from 'src/auth/guards/role.guard';
import { Roles } from 'src/auth/decorators/role.decorator';

type UploadedFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Controller('organizer')
export class OrganizerController {
  constructor(private readonly organizerService: OrganizerService) {}

  @UseGuards(JwtAuthGuard)
  @Post('apply')
  @UseInterceptors(
    FileFieldsInterceptor([
      {
        name: 'businessLicense',
        maxCount: 1,
      },
      {
        name: 'guaranteeLetter',
        maxCount: 1,
      },
      {
        name: 'organizationRegistration',
        maxCount: 1,
      },
      {
        name: 'identityCard',
        maxCount: 1,
      },
    ]),
  )
  applyOrganizer(
    @Req() req,
    @Body() dto: ApplyOrganizerDto,
    @UploadedFiles()
    files: {
      businessLicense?: UploadedFile[];
      guaranteeLetter?: UploadedFile[];
      organizationRegistration?: UploadedFile[];
      identityCard?: UploadedFile[];
    },
  ) {
    return this.organizerService.applyOrgs(req.user.userId, dto, files);
  }

  // Get My Organizer Profile
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMyOrg(@Req() req) {
    return this.organizerService.getMyOrganizerProfile(req.user.userId);
  }

  // ADMIN

  // Get All Organizer Applications
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles('ADMIN')
  @Get('admin')
  getAllOrgs() {
    return this.organizerService.getAllOrganizerApplications();
  }

  // Get Organizer Detail
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles('ADMIN')
  @Get('admin/:id')
  getOrgDetails(@Param('id') organizerId: string) {
    return this.organizerService.getOrganizerDetail(organizerId);
  }

  // Approve Organizer
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles('ADMIN')
  @Patch('admin/:id/approve')
  approve(@Param('id') organizerId: string) {
    return this.organizerService.approveOrganizer(organizerId);
  }

  // Reject Organizer
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles('ADMIN')
  @Patch('admin/:id/reject')
  reject(
    @Param('id') organizerId: string,
    @Body('rejectionReason') rejectionReason: string,
  ) {
    return this.organizerService.rejectOrganizer(organizerId, rejectionReason);
  }
}
