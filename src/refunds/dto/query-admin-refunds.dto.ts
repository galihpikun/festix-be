import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationDto } from '../../shared/dto/pagination.dto';
import { RefundStatus, RefundType } from '../../../generated/prisma/client';

export class QueryAdminRefundsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(RefundStatus)
  status?: RefundStatus;

  @IsOptional()
  @IsEnum(RefundType)
  type?: RefundType;

  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsOptional()
  @IsUUID()
  orderId?: string;
}
