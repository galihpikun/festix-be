import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/role.decorator';
import { RoleGuard } from '../auth/guards/role.guard';
import { categoryDto } from './dto/categories.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly catService: CategoriesService) {}

  @Get()
  getCategories() {
    return this.catService.getCategories();
  }

  @Roles('ADMIN')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Post()
  createCategories(@Req() req: any, @Body() dto: categoryDto) {
    return this.catService.createCat(dto, req.user?.userId);
  }

  @Roles('ADMIN')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Put(':id')
  editCategories(
    @Req() req: any,
    @Body() dto: categoryDto,
    @Param('id') catId: string,
  ) {
    return this.catService.editCat(dto, catId, req.user?.userId);
  }

  @Roles('ADMIN')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Delete(':id')
  deleteCategories(@Req() req: any, @Param('id') catId: string) {
    return this.catService.deleteCat(catId, req.user?.userId);
  }
}
