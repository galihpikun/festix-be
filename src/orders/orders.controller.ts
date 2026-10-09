import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { Roles } from '../auth/decorators/role.decorator';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryAdminOrdersDto } from './dto/query-admin-orders.dto';
import { OrdersService } from './orders.service';

type AuthenticatedRequest = Request & {
  user: {
    userId: string;
  };
};

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  createOrder(@Req() req: AuthenticatedRequest, @Body() dto: CreateOrderDto) {
    return this.ordersService.createOrder(req.user.userId, dto);
  }

  // ADMIN routes MUST come before :id to prevent 'admin' being parsed as orderId
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles('ADMIN')
  @Get('admin')
  getAdminOrders(@Query() query: QueryAdminOrdersDto) {
    return this.ordersService.getAdminOrders(query);
  }

  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles('ADMIN')
  @Get('admin/:id')
  getAdminOrderDetail(@Param('id') orderId: string) {
    return this.ordersService.getAdminOrderDetail(orderId);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  getOrders(@Req() req: AuthenticatedRequest) {
    return this.ordersService.getOrders(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  getOrderDetail(
    @Req() req: AuthenticatedRequest,
    @Param('id') orderId: string,
  ) {
    return this.ordersService.getOrderDetail(req.user.userId, orderId);
  }
}
