import {IsEmail, IsInt, IsNotEmpty, IsOptional, IsStrongPassword, Length, MaxLength} from "class-validator";

export class RegisterDto {
    @IsNotEmpty()
    @IsEmail()
    email!: string;

    @IsNotEmpty()
    @Length(2,120)
    nom!: string;

    @IsStrongPassword({minLength: 12, minLowercase:1, minUppercase:1, minSymbols:1, minNumbers:1})
    @MaxLength(32)
    mot_de_passe!: string;

    @IsOptional()
    @IsInt()
    code_invitation?: number;

    @IsOptional()
    @Length(2,120)
    nom_organisation?: string;
}