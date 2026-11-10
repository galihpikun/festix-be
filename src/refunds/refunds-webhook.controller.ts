import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { RefundsService } from './refunds.service';

@Controller('refunds/webhook')
export class RefundsWebhookController {
  constructor(private readonly refundsService: RefundsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  handleWebhook(@Headers('x-callback-token') token: string, @Body() body: any) {
    return this.refundsService.handleWebhook(token, body);
  }
}
