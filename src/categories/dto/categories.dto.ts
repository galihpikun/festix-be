import { IsNotEmpty } from 'class-validator';
export class categoryDto {
  @IsNotEmpty()
  name!: string;
}
