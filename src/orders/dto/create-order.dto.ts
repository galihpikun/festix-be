import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsUUID, Min } from 'class-validator';

export class CreateOrderDto {

  @IsNotEmpty()
  @IsUUID()
  ticketTypeId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity!: number;
}
