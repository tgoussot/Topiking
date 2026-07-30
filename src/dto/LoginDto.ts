import {IsEmail, IsNotEmpty, MaxLength} from "class-validator";

export class LoginDto {
    @IsNotEmpty()
    @IsEmail()
    email!: string;

    @IsNotEmpty()
    @MaxLength(32)
    mot_de_passe!: string;
}