import { IsNotEmpty, IsString } from 'class-validator';

export class TicketRedemptionDto {
  @IsNotEmpty()
  @IsString()
  ticketCode!: string;
}
