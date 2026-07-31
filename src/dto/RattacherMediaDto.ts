import {IsInt, ValidateIf} from "class-validator";

export class RattacherMediaDto {
    @ValidateIf((objet) => objet.id_media !== null)
    @IsInt()
    id_media!: number | null;
}
