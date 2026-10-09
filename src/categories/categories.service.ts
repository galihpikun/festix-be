import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import slugify from 'slugify';
import { categoryDto } from './dto/categories.dto';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async getCategories() {
    const categories = await this.prisma.category.findMany({
      include: {
        _count: {
          select: { events: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      eventCount: cat._count.events,
      createdAt: cat.createdAt,
      updatedAt: cat.updatedAt,
    }));
  }

  async createCat(dto: categoryDto, actorId?: string) {
    const slugName = slugify(dto.name, { lower: true, strict: true });

    try {
      const category = await this.prisma.$transaction(async (tx) => {
        const cat = await tx.category.create({
          data: {
            name: dto.name,
            slug: slugName,
          },
        });

        await this.auditLogs.log(
          actorId ?? null,
          'CREATE',
          'Category',
          cat.id,
          { name: cat.name, slug: cat.slug },
          tx,
        );

        return cat;
      });

      return {
        message: 'Category created successfully',
        data: category,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Category with this name or slug already exists',
        );
      }
      throw error;
    }
  }

  async editCat(dto: categoryDto, catId: string, actorId?: string) {
    const existing = await this.prisma.category.findUnique({
      where: { id: catId },
    });

    if (!existing) {
      throw new NotFoundException('Category not found');
    }

    const slugName = slugify(dto.name, { lower: true, strict: true });

    try {
      const category = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.category.update({
          where: { id: catId },
          data: {
            name: dto.name,
            slug: slugName,
          },
        });

        await this.auditLogs.log(
          actorId ?? null,
          'UPDATE',
          'Category',
          catId,
          {
            before: { name: existing.name, slug: existing.slug },
            after: { name: updated.name, slug: updated.slug },
          },
          tx,
        );

        return updated;
      });

      return {
        message: 'Category successfully updated',
        data: category,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Category with this name or slug already exists',
        );
      }
      throw error;
    }
  }

  async deleteCat(catId: string, actorId?: string) {
    const catExist = await this.prisma.category.findUnique({
      where: { id: catId },
      include: {
        _count: {
          select: { events: true },
        },
      },
    });

    if (!catExist) {
      throw new NotFoundException('Category not found');
    }

    if (catExist._count.events > 0) {
      throw new ConflictException(
        `Cannot delete category. It is referenced by ${catExist._count.events} event(s).`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.category.delete({
        where: { id: catId },
      });

      await this.auditLogs.log(
        actorId ?? null,
        'DELETE',
        'Category',
        catId,
        { name: catExist.name, slug: catExist.slug },
        tx,
      );
    });

    return {
      message: 'Category successfully deleted',
    };
  }
}
