import {IsInt, IsOptional, Length, Max, Min} from "class-validator";
import {Type} from "class-transformer";

export class ModifierQuestionDto {
    @IsOptional()
    @Length(2, 500)
    enonce?: string;

    @IsOptional()
    @Length(0, 500)
    explication?: string;

    @IsOptional()
    @Length(1, 200)
    proposition_1?: string;

    @IsOptional()
    @Length(1, 200)
    proposition_2?: string;

    @IsOptional()
    @Length(1, 200)
    proposition_3?: string;

    @IsOptional()
    @Length(1, 200)
    proposition_4?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(4)
    @Type(() => Number)
    index_bonne_reponse?: number;

    @IsOptional()
    @IsInt()
    @Min(5)
    @Max(120)
    @Type(() => Number)
    duree_s?: number;
}
