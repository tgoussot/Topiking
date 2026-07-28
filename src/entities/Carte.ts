import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from "typeorm"
import { IsIn, IsNotEmpty, IsInt } from "class-validator"
import { ReceptionCarte } from "./ReceptionCarte"

@Entity()
export class Carte {
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

    // Relation RECOIT : passe par une entité de jonction (ReceptionCarte)
    // car elle porte les attributs numero_manche, statut, id_cible (0,n — 0,n avec attribut = association qualifiée)
    @OneToMany(() => ReceptionCarte, (reception) => reception.carte)
    receptions!: ReceptionCarte[]
}
