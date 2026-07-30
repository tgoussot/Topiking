import {ArrayMaxSize, ArrayMinSize, IsArray, IsInt, Min} from "class-validator";
import {Type} from "class-transformer";
import {NOMBRE_MANCHES} from "../config/config";

export class CreerSessionDto {
    @IsArray()
    @ArrayMinSize(NOMBRE_MANCHES)
    @ArrayMaxSize(NOMBRE_MANCHES)
    @IsInt({each: true})
    @Min(1, {each: true})
    @Type(() => Number)
    id_themes!: number[];
}
