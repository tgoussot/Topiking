import {IsInt, IsOptional, Min} from "class-validator";
import {Type} from "class-transformer";

export class JouerCarteDto {
    @IsInt()
    @Min(1)
    @Type(() => Number)
    id_reception!: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Type(() => Number)
    id_cible?: number | null;
}
