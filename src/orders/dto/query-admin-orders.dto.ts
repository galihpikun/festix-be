import { IsOptional, IsEnum, IsString } from 'class-validator';
import { PaginationDto } from '../../shared/dto/pagination.dto';
import { PaymentStatus } from '../../../generated/prisma/client';

export class QueryAdminOrdersDto extends PaginationDto {
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}
