import {BaseEntity, Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany} from "typeorm"
import {IsEmail, IsHash, IsInt, IsOptional} from "class-validator";
import {Organisation} from "./Organisation";
import {Session} from "./Session";
import {Media} from "./Media";
import {Exclude} from "class-transformer";

@Entity()
export class Utilisateur extends BaseEntity {
    @PrimaryGeneratedColumn()
    id!: number

    @Column({ unique: true})
    @IsEmail()
    email!: string

    @Column()
    nom!: string

    @Column()
    @Exclude() // abs req
    mot_de_passe!: string

    // Relation REGROUPE : 1,n (Organisation) — 1,1 (Utilisateur)
    // Un utilisateur appartient à une seule organisation, une organisation regroupe plusieurs utilisateurs
    @ManyToOne(() => Organisation, (organisation) => organisation.utilisateurs)
    @JoinColumn({ name: "id_organisation"})
    organisation!: Organisation

    @Column()
    @IsInt()
    id_organisation!: number

    // Relation AFFICHE : 0,n (Media) — 0,1 (Utilisateur)
    // Un média sert d'avatar à plusieurs utilisateurs, un utilisateur a au plus un avatar
    @ManyToOne(() => Media, {nullable: true, onDelete: "SET NULL"})
    @JoinColumn({name: "id_media"})
    avatar!: Media | null

    @Column({nullable: true})
    @IsOptional()
    @IsInt()
    id_media!: number | null

    // Relation ANIME : 0,n (Utilisateur) — 1,1 (Session)
    // Un utilisateur peut animer plusieurs sessions (ou aucune), une session a un seul animateur
    @OneToMany(() => Session, (session) => session.animateur)
    sessions!: Session[]
}