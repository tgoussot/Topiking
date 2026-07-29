import { BaseEntity, Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from "typeorm"
import { IsInt, IsNotEmpty } from "class-validator"
import { Session } from "./Session"
import { ReponseParticipant } from "./ReponseParticipant"
import { ReceptionCarte } from "./ReceptionCarte"

@Entity()
export class Participant extends BaseEntity {
    @PrimaryGeneratedColumn()
    id!: number

    @Column()
    @IsNotEmpty()
    pseudo!: string

    @Column()
    @IsInt()
    score_total!: number

    // Relation REJOINT : 1,n (Session) — 1,1 (Participant)
    // Un participant appartient à une seule session, une session a plusieurs participants
    @ManyToOne(() => Session, (session) => session.participants)
    @JoinColumn({ name: "id_session" })
    session!: Session

    @Column()
    @IsInt()
    id_session!: number

    // Relation REPOND : passe par une entité de jonction (ReponseParticipant)
    // car elle porte les attributs reponse_choisie, temps_reponse_ms, points (0,n — 0,n avec attribut = association qualifiée)
    @OneToMany(() => ReponseParticipant, (reponse) => reponse.participant)
    reponses!: ReponseParticipant[]

    // Relation RECOIT : passe par une entité de jonction (ReceptionCarte)
    // car elle porte les attributs numero_manche, statut, id_cible (0,n — 0,n avec attribut = association qualifiée)
    @OneToMany(() => ReceptionCarte, (reception) => reception.participant)
    receptions!: ReceptionCarte[]
}
