import {BaseEntity, Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn} from "typeorm"
import {IsInt, IsMimeType, IsNotEmpty} from "class-validator"
import {Utilisateur} from "./Utilisateur"

@Entity()
export class Media extends BaseEntity {
    @PrimaryGeneratedColumn()
    id!: number

    @Column({unique: true})
    @IsNotEmpty()
    cle!: string

    @Column()
    @IsMimeType()
    mimetype!: string

    @Column()
    @IsNotEmpty()
    nom_original!: string

    @Column()
    @IsInt()
    taille!: number

    // Relation TELEVERSE : 1,n (Utilisateur) — 1,1 (Media)
    // Un utilisateur téléverse plusieurs médias, un média a un seul auteur
    @ManyToOne(() => Utilisateur)
    @JoinColumn({name: "id_utilisateur"})
    televerse_par!: Utilisateur

    @Column()
    @IsInt()
    id_utilisateur!: number
}
