import {IsInt, IsNotEmpty, Max, Min} from "class-validator";
import {Type} from "class-transformer";
import {CODE_ACCES_MAXIMUM, CODE_ACCES_MINIMUM} from "../config/config";

export class RejoindreSessionDto {
    @IsInt()
    @Min(CODE_ACCES_MINIMUM)
    @Max(CODE_ACCES_MAXIMUM)
    @Type(() => Number)
    code_acces!: number;

    @IsNotEmpty()
    pseudo!: string;
}
