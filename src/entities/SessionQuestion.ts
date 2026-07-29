import { BaseEntity, Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique } from "typeorm"
import { IsInt } from "class-validator"
import { Session } from "./Session"
import { Question } from "./Question"

// Tirage figé des questions d'une session.
// Les questions sont mélangées à la création de la session puis enregistrées ici :
// le serveur sait ainsi exactement quoi poser, et deux parties sur le même thème
// ne tombent pas sur les mêmes questions.
@Entity()
@Unique(["id_session", "numero_manche", "ordre"])
@Unique(["id_session", "id_question"])
export class SessionQuestion extends BaseEntity {
    @PrimaryGeneratedColumn()
    id!: number

    @Column()
    @IsInt()
    numero_manche!: number

    @Column()
    @IsInt()
    ordre!: number

    // Côté Session : chaque ligne rattache une question tirée à une session précise
    @ManyToOne(() => Session, (session) => session.questionsTirees)
    @JoinColumn({ name: "id_session" })
    session!: Session

    @Column()
    @IsInt()
    id_session!: number

    // Côté Question : indique quelle question du thème a été tirée
    @ManyToOne(() => Question, (question) => question.tirages)
    @JoinColumn({ name: "id_question" })
    question!: Question

    @Column()
    @IsInt()
    id_question!: number
}
