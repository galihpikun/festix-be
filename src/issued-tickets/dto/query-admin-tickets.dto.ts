import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../shared/dto/pagination.dto';

export class QueryAdminTicketsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  eventId?: string;

  @IsOptional()
  isRedeemed?: string;

  @IsOptional()
  isCancelled?: string;
}
