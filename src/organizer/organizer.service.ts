import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ApplyOrganizerDto } from './dto/apply-org';
import { QueryOrganizersDto } from './dto/query-organizers.dto';
import { buildPaginatedResponse } from '../shared/helpers/paginate';
import { Prisma } from '../../generated/prisma/client';

type UploadedFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Injectable()
export class OrganizerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async applyOrgs(
    userId: string,
    dto: ApplyOrganizerDto,
    files: {
      businessLicense?: UploadedFile[];
      guaranteeLetter?: UploadedFile[];
      organizationRegistration?: UploadedFile[];
      identityCard?: UploadedFile[];
    },
  ) {
    // Cek user
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Cek apakah user sudah pernah apply
    const existingOrganizer = await this.prisma.organizerProfile.findUnique({
      where: {
        userId: user.id,
      },
    });

    if (existingOrganizer) {
      if (existingOrganizer.status === 'PENDING') {
        throw new ConflictException(
          'Your organizer application is still being reviewed',
        );
      }

      if (existingOrganizer.status === 'APPROVED') {
        throw new ConflictException('You are already an approved organizer');
      }
    }

    // Validasi file
    if (!files.businessLicense?.length) {
      throw new BadRequestException('Business license is required');
    }

    if (!files.guaranteeLetter?.length) {
      throw new BadRequestException('Guarantee letter is required');
    }

    if (!files.organizationRegistration?.length) {
      throw new BadRequestException('Organization registration is required');
    }

    if (!files.identityCard?.length) {
      throw new BadRequestException('Identity card is required');
    }

    // Ambil file
    const businessLicense = files.businessLicense[0];
    const guaranteeLetter = files.guaranteeLetter[0];
    const organizationRegistration = files.organizationRegistration[0];
    const identityCard = files.identityCard[0];

    // Validasi format file
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

    const documents = [
      businessLicense,
      guaranteeLetter,
      organizationRegistration,
      identityCard,
    ];

    for (const file of documents) {
      if (!allowedMimeTypes.includes(file.mimetype)) {
        throw new BadRequestException(
          `Invalid image type: ${file.originalname}`,
        );
      }
    }

    // Validasi ukuran file
    const maxFileSize = 5 * 1024 * 1024;

    for (const file of documents) {
      if (file.size > maxFileSize) {
        throw new BadRequestException(`File ${file.originalname} exceeds 5 MB`);
      }
    }

    // Upload gambar ke Cloudinary
    const businessLicenseUpload =
      await this.cloudinary.uploadImage(businessLicense);

    const guaranteeLetterUpload =
      await this.cloudinary.uploadImage(guaranteeLetter);

    const organizationRegistrationUpload = await this.cloudinary.uploadImage(
      organizationRegistration,
    );

    const identityCardUpload = await this.cloudinary.uploadImage(identityCard);

    // Kalau sebelumnya REJECTED, hapus dokumen lama
    if (existingOrganizer) {
      await this.prisma.organizerDocument.deleteMany({
        where: {
          organizerId: existingOrganizer.id,
        },
      });
    }

    // Buat atau update Organizer Profile
    let organizer;

    if (existingOrganizer) {
      organizer = await this.prisma.organizerProfile.update({
        where: {
          id: existingOrganizer.id,
        },
        data: {
          ...dto,
          status: 'PENDING',
          rejectionReason: null,
        },
      });
    } else {
      organizer = await this.prisma.organizerProfile.create({
        data: {
          userId: user.id,
          ...dto,
          status: 'PENDING',
        },
      });
    }

    // Simpan dokumen
    await this.prisma.organizerDocument.createMany({
      data: [
        {
          organizerId: organizer.id,
          type: 'BUSINESS_LICENSE',
          fileUrl: businessLicenseUpload.secure_url,
          publicId: businessLicenseUpload.public_id,
        },
        {
          organizerId: organizer.id,
          type: 'GUARANTEE_LETTER',
          fileUrl: guaranteeLetterUpload.secure_url,
          publicId: guaranteeLetterUpload.public_id,
        },
        {
          organizerId: organizer.id,
          type: 'ORGANIZATION_REGISTRATION',
          fileUrl: organizationRegistrationUpload.secure_url,
          publicId: organizationRegistrationUpload.public_id,
        },
        {
          organizerId: organizer.id,
          type: 'IDENTITY_CARD',
          fileUrl: identityCardUpload.secure_url,
          publicId: identityCardUpload.public_id,
        },
      ],
    });

    return {
      message: 'Organizer application submitted successfully',
      status: organizer.status,
      organizerId: organizer.id,
    };
  }

  async getMyOrganizerProfile(userId: string) {
    const organizer = await this.prisma.organizerProfile.findUnique({
      where: {
        userId,
      },
      include: {
        documents: true,
      },
    });

    if (!organizer) {
      throw new NotFoundException(
        'Organizer profile not found. Please apply first',
      );
    }

    return organizer;
  }

  async getAllOrganizerApplications(query?: QueryOrganizersDto) {
    const page = query?.page || 1;
    const limit = query?.limit || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.OrganizerProfileWhereInput = {};

    if (query?.status) {
      where.status = query.status;
    }

    if (query?.search) {
      where.OR = [
        { organizationName: { contains: query.search, mode: 'insensitive' } },
        { user: { fullName: { contains: query.search, mode: 'insensitive' } } },
        { user: { email: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [organizers, total] = await Promise.all([
      this.prisma.organizerProfile.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              createdAt: true,
            },
          },
          documents: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.organizerProfile.count({ where }),
    ]);

    return buildPaginatedResponse(organizers, total, page, limit);
  }

  async getOrganizerDetail(organizerId: string) {
    const organizer = await this.prisma.organizerProfile.findUnique({
      where: {
        id: organizerId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            createdAt: true,
            emailVerified: true,
            role: true,
          },
        },
        documents: true,
      },
    });

    if (!organizer) {
      throw new NotFoundException('Organizer application not found');
    }

    return organizer;
  }

  async approveDocument(documentId: string, actorId?: string) {
    const doc = await this.prisma.organizerDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.organizerDocument.update({
        where: { id: documentId },
        data: {
          status: 'APPROVED',
          rejectionReason: null,
        },
      });

      await this.auditLogs.log(
        actorId ?? null,
        'APPROVE_DOCUMENT',
        'OrganizerDocument',
        documentId,
        { type: doc.type, organizerId: doc.organizerId },
        tx,
      );

      return result;
    });

    return {
      message: 'Document approved successfully',
      document: updated,
    };
  }

  async rejectDocument(
    documentId: string,
    rejectionReason: string,
    actorId?: string,
  ) {
    if (!rejectionReason || !rejectionReason.trim()) {
      throw new BadRequestException('Rejection reason is required');
    }

    const doc = await this.prisma.organizerDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.organizerDocument.update({
        where: { id: documentId },
        data: {
          status: 'REJECTED',
          rejectionReason: rejectionReason.trim(),
        },
      });

      await this.auditLogs.log(
        actorId ?? null,
        'REJECT_DOCUMENT',
        'OrganizerDocument',
        documentId,
        {
          type: doc.type,
          organizerId: doc.organizerId,
          reason: rejectionReason.trim(),
        },
        tx,
      );

      return result;
    });

    return {
      message: 'Document rejected successfully',
      document: updated,
    };
  }

  async approveOrganizer(organizerId: string, actorId?: string) {
    const organizer = await this.prisma.organizerProfile.findUnique({
      where: {
        id: organizerId,
      },
      include: {
        documents: true,
      },
    });

    if (!organizer) {
      throw new NotFoundException('Organizer application not found');
    }

    if (organizer.status === 'APPROVED') {
      throw new ConflictException('Organizer is already approved');
    }

    if (organizer.status === 'REJECTED') {
      throw new ConflictException('Rejected application cannot be approved');
    }

    // Require all documents to be APPROVED before approving the organizer
    const unapprovedDocs = organizer.documents.filter(
      (d) => d.status !== 'APPROVED',
    );
    if (unapprovedDocs.length > 0) {
      throw new ConflictException(
        `Cannot approve organizer. ${unapprovedDocs.length} document(s) have not been approved yet.`,
      );
    }

    const updatedOrganizer = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.organizerProfile.update({
        where: {
          id: organizerId,
        },
        data: {
          status: 'APPROVED',
          rejectionReason: null,
        },
      });

      await this.auditLogs.log(
        actorId ?? null,
        'APPROVE',
        'OrganizerProfile',
        organizerId,
        { organizationName: organizer.organizationName },
        tx,
      );

      return updated;
    });

    return {
      message: 'Organizer approved successfully',
      organizer: updatedOrganizer,
    };
  }

  async rejectOrganizer(
    organizerId: string,
    rejectionReason: string,
    actorId?: string,
  ) {
    if (!rejectionReason || !rejectionReason.trim()) {
      throw new BadRequestException('Rejection reason is required');
    }

    const organizer = await this.prisma.organizerProfile.findUnique({
      where: {
        id: organizerId,
      },
    });

    if (!organizer) {
      throw new NotFoundException('Organizer application not found');
    }

    if (organizer.status === 'APPROVED') {
      throw new ConflictException('Approved organizer cannot be rejected');
    }

    if (organizer.status === 'REJECTED') {
      throw new ConflictException('Organizer is already rejected');
    }

    const updatedOrganizer = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.organizerProfile.update({
        where: {
          id: organizerId,
        },
        data: {
          status: 'REJECTED',
          rejectionReason: rejectionReason.trim(),
        },
      });

      await this.auditLogs.log(
        actorId ?? null,
        'REJECT',
        'OrganizerProfile',
        organizerId,
        {
          organizationName: organizer.organizationName,
          reason: rejectionReason.trim(),
        },
        tx,
      );

      return updated;
    });

    return {
      message: 'Organizer rejected successfully',
      organizer: updatedOrganizer,
    };
  }
}
