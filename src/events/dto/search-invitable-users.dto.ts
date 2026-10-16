import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../shared/dto/pagination.dto';

export class SearchInvitableUsersDto extends PaginationDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  declare search: string;
}
