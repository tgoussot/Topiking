import {Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn} from "typeorm";
import {IsBoolean, IsInt, IsNotEmpty, IsOptional} from "class-validator";
import {Organisation} from "./Organisation";
import {Question} from "./Question";
import {SessionTheme} from "./SessionTheme";

@Entity()
export class Theme{
    @PrimaryGeneratedColumn()
    id!: number

    @Column()
    @IsNotEmpty()
    libelle!: string

    @Column({ type: "varchar", nullable: true})
    @IsOptional()
    description?: string | null

    @Column()
    @IsBoolean()
    actif!: boolean

    // Relation PROPOSE : 1,n (Organisation) — 1,1 (Theme)
    // Un thème appartient à une seule organisation, une organisation propose plusieurs thèmes
    @ManyToOne( () => Organisation, (organisation) => organisation.themes)
    @JoinColumn({name: "id_organisation"})
    organisation!: Organisation

    @Column()
    @IsInt()
    id_organisation!: number

    // Relation CONTIENT : 1,n (Theme) — 1,1 (Question)
    // Un thème contient plusieurs questions, une question appartient à un seul thème
    @OneToMany(() => Question, (question) => question.theme)
    questions!: Question[]

    // Relation PORTE SUR : passe par une entité de jonction (SessionTheme)
    // car elle porte l'attribut numero_manche (0,n — 1,n avec attribut = association qualifiée)
    @OneToMany(() => SessionTheme, (sessionTheme) => sessionTheme.theme)
    manches!: SessionTheme[]
}