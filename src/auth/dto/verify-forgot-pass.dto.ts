import { IsEmail, Length } from "class-validator";

export class VerifyForgotPassDto {
    @IsEmail()
    email!:string;

    @Length(6, 6)
    code!: string;
}