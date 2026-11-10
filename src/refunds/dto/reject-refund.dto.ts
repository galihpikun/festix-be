import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class RejectRefundDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}
