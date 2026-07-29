import { BaseEntity, Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn } from "typeorm"
import {IsDate, IsIn, IsInt, IsOptional} from "class-validator"
import {Utilisateur} from "./Utilisateur"
import { Participant } from "./Participant"
import { SessionTheme } from "./SessionTheme"
import { SessionQuestion } from "./SessionQuestion"

@Entity()
export class Session extends BaseEntity {
    @PrimaryGeneratedColumn()
    id!: number

    // Code à 6 chiffres saisi par les joueurs pour rejoindre la partie.
    // Toujours tiré entre 100000 et 999999 pour ne jamais commencer par un zéro.
    @Column()
    @IsInt()
    code_acces!: number

    @Column()
    @IsIn(["en_attente", "en_cours", "terminee", "annulee"])
    statut!: string

    @Column({ type: "timestamp", nullable: true })
    @IsOptional()
    @IsDate()
    date_debut!: Date | null

    @Column({ type: "timestamp", nullable: true })
    @IsOptional()
    @IsDate()
    date_fin!: Date | null

    @Column({ type: "int", nullable: true })
    @IsOptional()
    @IsInt()
    id_question_courante!: number | null

    @Column({ type: "int", nullable: true })
    @IsOptional()
    @IsInt()
    numero_manche_courante!: number | null

    @Column({ type: "timestamp", nullable: true })
    @IsOptional()
    @IsDate()
    date_debut_question!: Date | null

    // Instant d'ouverture de la fenêtre pendant laquelle les joueurs peuvent
    // jouer leurs cartes, entre deux manches. null quand la fenêtre est fermée.
    @Column({ type: "timestamp", nullable: true })
    @IsOptional()
    @IsDate()
    date_debut_fenetre_cartes!: Date | null

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

    // Questions tirées au hasard à la création de la session, une fois pour toutes
    @OneToMany(() => SessionQuestion, (sessionQuestion) => sessionQuestion.session)
    questionsTirees!: SessionQuestion[]
}