import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class ApplyOrganizerDto {
  @IsNotEmpty()
  @IsString()
  organizationName!: string;

  @IsNotEmpty()
  @IsString()
  phoneNumber!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(10)
  address!: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{16}$/, {
    message: 'Identity card number must be 16 digits',
  })
  identityCardNumber!: string;

  @IsNotEmpty()
  @IsString()
  bankName!: string;

  @IsNotEmpty()
  @IsString()
  bankAccountNumber!: string;

  @IsNotEmpty()
  @IsString()
  bankAccountName!: string;
}
