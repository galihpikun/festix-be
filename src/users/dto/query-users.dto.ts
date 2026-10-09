import { IsOptional, IsEnum } from 'class-validator';
import { PaginationDto } from '../../shared/dto/pagination.dto';
import { Role } from '../../../generated/prisma/client';

export class QueryUsersDto extends PaginationDto {
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  isSuspended?: string;
}
