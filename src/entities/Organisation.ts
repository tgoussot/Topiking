import {Column, Entity, OneToMany, PrimaryGeneratedColumn} from "typeorm";
import {Length} from "class-validator";
import {Utilisateur} from "./Utilisateur";
import {Theme} from "./Theme";

@Entity()
export class Organisation{
    @PrimaryGeneratedColumn()
    id!: number

    @Column()
    @Length(2,120)
    nom!: string

    @Column({ unique: true})
    slug!: string

    // Relation REGROUPE : 1,n (Organisation) — 1,1 (Utilisateur)
    // Une organisation regroupe plusieurs utilisateurs, un utilisateur appartient à une seule organisation
    @OneToMany(() => Utilisateur, (utilisateur) => utilisateur.organisation)
    utilisateurs!: Utilisateur[]

    // Relation PROPOSE : 1,n (Organisation) — 1,1 (Theme)
    // Une organisation propose plusieurs thèmes, un thème appartient à une seule organisation
    @OneToMany (() => Theme, (theme) => theme.organisation)
    themes!: Theme[]
}