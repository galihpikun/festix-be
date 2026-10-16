import {
  Body,
  Controller,
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
import { OrganizerService } from './organizer.service';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApplyOrganizerDto } from './dto/apply-org';
import { QueryOrganizersDto } from './dto/query-organizers.dto';
import { RejectDocumentDto } from './dto/reject-document.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { Roles } from '../auth/decorators/role.decorator';

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
    @Req() req: any,
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
  getMyOrg(@Req() req: any) {
    return this.organizerService.getMyOrganizerProfile(req.user.userId);
  }

  // Get Organizer Dashboard
  @UseGuards(JwtAuthGuard)
  @Get('dashboard')
  getDashboard(@Req() req: any) {
    return this.organizerService.getOrganizerDashboard(req.user.userId);
  }

  // Get Organizer Staff Roster
  @UseGuards(JwtAuthGuard)
  @Get('staff')
  getOrganizerStaff(@Req() req: any, @Query('eventId') eventId?: string) {
    return this.organizerService.getOrganizerStaff(req.user.userId, eventId);
  }

  // ADMIN

  // Get All Organizer Applications
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles('ADMIN')
  @Get('admin')
  getAllOrgs(@Query() query: QueryOrganizersDto) {
    return this.organizerService.getAllOrganizerApplications(query);
  }

  // Document actions (before :id to avoid route collision)
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles('ADMIN')
  @Patch('admin/documents/:docId/approve')
  approveDocument(@Req() req: any, @Param('docId') docId: string) {
    return this.organizerService.approveDocument(docId, req.user?.userId);
  }

  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles('ADMIN')
  @Patch('admin/documents/:docId/reject')
  rejectDocument(
    @Req() req: any,
    @Param('docId') docId: string,
    @Body() dto: RejectDocumentDto,
  ) {
    return this.organizerService.rejectDocument(
      docId,
      dto.rejectionReason,
      req.user?.userId,
    );
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
  approve(@Req() req: any, @Param('id') organizerId: string) {
    return this.organizerService.approveOrganizer(
      organizerId,
      req.user?.userId,
    );
  }

  // Reject Organizer
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles('ADMIN')
  @Patch('admin/:id/reject')
  reject(
    @Req() req: any,
    @Param('id') organizerId: string,
    @Body('rejectionReason') rejectionReason: string,
  ) {
    return this.organizerService.rejectOrganizer(
      organizerId,
      rejectionReason,
      req.user?.userId,
    );
  }
}
