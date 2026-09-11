import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateOrderDto } from './dto/create-order.dto';
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
