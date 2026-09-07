import {
  Body,
  Controller,
  Headers,
  Post,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post('webhook')
  handleWebhook(
    @Headers('x-callback-token') token: string,
    @Body() body: any,
  ) {
    return this.paymentsService.handleWebhook(token, body);
  }
}