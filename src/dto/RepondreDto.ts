import {IsInt, Max, Min} from "class-validator";
import {Type} from "class-transformer";

export class RepondreDto {
    @IsInt()
    @Min(1)
    @Type(() => Number)
    id_question!: number;

    @IsInt()
    @Min(1)
    @Max(4)
    @Type(() => Number)
    index_choisi!: number;
}
