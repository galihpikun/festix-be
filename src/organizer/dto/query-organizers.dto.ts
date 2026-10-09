import { IsOptional, IsEnum } from 'class-validator';
import { PaginationDto } from '../../shared/dto/pagination.dto';
import { OrganizerStatus } from '../../../generated/prisma/client';

export class QueryOrganizersDto extends PaginationDto {
  @IsOptional()
  @IsEnum(OrganizerStatus)
  status?: OrganizerStatus;
}
