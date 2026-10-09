import { IsOptional, IsString, IsEnum } from 'class-validator';
import { PaginationDto } from '../../shared/dto/pagination.dto';
import { EventStatus } from '../../../generated/prisma/client';

export class QueryAdminEventsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @IsOptional()
  @IsString()
  categoryId?: string;
}
