import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from "typeorm"
import { IsIn, IsInt, IsOptional } from "class-validator"
import { Participant } from "./Participant"
import { Carte } from "./Carte"

// Entité de jonction pour l'association qualifiée RECOIT (Participant 0,n — 0,n Carte,
// attributs numero_manche, statut, id_cible optionnel si malus ciblant un autre participant)
@Entity()
export class ReceptionCarte {
    @PrimaryGeneratedColumn()
    id!: number

    @Column()
    @IsInt()
    numero_manche!: number

    @Column({ type: "int", nullable: true })
    @IsOptional()
    @IsInt()
    manche_application?: number | null

    @Column()
    @IsIn(["en_main", "jouee", "expiree"])
    statut!: string

    // Côté Participant (bénéficiaire) de l'association qualifiée RECOIT : chaque ligne
    // ReceptionCarte rattache une carte reçue à son participant bénéficiaire
    @ManyToOne(() => Participant, (participant) => participant.receptions)
    @JoinColumn({ name: "id_participant" })
    participant!: Participant

    @Column()
    @IsInt()
    id_participant!: number

    // Côté Carte de l'association qualifiée RECOIT : indique quelle carte (bonus/malus) a été reçue
    @ManyToOne(() => Carte, (carte) => carte.receptions)
    @JoinColumn({ name: "id_carte" })
    carte!: Carte

    @Column()
    @IsInt()
    id_carte!: number

    // Relation optionnelle vers le participant ciblé par un malus (0,1)
    // Pas de relation inverse déclarée côté Participant : on ne veut pas naviguer "qui m'a ciblé" depuis Participant
    @ManyToOne(() => Participant, { nullable: true })
    @JoinColumn({ name: "id_cible" })
    cible?: Participant | null

    @Column({ type: "int", nullable: true })
    @IsOptional()
    @IsInt()
    id_cible?: number | null
}
