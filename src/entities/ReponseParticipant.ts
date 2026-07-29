import { BaseEntity, Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique } from "typeorm"
import { IsInt, IsOptional, Max, Min } from "class-validator"
import { Participant } from "./Participant"
import { Question } from "./Question"

// Entité de jonction pour l'association qualifiée REPOND (Participant 0,n — 0,n Question,
// attributs reponse_choisie, temps_reponse_ms, points)
@Entity()
@Unique(["id_participant", "id_question"])
export class ReponseParticipant extends BaseEntity {
    @PrimaryGeneratedColumn()
    id!: number

    @Column({ type: "int", nullable: true })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(4)
    reponse_choisie!: number | null

    @Column()
    @IsInt()
    temps_reponse_ms!: number

    @Column()
    @IsInt()
    points!: number

    // Côté Participant de l'association qualifiée REPOND : chaque ligne ReponseParticipant
    // rattache une réponse (avec son score, son temps, sa réponse choisie) à un participant précis
    @ManyToOne(() => Participant, (participant) => participant.reponses)
    @JoinColumn({ name: "id_participant" })
    participant!: Participant

    @Column()
    @IsInt()
    id_participant!: number

    // Côté Question de l'association qualifiée REPOND : chaque ligne ReponseParticipant
    // indique à quelle question cette réponse correspond
    @ManyToOne(() => Question, (question) => question.reponses)
    @JoinColumn({ name: "id_question" })
    question!: Question

    @Column()
    @IsInt()
    id_question!: number
}
