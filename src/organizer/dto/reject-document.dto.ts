import { IsNotEmpty, IsString } from 'class-validator';

export class RejectDocumentDto {
  @IsNotEmpty()
  @IsString()
  rejectionReason: string;
}
