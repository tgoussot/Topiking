import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique } from "typeorm"
import { IsInt } from "class-validator"
import { Session } from "./Session"
import { Theme } from "./Theme"

// Entité de jonction pour l'association qualifiée PORTE SUR (Session 1,n — 0,n Theme, attribut numero_manche)
@Entity()
@Unique(["id_session", "id_theme"])
@Unique(["id_session", "numero_manche"])
export class SessionTheme {
    @PrimaryGeneratedColumn()
    id!: number

    @Column()
    @IsInt()
    numero_manche!: number

    // Côté Session de l'association qualifiée PORTE SUR : chaque ligne SessionTheme
    // rattache une manche (numero_manche) à une session précise
    @ManyToOne(() => Session, (session) => session.manches)
    @JoinColumn({ name: "id_session" })
    session!: Session

    @Column()
    @IsInt()
    id_session!: number

    // Côté Theme de l'association qualifiée PORTE SUR : chaque ligne SessionTheme
    // indique quel thème est joué pour cette manche
    @ManyToOne(() => Theme, (theme) => theme.manches)
    @JoinColumn({ name: "id_theme" })
    theme!: Theme

    @Column()
    @IsInt()
    id_theme!: number
}
