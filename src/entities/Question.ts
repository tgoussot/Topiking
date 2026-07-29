import { BaseEntity, Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from "typeorm"
import { IsInt, IsNotEmpty, Max, Min } from "class-validator"
import { Theme } from "./Theme"
import { ReponseParticipant } from "./ReponseParticipant"
import { SessionQuestion } from "./SessionQuestion"

@Entity()
export class Question extends BaseEntity {
    @PrimaryGeneratedColumn()
    id!: number

    @Column()
    @IsNotEmpty()
    enonce!: string

    @Column({ type: "varchar", nullable: true })
    explication?: string | null

    @Column()
    @IsNotEmpty()
    proposition_1!: string

    @Column()
    @IsNotEmpty()
    proposition_2!: string

    @Column()
    @IsNotEmpty()
    proposition_3!: string

    @Column()
    @IsNotEmpty()
    proposition_4!: string

    @Column()
    @IsInt()
    @Min(1)
    @Max(4)
    index_bonne_reponse!: number

    @Column()
    @IsInt()
    duree_s!: number

    // Relation CONTIENT : 1,n (Theme) — 1,1 (Question)
    // Une question appartient à un seul thème, un thème contient plusieurs questions
    @ManyToOne(() => Theme, (theme) => theme.questions)
    @JoinColumn({ name: "id_theme" })
    theme!: Theme

    @Column()
    @IsInt()
    id_theme!: number

    // Relation REPOND : passe par une entité de jonction (ReponseParticipant)
    // car elle porte les attributs reponse_choisie, temps_reponse_ms, points (0,n — 0,n avec attribut = association qualifiée)
    @OneToMany(() => ReponseParticipant, (reponse) => reponse.question)
    reponses!: ReponseParticipant[]

    // Sessions dans lesquelles cette question a été tirée
    @OneToMany(() => SessionQuestion, (sessionQuestion) => sessionQuestion.question)
    tirages!: SessionQuestion[]
}
