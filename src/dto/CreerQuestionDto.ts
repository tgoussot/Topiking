import {IsInt, IsNotEmpty, IsOptional, Length, Max, Min} from "class-validator";
import {Type} from "class-transformer";

export class CreerQuestionDto {
    @IsNotEmpty()
    @Length(2, 500)
    enonce!: string;

    @IsOptional()
    @Length(0, 500)
    explication?: string;

    @IsNotEmpty()
    @Length(1, 200)
    proposition_1!: string;

    @IsNotEmpty()
    @Length(1, 200)
    proposition_2!: string;

    @IsNotEmpty()
    @Length(1, 200)
    proposition_3!: string;

    @IsNotEmpty()
    @Length(1, 200)
    proposition_4!: string;

    @IsInt()
    @Min(1)
    @Max(4)
    @Type(() => Number)
    index_bonne_reponse!: number;

    @IsInt()
    @Min(5)
    @Max(120)
    @Type(() => Number)
    duree_s!: number;
}
