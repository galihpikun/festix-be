import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { QueryUsersDto } from './dto/query-users.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { buildPaginatedResponse } from '../shared/helpers/paginate';
import { Prisma, Role } from '../../generated/prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async findAll(query?: QueryUsersDto) {
    const page = query?.page || 1;
    const limit = query?.limit || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (query?.role) {
      where.role = query.role;
    }

    if (query?.isSuspended !== undefined) {
      where.isSuspended = query.isSuspended === 'true';
    }

    if (query?.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          fullName: true,
          avatar: true,
          role: true,
          emailVerified: true,
          isSuspended: true,
          suspendedAt: true,
          suspendReason: true,
          createdAt: true,
          updatedAt: true,
          organizerProfile: {
            select: {
              id: true,
              organizationName: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return buildPaginatedResponse(users, total, page, limit);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatar: true,
        role: true,
        emailVerified: true,
        isSuspended: true,
        suspendedAt: true,
        suspendReason: true,
        createdAt: true,
        updatedAt: true,
        organizerProfile: {
          select: {
            id: true,
            organizationName: true,
            status: true,
            phoneNumber: true,
          },
        },
        _count: {
          select: {
            events: true,
            orders: true,
            assignedEvents: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async changeRole(userId: string, dto: ChangeRoleDto, currentAdminId: string) {
    if (userId === currentAdminId) {
      throw new ForbiddenException('You cannot change your own role');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === dto.role) {
      throw new ConflictException(`User is already in role ${dto.role}`);
    }

    // If demoting an ADMIN, ensure at least one other ADMIN remains
    if (user.role === Role.ADMIN) {
      const adminCount = await this.prisma.user.count({
        where: { role: Role.ADMIN },
      });

      if (adminCount <= 1) {
        throw new ForbiddenException(
          'Cannot demote the last administrator. The system must have at least one active administrator.',
        );
      }
    }

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { role: dto.role },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
        },
      });

      await this.auditLogs.log(
        currentAdminId,
        'CHANGE_ROLE',
        'User',
        userId,
        {
          previousRole: user.role,
          newRole: dto.role,
        },
        tx,
      );

      return updated;
    });

    return {
      message: `User role updated to ${dto.role}`,
      user: updatedUser,
    };
  }

  async suspendUser(
    userId: string,
    dto: SuspendUserDto,
    currentAdminId: string,
  ) {
    if (userId === currentAdminId) {
      throw new ForbiddenException('You cannot suspend your own account');
    }

    if (!dto.reason || !dto.reason.trim()) {
      throw new BadRequestException('Suspension reason is required');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isSuspended) {
      throw new ConflictException('User is already suspended');
    }

    if (user.role === Role.ADMIN) {
      throw new ForbiddenException('Cannot suspend an administrator account');
    }

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          isSuspended: true,
          suspendedAt: new Date(),
          suspendReason: dto.reason.trim(),
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          isSuspended: true,
          suspendedAt: true,
          suspendReason: true,
        },
      });

      await this.auditLogs.log(
        currentAdminId,
        'SUSPEND',
        'User',
        userId,
        {
          reason: dto.reason.trim(),
        },
        tx,
      );

      return updated;
    });

    return {
      message: 'User suspended successfully',
      user: updatedUser,
    };
  }

  async unsuspendUser(userId: string, currentAdminId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isSuspended) {
      throw new ConflictException('User is not suspended');
    }

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          isSuspended: false,
          suspendedAt: null,
          suspendReason: null,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          isSuspended: true,
        },
      });

      await this.auditLogs.log(
        currentAdminId,
        'UNSUSPEND',
        'User',
        userId,
        {},
        tx,
      );

      return updated;
    });

    return {
      message: 'User unsuspended successfully',
      user: updatedUser,
    };
  }
}
