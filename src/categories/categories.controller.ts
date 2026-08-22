import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { Roles } from 'src/auth/decorators/role.decorator';
import { RoleGuard } from 'src/auth/guards/role.guard';
import { categoryDto } from './dto/categories.dto';

@Controller('categories')
export class CategoriesController {
    constructor(
        private readonly catService: CategoriesService
    ) {}

    @UseGuards(JwtAuthGuard)
    @Get()
    getCategories() {
        return this.catService.getCategories();
    }

    @Roles('ADMIN') //Role Guard JWT
    @UseGuards(JwtAuthGuard, RoleGuard)
    @Post()
    createCategories(@Body() dto: categoryDto) {
        return this.catService.createCat(dto);
    }

    @Roles('ADMIN') //Role Guard JWT
    @UseGuards(JwtAuthGuard, RoleGuard)
    @Put(':id')
    editCategories(@Body() dto: categoryDto, @Param('id') catId : string) {
        return this.catService.editCat(dto, catId);
    }

    @Roles('ADMIN') //Role Guard JWT
    @UseGuards(JwtAuthGuard, RoleGuard)
    @Delete(':id')
    deleteCategories( @Param('id') catId : string) {
        return this.catService.deleteCat(catId);
    }


}
