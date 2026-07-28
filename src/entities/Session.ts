import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn } from "typeorm"
import {IsDate, IsIn, IsInt, Length} from "class-validator"
import {Utilisateur} from "./Utilisateur"
import { Participant } from "./Participant"
import { SessionTheme } from "./SessionTheme"

@Entity()
export class Session {
    @PrimaryGeneratedColumn()
    id!: number

    @Column({ unique: true, length: 6 })
    @Length(6, 6)
    code_acces!: string

    @Column()
    @IsIn(["en_attente", "en_cours", "terminee"])
    statut!: string

    @Column({ type: "timestamp", nullable: true })
    @IsDate()
    date_debut!: Date

    @Column({ type: "timestamp", nullable: true })
    @IsDate()
    date_fin!: Date

    // Relation ANIME : 0,n (User) — 1,1 (Session)
    // Une session a un seul animateur, un animateur peut animer plusieurs sessions
    @ManyToOne(() => Utilisateur, (utilisateur) => utilisateur.sessions)
    @JoinColumn({ name: "id_animateur" })
    animateur!: Utilisateur

    @Column()
    @IsInt()
    id_animateur!: number

    // Relation REJOINT : 1,n (Session) — 1,1 (Participant)
    // Une session a plusieurs participants
    @OneToMany(() => Participant, (participant) => participant.session)
    participants!: Participant[]

    // Relation PORTE SUR : passe par une entité de jonction
    // car elle porte l'attribut numero_manche (0,n — 1,n avec attribut = association qualifiée)
    @OneToMany(() => SessionTheme, (sessionTheme) => sessionTheme.session)
    manches!: SessionTheme[]
}