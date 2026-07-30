import {IsBoolean, IsOptional, Length} from "class-validator";

export class ModifierThemeDto {
    @IsOptional()
    @Length(2, 120)
    libelle?: string;

    @IsOptional()
    @Length(0, 500)
    description?: string;

    @IsOptional()
    @IsBoolean()
    actif?: boolean;
}
