#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════
#  TOPIKING — Pilote de partie
#  Déroule une partie complète en REST pendant que des clients
#  WebSocket observent les diffusions en direct.
# ══════════════════════════════════════════════════════════════════

set -uo pipefail

BASE="${BASE:-http://localhost:3301}"
# Compte du seed : Hugo Martin anime pour « IUT Informatique Lyon », la seule
# organisation qui porte les thèmes 4/5/8. Un compte créé à la main ne survit
# pas au seed, qui tronque la table « utilisateur » à chaque exécution.
EMAIL="${EMAIL:-hugo.martin@iut-lyon.fr}"
MDP="${MDP:-MotDePasse1!}"
# Algorithmique, Réseaux, Bases de données — les trois thèmes actifs de l'IUT.
THEMES="${THEMES:-[4, 5, 8]}"
JOUEURS="${JOUEURS:-3}"
MANCHES="${MANCHES:-3}"
QUESTIONS="${QUESTIONS:-3}"

JAR="$(mktemp -t topiking-anim)"
TOKENS_DIR="$(mktemp -d -t topiking-joueurs)"
trap 'rm -f "$JAR"; rm -rf "$TOKENS_DIR"' EXIT

# ─── Couleurs ──────────────────────────────────────────────────────
if [ -t 1 ]; then
  R=$'\e[0m'; B=$'\e[1m'; D=$'\e[2m'
  CY=$'\e[36m'; GN=$'\e[32m'; YL=$'\e[33m'; RD=$'\e[31m'; MG=$'\e[35m'; BL=$'\e[34m'
else
  R=""; B=""; D=""; CY=""; GN=""; YL=""; RD=""; MG=""; BL=""
fi

banniere() {
  printf '%s' "$MG$B"
  cat <<'ASCII'
 ████████╗ ██████╗ ██████╗ ██╗██╗  ██╗██╗███╗   ██╗ ██████╗
 ╚══██╔══╝██╔═══██╗██╔══██╗██║██║ ██╔╝██║████╗  ██║██╔════╝
    ██║   ██║   ██║██████╔╝██║█████╔╝ ██║██╔██╗ ██║██║  ███╗
    ██║   ██║   ██║██╔═══██╗██║██╔═██╗ ██║██║╚██╗██║██║   ██║
    ██║   ╚██████╔╝██║     ██║██║  ██╗██║██║ ╚████║╚██████╔╝
    ╚═╝    ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝
ASCII
  printf '%s' "$R"
  echo "$D                     pilote de partie — REST + WebSocket$R"
  echo
}

titre() { printf '\n%s┌─ %s%s\n' "$CY$B" "$1" "$R"; }
etape() { printf '%s│%s  %s\n' "$CY" "$R" "$1"; }
ok()    { printf '%s│%s  %s✔%s %s\n' "$CY" "$R" "$GN" "$R" "$1"; }
ko()    { printf '%s│%s  %s✘%s %s\n' "$CY" "$R" "$RD" "$R" "$1"; }
push()  { printf '%s│%s  %s⟶%s %s%s%s\n' "$CY" "$R" "$YL" "$R" "$D" "$1" "$R"; }
fin()   { printf '%s└─%s\n' "$CY" "$R"; }

mourir() { printf '\n%s✘ %s%s\n  %s%s%s\n' "$RD$B" "$1" "$R" "$D" "$2" "$R"; exit 1; }

# ─── Extraction JSON (sans jq) ─────────────────────────────────────
champ() { # champ <json> <clef>  → valeur numérique ou chaîne
  echo "$1" | sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\"\{0,1\}\([^,\"}]*\).*/\1/p" | head -1
}

# ══════════════════════════════════════════════════════════════════
banniere

# ─── Le serveur répond-il ? ────────────────────────────────────────
if ! curl -s -m 3 "$BASE/healthcheck" >/dev/null 2>&1; then
  mourir "Aucun serveur sur $BASE" "Lance « npm run dev » dans un autre terminal."
fi

# ─── 1. Connexion animateur ────────────────────────────────────────
titre "Animateur"
REP=$(curl -s -c "$JAR" -X POST "$BASE/api/utilisateurs/tokens" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"mot_de_passe\":\"$MDP\"}")

if ! grep -q "token" "$JAR" 2>/dev/null; then
  ko "connexion refusée"
  fin
  mourir "Impossible de connecter $EMAIL" "Réponse : $REP"
fi
ok "connecté — $D$EMAIL$R"

# ─── 2. Création de la session ─────────────────────────────────────
REP=$(curl -s -b "$JAR" -X POST "$BASE/api/sessions" \
  -H "Content-Type: application/json" \
  -d "{\"id_themes\": $THEMES}")

ID_SESSION=$(champ "$REP" "id")
CODE=$(champ "$REP" "code_acces")

if [ -z "$ID_SESSION" ] || [ -z "$CODE" ]; then
  ko "création de session refusée"
  fin
  mourir "Session non créée" "Réponse : $REP"
fi
ok "session $B#$ID_SESSION$R — code d'accès $B$CODE$R"
fin

# ─── 3. Les joueurs rejoignent ─────────────────────────────────────
titre "Joueurs"
PSEUDOS=(Alice Bob Chloé David Emma Farid Gina Hugo)
IDS=()
for ((j=0; j<JOUEURS; j++)); do
  PSEUDO="${PSEUDOS[$((j % ${#PSEUDOS[@]}))]}"
  REP=$(curl -s -D "$TOKENS_DIR/h$j" -X POST "$BASE/api/participants" \
    -H "Content-Type: application/json" \
    -d "{\"code_acces\": $CODE, \"pseudo\": \"$PSEUDO\"}")

  PID=$(champ "$REP" "id")
  TOK=$(sed -n 's/.*token_participant=\([^;]*\).*/\1/p' "$TOKENS_DIR/h$j" | head -1)

  if [ -z "$PID" ]; then
    ko "$PSEUDO n'a pas pu rejoindre — $D$REP$R"
    continue
  fi

  IDS+=("$PID")
  echo "$TOK" > "$TOKENS_DIR/token$j"
  ok "$B$PSEUDO$R rejoint (id $PID)"
done

if [ ${#IDS[@]} -eq 0 ]; then
  fin
  mourir "Aucun joueur inscrit" "La partie ne peut pas démarrer."
fi
fin

# ─── Pause pour brancher les observateurs ──────────────────────────
printf '\n%s  ┌────────────────────────────────────────────────────────┐%s\n' "$BL$B" "$R"
printf '%s  │%s  Branche tes observateurs WebSocket maintenant          %s│%s\n' "$BL$B" "$R" "$BL$B" "$R"
printf '%s  └────────────────────────────────────────────────────────┘%s\n\n' "$BL$B" "$R"
for ((j=0; j<${#IDS[@]}; j++)); do
  [ -f "$TOKENS_DIR/token$j" ] || continue
  PSEUDO="${PSEUDOS[$((j % ${#PSEUDOS[@]}))]}"
  WSURL="${BASE/http:\/\//ws://}"
  printf '%s  # %s%s\n' "$D" "$PSEUDO" "$R"
  printf '  npx wscat -c %s/ws -H "Cookie: token_participant=%s"\n\n' \
    "$WSURL" "$(cat "$TOKENS_DIR/token$j")"
done
printf '  %sEntrée pour lancer la partie%s (Ctrl+C pour arrêter) ' "$B" "$R"
read -r _

# ─── 4. Démarrage ──────────────────────────────────────────────────
titre "Coup d'envoi"
REP=$(curl -s -b "$JAR" -X POST "$BASE/api/sessions/$ID_SESSION/demarrage")
if echo "$REP" | grep -q '"erreur"'; then
  ko "démarrage refusé — $D$REP$R"
  fin
  exit 1
fi
ok "partie démarrée"
push "session.demarree diffusé à ${#IDS[@]} joueur(s)"
fin

# ─── 5. Les manches ────────────────────────────────────────────────
for ((m=1; m<=MANCHES; m++)); do
  titre "Manche $m / $MANCHES"

  for ((q=1; q<=QUESTIONS; q++)); do
    REP=$(curl -s -b "$JAR" -X POST "$BASE/api/sessions/$ID_SESSION/questions" \
      -H "Content-Type: application/json" \
      -d "{\"numero_manche\": $m, \"ordre\": $q}")

    IDQ=$(champ "$REP" "id_question")
    if [ -z "$IDQ" ]; then
      ko "question $q non ouverte — $D$REP$R"
      continue
    fi

    ENONCE=$(echo "$REP" | sed -n 's/.*"enonce":"\([^"]*\)".*/\1/p')
    etape "$B Q$q$R  $ENONCE"
    push "question.ouverte → versParticipant — 1 payload par joueur + server_now"

    # Chaque joueur répond au hasard, immédiatement (le timer court)
    for ((j=0; j<${#IDS[@]}; j++)); do
      CHOIX=$(( (RANDOM % 4) + 1 ))
      curl -s -o /dev/null -X POST "$BASE/api/participants/${IDS[$j]}/reponses" \
        -H "Content-Type: application/json" \
        -H "Cookie: token_participant=$(cat "$TOKENS_DIR/token$j" 2>/dev/null)" \
        -d "{\"id_question\": $IDQ, \"index_choisi\": $CHOIX}"
    done
    ok "${#IDS[@]} réponse(s) enregistrée(s)"

    REP=$(curl -s -b "$JAR" -X DELETE "$BASE/api/sessions/$ID_SESSION/questions/courante")
    BONNE=$(champ "$REP" "index_bonne_reponse")
    ok "clôturée — bonne réponse : $B$BONNE$R"
    push "question.cloturee  → versSession    — correction commune (avec la solution)"
    push "question.mon_resultat → versParticipant — score personnel, canal privé"
  done

  # Fin de manche : classement + distribution des cartes
  REP=$(curl -s -b "$JAR" -X POST "$BASE/api/sessions/$ID_SESSION/manches/courante/cloture")
  if echo "$REP" | grep -q '"erreur"'; then
    ko "clôture de manche refusée — $D$REP$R"
  else
    ok "manche close — classement établi, cartes distribuées"
    push "manche.cloturee — classement (sans révéler quelle carte)"
  fi

  # Fenêtre de cartes puis manche suivante
  if [ "$m" -lt "$MANCHES" ]; then
    curl -s -o /dev/null -b "$JAR" -X POST "$BASE/api/sessions/$ID_SESSION/fenetre-cartes"
    ok "fenêtre de cartes ouverte"
    push "cartes.fenetre_ouverte → versSession — { duree_ms }"

    # Chaque porteur d'une carte la joue : c'est ce qui rend visible la
    # personnalisation des payloads à la manche suivante (§6 des règles).
    JOUEES=0
    for ((j=0; j<${#IDS[@]}; j++)); do
      COOKIE="token_participant=$(cat "$TOKENS_DIR/token$j" 2>/dev/null)"
      MAIN=$(curl -s -H "Cookie: $COOKIE" "$BASE/api/participants/${IDS[$j]}/cartes")
      IDREC=$(champ "$MAIN" "id_reception")
      [ -z "$IDREC" ] && continue

      # Un malus se lance sur une cible ; l'API la refuse pour un bonus.
      CIBLES=$(curl -s -H "Cookie: $COOKIE" "$BASE/api/participants/${IDS[$j]}/cibles")
      IDCIBLE=$(champ "$CIBLES" "id")

      if [ -n "$IDCIBLE" ]; then
        CORPS="{\"id_reception\": $IDREC, \"id_cible\": $IDCIBLE}"
      else
        CORPS="{\"id_reception\": $IDREC}"
      fi

      REP=$(curl -s -X POST "$BASE/api/participants/${IDS[$j]}/cartes" \
        -H "Content-Type: application/json" -H "Cookie: $COOKIE" -d "$CORPS")

      if ! echo "$REP" | grep -q '"erreur"'; then
        JOUEES=$((JOUEES + 1))
        push "carte.jouee → versSession — attaque annoncée publiquement"
      fi
    done
    [ "$JOUEES" -eq 0 ] && etape "$D aucune carte en main à jouer$R"

    curl -s -o /dev/null -b "$JAR" -X DELETE "$BASE/api/sessions/$ID_SESSION/fenetre-cartes"
    curl -s -o /dev/null -b "$JAR" -X POST "$BASE/api/sessions/$ID_SESSION/manches/suivante"
    ok "passage en manche $((m + 1))"
  fi
  fin
done

# ─── 6. Fin de partie ──────────────────────────────────────────────
titre "Fin de partie"
REP=$(curl -s -b "$JAR" -X POST "$BASE/api/sessions/$ID_SESSION/fin")
if echo "$REP" | grep -q '"erreur"'; then
  ko "clôture refusée — $D$REP$R"
else
  ok "partie terminée"
  push "session.terminee → versSession — statut « terminee »"
fi

CLA=$(curl -s "$BASE/api/sessions/$ID_SESSION/classement")
fin

printf '\n%s  ╔══════════════════════════════════════╗%s\n' "$GN$B" "$R"
printf '%s  ║           CLASSEMENT FINAL           ║%s\n' "$GN$B" "$R"
printf '%s  ╚══════════════════════════════════════╝%s\n\n' "$GN$B" "$R"

RANG=0
# « || [ -n "$ligne" ] » : sans lui, la dernière ligne (sans \n final) serait ignorée.
while IFS= read -r ligne || [ -n "$ligne" ]; do
  P=$(printf '%s' "$ligne" | sed -n 's/.*"pseudo":"\([^"]*\)".*/\1/p')
  [ -z "$P" ] && continue
  S=$(printf '%s' "$ligne" | sed -n 's/.*"points"[[:space:]]*:[[:space:]]*\(-\{0,1\}[0-9]\{1,\}\).*/\1/p')
  RANG=$((RANG + 1))
  case $RANG in
    1) MEDAILLE="🥇" ;;
    2) MEDAILLE="🥈" ;;
    3) MEDAILLE="🥉" ;;
    *) MEDAILLE="  " ;;
  esac
  printf '   %s  %s%-14s%s %s%4s pts%s\n' "$MEDAILLE" "$B" "$P" "$R" "$YL" "${S:-0}" "$R"
done < <(printf '%s' "$CLA" | tr '{' '\n' | tr -d '[]')

printf '\n%s  Session #%s — code %s%s\n' "$D" "$ID_SESSION" "$CODE" "$R"

# ─── Rappel des événements diffusés ────────────────────────────────
printf '\n%s  Événements diffusés pendant cette partie :%s\n' "$B" "$R"
printf '%s   versSession      participant.rejoint · session.demarree · question.cloturee\n' "$D"
printf '                    manche.cloturee · cartes.fenetre_ouverte · carte.jouee\n'
printf '                    session.terminee · participant.parti\n'
printf '   versParticipant  question.ouverte (+ server_now) · question.mon_resultat%s\n\n' "$R"
