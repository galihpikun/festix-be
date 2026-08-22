import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import slugify from 'slugify';
import { categoryDto } from './dto/categories.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async getCategories() {
    return await this.prisma.category.findMany();
  }

  async createCat(dto: categoryDto) {
    const slugName = slugify(dto.name, { lower: true, strict: true });

    const categories = await this.prisma.category.create({
      data: {
        name: dto.name,
        slug: slugName,
      },
    });

    return {
      message: 'Category Berhasil dibuat',
      data: categories,
    };
  }

  async editCat(dto: categoryDto, catId: string) {
    const slugName = slugify(dto.name, { lower: true, strict: true });

    const categories = await this.prisma.category.update({
      where: {
        id: catId,
      },
      data: {
        name: dto.name,
        slug: slugName,
      },
    });

    return {
      message: 'Categori successfully updated',
      data: categories,
    };
  }
  async deleteCat(catId: string) {
    const catExist = await this.prisma.category.findUnique({
      where: { id: catId },
    });

    if (!catExist) {
      throw new NotFoundException('Category not found');
    }

    const category = await this.prisma.category.delete({
      where: {
        id: catId,
      },
    });

    return {
      message: 'Category succesfully deleted',
    };
  }
}
