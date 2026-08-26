import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ApplyOrganizerDto } from './dto/apply-org';

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

  async getAllOrganizerApplications() {
    return await this.prisma.organizerProfile.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
        documents: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
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

  async approveOrganizer(organizerId: string) {
    const organizer = await this.prisma.organizerProfile.findUnique({
      where: {
        id: organizerId,
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

    const updatedOrganizer = await this.prisma.organizerProfile.update({
      where: {
        id: organizerId,
      },
      data: {
        status: 'APPROVED',
        rejectionReason: null,
      },
    });

    return {
      message: 'Organizer approved successfully',
      organizer: updatedOrganizer,
    };
  }

  async rejectOrganizer(organizerId: string, rejectionReason: string) {
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

    const updatedOrganizer = await this.prisma.organizerProfile.update({
      where: {
        id: organizerId,
      },
      data: {
        status: 'REJECTED',
        rejectionReason,
      },
    });

    return {
      message: 'Organizer rejected successfully',
      organizer: updatedOrganizer,
    };
  }
}
