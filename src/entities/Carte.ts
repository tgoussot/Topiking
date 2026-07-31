import { BaseEntity, Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne, JoinColumn } from "typeorm"
import { IsIn, IsNotEmpty, IsInt, IsOptional } from "class-validator"
import { ReceptionCarte } from "./ReceptionCarte"
import { Media } from "./Media"

@Entity()
export class Carte extends BaseEntity {
    @PrimaryGeneratedColumn()
    id!: number

    @Column()
    @IsNotEmpty()
    libelle!: string

    @Column()
    @IsIn(["bonus", "malus"])
    type!: string

    @Column()
    @IsNotEmpty()
    effet!: string

    @Column()
    @IsInt()
    intensite!: number

    // Relation ILLUSTRE : 0,n (Media) — 0,1 (Carte)
    // Un média illustre plusieurs cartes, une carte a au plus une illustration
    @ManyToOne(() => Media, {nullable: true, onDelete: "SET NULL"})
    @JoinColumn({name: "id_media"})
    illustration!: Media | null

    @Column({nullable: true})
    @IsOptional()
    @IsInt()
    id_media!: number | null

    // Relation RECOIT : passe par une entité de jonction (ReceptionCarte)
    // car elle porte les attributs numero_manche, statut, id_cible (0,n — 0,n avec attribut = association qualifiée)
    @OneToMany(() => ReceptionCarte, (reception) => reception.carte)
    receptions!: ReceptionCarte[]
}
