import {IsInt, Min} from "class-validator";
import {Type} from "class-transformer";

export class OuvrirQuestionDto {
    @IsInt()
    @Min(1)
    @Type(() => Number)
    numero_manche!: number;

    @IsInt()
    @Min(1)
    @Type(() => Number)
    ordre!: number;
}
