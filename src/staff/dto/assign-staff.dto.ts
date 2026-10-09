import { IsNotEmpty, IsUUID } from 'class-validator';

export class AssignStaffDto {
  @IsNotEmpty()
  @IsUUID()
  userId: string;

  @IsNotEmpty()
  @IsUUID()
  eventId: string;
}
