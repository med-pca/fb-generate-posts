#!/usr/bin/env bash
# Vérifie le parcours en deux temps sur une API déployée :
#
#   1. le lot réservé ne contient PAS l'URL, seulement image + description,
#      et le texte du commentaire ;
#   2. published -> commented -> complete bascule le job en AWAITING_LINK ;
#   3. l'URL n'est livrée qu'après la clôture, puis link-updated finalise
#      le job en COMPLETED.
#
# Vérifie aussi qu'un profil déjà occupé est écarté d'une réservation par lot :
# c'est la garantie qui empêche deux threads de piloter le même compte.
#
# Aucune donnée réelle n'est touchée : le script crée son propre profil, son
# propre groupe et son propre post, et la réservation filtre sur ce couple.
# Tout est supprimé à la fin (la suppression du profil cascade sur les posts,
# les cibles et les items de job).
#
# Usage :
#   export API_BASE=https://post.pulserecipe.com/api
#   export ADMIN_USERNAME=... ADMIN_PASSWORD=... AUTOMATION_API_KEY=...
#   ./scripts/smoke-comment-link.sh

set -euo pipefail

API_BASE="${API_BASE:-http://localhost:3000/api}"
: "${ADMIN_USERNAME:?ADMIN_USERNAME est requis}"
: "${ADMIN_PASSWORD:?ADMIN_PASSWORD est requis}"
: "${AUTOMATION_API_KEY:?AUTOMATION_API_KEY est requis}"

SUFFIX="$(date +%s)-$$"
EXTERNAL_ID="smoke-link-${SUFFIX}"
ARTICLE_URL="https://exemple.test/recette-${SUFFIX}"
PROFILE_ID=""
GROUP_ID=""
FAILURES=0

json() { python3 -c "import json,sys; d=json.load(sys.stdin); print(d$1 if d else '')" 2>/dev/null || true; }

cleanup() {
  echo
  echo "--- Nettoyage ---"
  if [ -n "$PROFILE_ID" ]; then
    code=$(curl -s -m 30 -o /dev/null -w '%{http_code}' -X DELETE \
      -H "Authorization: Bearer $TOKEN" "$API_BASE/profiles/$PROFILE_ID")
    echo "profil de test supprimé (HTTP $code) - posts, cibles et job en cascade"
  fi
  if [ -n "$GROUP_ID" ]; then
    code=$(curl -s -m 30 -o /dev/null -w '%{http_code}' -X DELETE \
      -H "Authorization: Bearer $TOKEN" "$API_BASE/groups/$GROUP_ID")
    echo "groupe de test supprimé (HTTP $code)"
  fi
}

step() { printf '\n== %s\n' "$1"; }

expect() { # expect <attendu-regex> <obtenu> <libellé>
  if [[ "$2" =~ $1 ]]; then
    echo "   OK   $3 ($2)"
  else
    echo "   ÉCHEC $3 : attendu $1, obtenu $2"
    FAILURES=$((FAILURES + 1))
  fi
}

auto_post() { # auto_post <url> [body] -> corps de la réponse
  local body="${2-}"
  [ -n "$body" ] || body='{}'
  curl -s -m 30 -X POST "$1" \
    -H "X-API-Key: $AUTOMATION_API_KEY" -H 'Content-Type: application/json' -d "$body"
}

auto_code() { # auto_code <url> [body] -> code HTTP
  local body="${2-}"
  [ -n "$body" ] || body='{}'
  curl -s -m 30 -o /dev/null -w '%{http_code}' -X POST "$1" \
    -H "X-API-Key: $AUTOMATION_API_KEY" -H 'Content-Type: application/json' -d "$body"
}

auto_get() { curl -s -m 30 "$1" -H "X-API-Key: $AUTOMATION_API_KEY"; }
auto_get_code() { curl -s -m 30 -o /dev/null -w '%{http_code}' "$1" -H "X-API-Key: $AUTOMATION_API_KEY"; }

echo "API : $API_BASE"

step "Connexion admin"
LOGIN=$(curl -s -m 30 -X POST "$API_BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASSWORD\"}")
TOKEN=$(printf '%s' "$LOGIN" | json "['accessToken']")
if [ -z "$TOKEN" ]; then
  echo "   ÉCHEC : pas de jeton admin. Vérifie ADMIN_USERNAME / ADMIN_PASSWORD."
  exit 1
fi
echo "   OK   jeton obtenu"
trap cleanup EXIT

AUTH=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')

step "Création du profil de test (1 post par job)"
PROFILE=$(curl -s -m 30 -X POST "$API_BASE/profiles" "${AUTH[@]}" \
  -d "{\"name\":\"SMOKE LINK $SUFFIX\",\"externalId\":\"$EXTERNAL_ID\",\"minPostsPerJob\":1,\"maxPostsPerJob\":1}")
PROFILE_ID=$(printf '%s' "$PROFILE" | json "['id']")
[ -n "$PROFILE_ID" ] || { echo "   ÉCHEC : $PROFILE"; exit 1; }
echo "   OK   profil $PROFILE_ID"

step "Création du groupe de test"
GROUP=$(curl -s -m 30 -X POST "$API_BASE/profiles/$PROFILE_ID/groups" "${AUTH[@]}" \
  -d "{\"name\":\"SMOKE GROUP $SUFFIX\",\"externalId\":\"smoke-link-group-$SUFFIX\",\"url\":\"https://facebook.com/groups/smoke-$SUFFIX\"}")
GROUP_ID=$(printf '%s' "$GROUP" | json "['id']")
[ -n "$GROUP_ID" ] || { echo "   ÉCHEC : $GROUP"; exit 1; }
echo "   OK   groupe $GROUP_ID"

step "Création du post de test (avec une URL à placer plus tard)"
POST=$(curl -s -m 30 -X POST "$API_BASE/posts" "${AUTH[@]}" \
  -d "{\"profileId\":\"$PROFILE_ID\",\"title\":\"SMOKE\",\"description\":\"description de smoke\",\"url\":\"$ARTICLE_URL\",\"delay\":0,\"groupIds\":[\"$GROUP_ID\"]}")
POST_ID=$(printf '%s' "$POST" | json "['id']")
[ -n "$POST_ID" ] || { echo "   ÉCHEC : $POST"; exit 1; }
echo "   OK   post $POST_ID"

step "Réservation : le lot ne doit contenir NI url NI lien"
CLAIM=$(auto_post "$API_BASE/jobs/claim" "{\"profileId\":\"$PROFILE_ID\",\"groupId\":\"$GROUP_ID\"}")
JOB_ID=$(printf '%s' "$CLAIM" | json "['jobId']")
if [ -z "$JOB_ID" ]; then
  echo "   ÉCHEC : pas de job réservé. Réponse : $CLAIM"
  exit 1
fi
POST_ID=$(printf '%s' "$CLAIM" | json "['posts'][0]['id']")
HAS_URL=$(printf '%s' "$CLAIM" | python3 -c "import json,sys; print('url' in json.load(sys.stdin)['posts'][0])")
COMMENT_TEXT=$(printf '%s' "$CLAIM" | json "['posts'][0]['comment']['text']")
WILL_LINK=$(printf '%s' "$CLAIM" | json "['posts'][0]['comment']['willReceiveLink']")
echo "   OK   job $JOB_ID"
expect '^False$' "$HAS_URL" "aucune URL dans le lot réservé"
expect '^description de smoke$' "$COMMENT_TEXT" "le commentaire reprend la description"
expect '^True$' "$WILL_LINK" "le commentaire est annoncé comme recevant le lien"

step "Réservation par lot : le profil occupé doit être écarté"
BATCH=$(auto_post "$API_BASE/jobs/claim/batch" "{\"profileExternalIds\":[\"$EXTERNAL_ID\"]}")
BATCH_STATUS=$(printf '%s' "$BATCH" | json "['skipped'][0]['status']")
expect '^busy$' "$BATCH_STATUS" "un profil déjà en cours n'est pas re-réservé"

step "published (image + description, sans lien)"
expect '^2[0-9][0-9]$' \
  "$(auto_code "$API_BASE/jobs/$JOB_ID/posts/$POST_ID/published" '{"externalPostUrl":"https://www.facebook.com/groups/1/posts/2/"}')" \
  "publication confirmée"

step "L'URL ne doit PAS être livrée avant la clôture"
expect '^400$' "$(auto_get_code "$API_BASE/jobs/$JOB_ID/link-updates")" \
  "link-updates refusé tant que le job est réservé"

step "commented (description seule)"
expect '^2[0-9][0-9]$' \
  "$(auto_code "$API_BASE/jobs/$JOB_ID/posts/$POST_ID/commented" '{"commentExternalId":"smoke-comment-1"}')" \
  "commentaire enregistré"

step "complete -> AWAITING_LINK"
COMPLETE=$(auto_post "$API_BASE/jobs/$JOB_ID/complete")
expect '^AWAITING_LINK$' "$(printf '%s' "$COMPLETE" | json "['status']")" \
  "le job attend la bascule des commentaires"
expect '^1$' "$(printf '%s' "$COMPLETE" | json "['awaitingLink']")" "un commentaire à basculer"

step "L'URL est livrée après la validation de tous"
UPDATES=$(auto_get "$API_BASE/jobs/$JOB_ID/link-updates")
expect "^${ARTICLE_URL}$" "$(printf '%s' "$UPDATES" | json "['updates'][0]['url']")" "l'URL de l'article"
expect '^smoke-comment-1$' "$(printf '%s' "$UPDATES" | json "['updates'][0]['commentExternalId']")" \
  "le commentaire à modifier"

step "File globale des commentaires en attente"
PENDING=$(auto_get "$API_BASE/jobs/link-updates?profileExternalId=$EXTERNAL_ID")
expect "^${JOB_ID}$" "$(printf '%s' "$PENDING" | json "[0]['jobId']")" "le job apparaît dans la file"

step "link-updated -> le job se finalise"
LINKED=$(auto_post "$API_BASE/jobs/$JOB_ID/posts/$POST_ID/link-updated")
expect '^0$' "$(printf '%s' "$LINKED" | json "['remaining']")" "plus rien en attente"
expect '^COMPLETED$' "$(printf '%s' "$(auto_get "$API_BASE/jobs/$JOB_ID/link-updates")" | json "['status']")" \
  "job clôturé en COMPLETED"

step "link-updated rejoué (idempotence)"
expect '^2[0-9][0-9]$' "$(auto_code "$API_BASE/jobs/$JOB_ID/posts/$POST_ID/link-updated")" \
  "seconde confirmation tolérée"

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "RÉSULTAT : le parcours post -> commentaire -> URL fonctionne de bout en bout."
else
  echo "RÉSULTAT : $FAILURES vérification(s) en échec."
fi
exit "$FAILURES"
