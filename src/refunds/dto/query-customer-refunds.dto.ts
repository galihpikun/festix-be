import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../shared/dto/pagination.dto';
import { RefundStatus, RefundType } from '../../../generated/prisma/client';

export class QueryCustomerRefundsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(RefundStatus)
  status?: RefundStatus;

  @IsOptional()
  @IsEnum(RefundType)
  type?: RefundType;
}
