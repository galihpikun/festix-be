import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class PaymentsService {
  async handleWebhook(token: string, body: any) {
    if (token !== process.env.XENDIT_WEBHOOK_TOKEN) {
      throw new ForbiddenException('Invalid webhook token');
    }

    console.log('Xendit webhook:', body);

    return {
      message: 'Webhook received',
    };
  }
}