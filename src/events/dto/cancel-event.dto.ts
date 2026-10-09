import { IsNotEmpty, IsString } from 'class-validator';

export class CancelEventDto {
  @IsNotEmpty()
  @IsString()
  reason: string;
}
