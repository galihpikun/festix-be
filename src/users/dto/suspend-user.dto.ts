import { IsNotEmpty, IsString } from 'class-validator';

export class SuspendUserDto {
  @IsNotEmpty()
  @IsString()
  reason: string;
}
