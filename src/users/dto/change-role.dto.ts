import { IsNotEmpty, IsEnum } from 'class-validator';
import { Role } from '../../../generated/prisma/client';

export class ChangeRoleDto {
  @IsNotEmpty()
  @IsEnum(Role)
  role: Role;
}
